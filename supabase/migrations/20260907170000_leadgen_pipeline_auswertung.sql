-- Was aus einem Lead geworden ist, im Admin-Bereich nachlesbar.
--
-- Bisher endete die Auskunft beim Status: `contacted` heisst, dass etwas
-- rausging, aber nicht, gegen welchen Katalogstand abgeglichen wurde, wie
-- viele Profile passten, welcher Link in der Mail stand und was zugestellt
-- wurde. Das Meiste davon entstand im Tageslauf und starb mit dem
-- Funktionsende.
--
-- Drei Ergaenzungen, keine neue Wahrheit:
--
--  1. Der Beleg zur Mail wird vollstaendig: der Portal-Link, wie er wirklich
--     drinstand, und wer den Versand angestossen hat.
--  2. Der Lauf hinterlaesst eine Zeile, damit "gestern lief nichts" eine
--     belegbare Aussage ist und keine Vermutung.
--  3. Die Liste liefert das Matching mit, das ohnehin in `shortlists` steht.

begin;

-- 1. Der Beleg zur Mail -----------------------------------------------------
--
-- `cta_url` wird gespeichert und nicht neu gerechnet. `leadHeadline()` darf
-- sich aendern; was in einer verschickten Mail stand, darf sich nicht
-- aendern. Genau dafuer ist diese Zeile der Beleg.

alter table public.leadgen_outreach
  add column if not exists cta_url text,
  add column if not exists origin text;

comment on column public.leadgen_outreach.cta_url is
  'Der Portal-Link, wie er in dieser Nachricht stand. Beleg, nicht Ableitung.';
comment on column public.leadgen_outreach.origin is
  'Wer den Versand angestossen hat: scheduler aus dem Tageslauf, admin aus '
  'der Arbeitsflaeche. Leer bei Zeilen aus der Zeit davor.';

alter table public.leadgen_outreach
  drop constraint if exists leadgen_outreach_origin_check;
alter table public.leadgen_outreach
  add constraint leadgen_outreach_origin_check
  check (origin is null or origin in ('scheduler', 'admin'));

alter table public.leadgen_outreach
  drop constraint if exists leadgen_outreach_cta_url_length_check;
alter table public.leadgen_outreach
  add constraint leadgen_outreach_cta_url_length_check
  check (cta_url is null or char_length(cta_url) between 1 and 2000);

-- Die alte Signatur faellt weg, sobald die neue steht: Zwei Fassungen
-- nebeneinander waeren mehrdeutig, und PostgREST waehlt dann nach Argumenten
-- statt nach Absicht.
create or replace function public.claim_leadgen_outreach(
  p_lead_id bigint,
  p_subject text,
  p_body text,
  p_model text,
  p_credits integer,
  p_created_by uuid,
  p_cta_url text,
  p_origin text
)
returns table (claimed boolean, reason text, outreach_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_lead_id is null or p_subject is null or p_body is null then
    return query select false, 'invalid_input'::text, null::uuid;
    return;
  end if;

  perform 1 from public.leadgen_queue where id = p_lead_id for update;
  if not found then
    return query select false, 'lead_not_found'::text, null::uuid;
    return;
  end if;

  begin
    insert into public.leadgen_outreach (
      lead_id, state, subject, body, model, credits, created_by,
      cta_url, origin
    ) values (
      p_lead_id, 'sending', p_subject, p_body, p_model, p_credits,
      p_created_by, p_cta_url,
      case when p_origin in ('scheduler', 'admin') then p_origin else null end
    )
    returning id into v_id;
  exception when unique_violation then
    return query select false, 'already_sent'::text, null::uuid;
    return;
  end;

  return query select true, null::text, v_id;
end;
$$;

revoke all on function public.claim_leadgen_outreach(
  bigint, text, text, text, integer, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.claim_leadgen_outreach(
  bigint, text, text, text, integer, uuid, text, text
) to service_role;

drop function if exists public.claim_leadgen_outreach(
  bigint, text, text, text, integer, uuid
);

-- 2. Was ein Lauf getan hat -------------------------------------------------
--
-- Keine personenbezogenen Daten: nur Zaehler und ein Abbruchgrund. Deshalb
-- steht die Tabelle auch nicht in der Aufbewahrungsroutine -- es gibt nichts
-- zu loeschen, was jemanden betrifft.
--
-- Eintraege entstehen nur fuer Laeufe, die etwas angesehen haben. Der
-- Zeitgeber weckt die Route oefter, als das Fenster offen ist; diese Aufrufe
-- als Zeilen zu fuehren hiesse, das Protokoll mit Nichtereignissen zu
-- fuellen.

create table if not exists public.leadgen_run (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  trigger text not null check (trigger in ('scheduler', 'admin')),
  dry_run boolean not null default false,
  examined integer not null default 0 check (examined >= 0),
  sent integer not null default 0 check (sent >= 0),
  archived integer not null default 0 check (archived >= 0),
  skipped integer not null default 0 check (skipped >= 0),
  remaining integer not null default 0 check (remaining >= 0),
  daily_budget_left integer not null default 0 check (daily_budget_left >= 0),
  stopped_by text not null check (
    stopped_by in ('queue_empty', 'time', 'examined', 'daily_limit', 'outside_window')
  )
);

comment on table public.leadgen_run is
  'Ein Durchgang des Lead-Abgleichs: was er angesehen, verschickt und '
  'archiviert hat und warum er aufgehoert hat. Nur Zaehler, keine Empfaenger.';

create index if not exists leadgen_run_started_idx
  on public.leadgen_run (started_at desc);

alter table public.leadgen_run enable row level security;
alter table public.leadgen_run force row level security;
revoke all on public.leadgen_run from public, anon, authenticated;
grant select, insert on public.leadgen_run to service_role;

-- 3. Die Liste mit Matching und Versand -------------------------------------
--
-- Das Matching kommt aus `shortlists`. Eine eigene Spalte auf dem Lead waere
-- eine Kopie, die irgendwann etwas anderes sagt als die Auswertung, die aus
-- derselben Tabelle liest.

drop function if exists public.admin_list_leadgen_queue(
  text, text, text, text, integer, integer
);

create or replace function public.admin_list_leadgen_queue(
  p_search text default null,
  p_status text default null,
  p_category text default null,
  p_scope text default 'open',
  p_match text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id bigint,
  recipient_email text,
  recipient_name text,
  company text,
  stellenanzeige text,
  status text,
  category text,
  notes text,
  archived_at timestamptz,
  last_contacted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  outreach_state text,
  outreach_subject text,
  outreach_body text,
  outreach_created_at timestamptz,
  outreach_sent_at timestamptz,
  outreach_failure_reason text,
  outreach_origin text,
  outreach_cta_url text,
  match_status text,
  match_count integer,
  match_primary_profile_id uuid,
  match_open_requirements jsonb,
  matched_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with angereichert as (
    select
      q.*,
      s.result_status as match_status,
      s.result_count as match_count,
      nullif(s.decision_snapshot ->> 'primaryProfileId', '')::uuid
        as match_primary_profile_id,
      coalesce(s.decision_snapshot -> 'openCoreRequirements', '[]'::jsonb)
        as match_open_requirements,
      s.created_at as matched_at
      from public.leadgen_queue q
      left join lateral (
        select l.result_status, l.result_count, l.decision_snapshot, l.created_at
          from public.shortlists l
         where l.lead_id = q.id
         order by l.created_at desc
         limit 1
      ) s on true
  ),
  filtered as (
    select a.*
      from angereichert a
     where (
             p_scope = 'all'
             or (p_scope = 'open' and a.archived_at is null)
             or (p_scope = 'archived' and a.archived_at is not null)
           )
       and (p_status is null or a.status = p_status)
       and (p_category is null or a.category = p_category)
       and (
             p_search is null
             or a.search_text ilike '%' || p_search || '%'
           )
       -- Drei Zustaende, die eine Zeile beim Matching haben kann. `open`
       -- meint: noch nie abgeglichen -- das ist etwas anderes als "kein
       -- Treffer" und darf nicht mit ihm in einen Topf.
       and (
             p_match is null
             or (p_match = 'hit' and a.match_status = 'ranked')
             or (p_match = 'no_hit'
                 and a.match_status is not null
                 and a.match_status <> 'ranked')
             or (p_match = 'open' and a.match_status is null)
           )
  ),
  counted as (
    select count(*) as total from filtered
  )
  select
    f.id,
    f.recipient_email,
    f.recipient_name,
    f.company,
    f.stellenanzeige,
    f.status,
    f.category,
    f.notes,
    f.archived_at,
    f.last_contacted_at,
    f.created_at,
    f.updated_at,
    o.state as outreach_state,
    o.subject as outreach_subject,
    o.body as outreach_body,
    o.created_at as outreach_created_at,
    o.sent_at as outreach_sent_at,
    o.failure_reason as outreach_failure_reason,
    o.origin as outreach_origin,
    o.cta_url as outreach_cta_url,
    f.match_status,
    f.match_count::integer,
    f.match_primary_profile_id,
    f.match_open_requirements,
    f.matched_at,
    counted.total as total_count
  from filtered f
  cross join counted
  left join lateral (
    select l.state, l.subject, l.body, l.created_at, l.sent_at,
           l.failure_reason, l.origin, l.cta_url
      from public.leadgen_outreach l
     where l.lead_id = f.id
     -- Die zugestellte Fassung schlaegt den Entwurf: Wer nachliest, will
     -- wissen, was rausging, nicht was daneben noch herumliegt.
     order by (l.state = 'sent') desc, l.created_at desc
     limit 1
  ) o on true
  order by
    case when f.archived_at is null then f.created_at else f.archived_at end desc,
    f.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.admin_list_leadgen_queue(
  text, text, text, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.admin_list_leadgen_queue(
  text, text, text, text, text, integer, integer
) to service_role;

-- 4. Der Trichter -----------------------------------------------------------
--
-- Eine Abfrage statt sechs, weil die Zahlen zusammen gelesen werden: "von
-- 251 abgeglichen 68, davon 15 verschickt" ist eine Aussage, drei einzelne
-- Zahlen sind es nicht.
--
-- `verschickt_heute` rechnet in Ortszeit. Das Tageslimit gehoert dem Tag in
-- Kaufbeuren und nicht dem in UTC, der zwei Stunden frueher beginnt.

create or replace function public.admin_leadgen_pipeline_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with tagesbeginn as (
    select (date_trunc('day', now() at time zone 'Europe/Berlin'))
             at time zone 'Europe/Berlin' as ab
  ),
  leads as (
    select
      count(*) as gesamt,
      count(*) filter (where archived_at is null) as offen,
      count(*) filter (where archived_at is not null) as archiviert,
      count(*) filter (where status = 'replied') as beantwortet
      from public.leadgen_queue
  ),
  abgleich as (
    select
      count(*) as abgeglichen,
      count(*) filter (where result_status = 'ranked') as treffer,
      count(*) filter (where result_status <> 'ranked') as ohne_treffer
      from public.shortlists
     where source = 'lead'
  ),
  post as (
    select
      count(*) filter (where state = 'sent') as verschickt,
      count(*) filter (where state = 'failed') as gescheitert,
      count(*) filter (where state = 'draft') as entwuerfe,
      count(*) filter (
        where state = 'sent' and sent_at >= (select ab from tagesbeginn)
      ) as verschickt_heute,
      max(sent_at) filter (where state = 'sent') as zuletzt_verschickt
      from public.leadgen_outreach
  )
  select jsonb_build_object(
    'gesamt', leads.gesamt,
    'offen', leads.offen,
    'archiviert', leads.archiviert,
    'beantwortet', leads.beantwortet,
    'abgeglichen', abgleich.abgeglichen,
    'treffer', abgleich.treffer,
    'ohne_treffer', abgleich.ohne_treffer,
    'verschickt', post.verschickt,
    'gescheitert', post.gescheitert,
    'entwuerfe', post.entwuerfe,
    'verschickt_heute', post.verschickt_heute,
    'zuletzt_verschickt', post.zuletzt_verschickt
  )
  from leads, abgleich, post;
$$;

revoke all on function public.admin_leadgen_pipeline_summary()
  from public, anon, authenticated;
grant execute on function public.admin_leadgen_pipeline_summary()
  to service_role;

notify pgrst, 'reload schema';

commit;
