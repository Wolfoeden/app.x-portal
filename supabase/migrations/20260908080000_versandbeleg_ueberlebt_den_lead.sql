-- Der Versandbeleg muss das Loeschen des Leads ueberstehen.
--
-- Am Morgen des 8. September verschwanden 234 Leads aus der Warteschlange --
-- nicht durch die Aufbewahrungsroutine, die meldet fuer denselben Tag null,
-- sondern durch etwas ausserhalb dieser Anwendung. Der Fremdschluessel von
-- `leadgen_outreach` loeschte mit `on delete cascade`: Jeder Beleg zu einem
-- dieser Leads ging mit, samt Empfaenger, Betreff und Wortlaut.
--
-- Wie viele es an dem Morgen traf, laesst sich nicht mehr feststellen -- was
-- geloescht ist, hinterlaesst keine Spur. Genau das ist der Punkt: Ein
-- Versandprotokoll, das eine fremde Loeschung nicht uebersteht, ist keins.
--
-- Was verschickt wurde, ist damit aus der Anwendung nicht mehr zu belegen.
-- Das ist mehr als eine Luecke in einer Liste. Wer eine Werbemail bekommt,
-- darf nach Art. 15 DSGVO fragen, was ueber ihn gespeichert wurde und was
-- ihm geschrieben wurde; eine Antwort setzt voraus, dass es die Zeile noch
-- gibt. Und der eindeutige Index, der einen Lead vor einem zweiten
-- Anschreiben schuetzt, greift nur, solange der erste Versand dokumentiert
-- ist.
--
-- Zwei Aenderungen:
--
--   1. Der Beleg loest sich vom Lead, statt mit ihm zu sterben.
--   2. Er traegt Empfaenger und Firma selbst. Ein Beleg, der nach dem
--      Loeschen des Leads nicht mehr sagt, an wen er ging, ist keiner.

begin;

-- 1. Empfaenger und Firma in den Beleg --------------------------------------
--
-- Eine Kopie, ja. Sie ist hier richtig: Die Spalte im Lead beschreibt, wen
-- wir anschreiben wollen, die Spalte im Beleg, wen wir angeschrieben haben.
-- Das eine darf sich aendern, das andere nicht.

alter table public.leadgen_outreach
  add column if not exists recipient_email text,
  add column if not exists company text;

comment on column public.leadgen_outreach.recipient_email is
  'An wen diese Nachricht ging. Kopie aus dem Lead zum Zeitpunkt des '
  'Versands, damit der Beleg auch ohne ihn vollstaendig bleibt.';
comment on column public.leadgen_outreach.company is
  'Die Firma, wie sie beim Versand im Lead stand.';

-- Fuer die vorhandenen Zeilen nachgetragen, soweit der Lead noch da ist.
update public.leadgen_outreach o
   set recipient_email = q.recipient_email,
       company = q.company
  from public.leadgen_queue q
 where q.id = o.lead_id
   and o.recipient_email is null;

-- 2. Der Beleg loest sich vom Lead ------------------------------------------
--
-- `on delete set null` statt `cascade`, wie es `shortlists` schon haelt. Die
-- Spalte wird dafuer nullbar: Sie sagt danach nichts mehr, aber die Zeile
-- sagt weiterhin alles Wesentliche.

alter table public.leadgen_outreach
  alter column lead_id drop not null;

alter table public.leadgen_outreach
  drop constraint if exists leadgen_outreach_lead_id_fkey;
alter table public.leadgen_outreach
  add constraint leadgen_outreach_lead_id_fkey
  foreign key (lead_id) references public.leadgen_queue (id)
  on delete set null;

comment on column public.leadgen_outreach.lead_id is
  'Der Lead, an den diese Nachricht ging. Bleibt beim Loeschen des Leads '
  'leer -- der Beleg ueber den Versand bleibt trotzdem stehen.';

-- Die eindeutigen Indizes greifen nur auf gesetzte Lead-Kennungen. Ohne die
-- Einschraenkung faenden zwei geloeschte Leads mit je einem Versand einen
-- Konflikt, den es nicht gibt.
drop index if exists public.leadgen_outreach_one_active_idx;
create unique index if not exists leadgen_outreach_one_active_idx
  on public.leadgen_outreach (lead_id)
  where lead_id is not null and state in ('sending', 'sent');

comment on index public.leadgen_outreach_one_active_idx is
  'Ein Lead wird hoechstens einmal angeschrieben. Der Zustand sending belegt '
  'ihn bereits, damit zwei gleichzeitige Laeufe nicht beide zustellen.';

drop index if exists public.leadgen_outreach_one_draft_idx;
create unique index if not exists leadgen_outreach_one_draft_idx
  on public.leadgen_outreach (lead_id)
  where lead_id is not null and state = 'draft';

-- Ein Beleg ohne Lead wird ueber den Empfaenger gefunden. Ohne Index waere
-- die Versandliste ein vollstaendiger Durchlauf.
create index if not exists leadgen_outreach_recipient_idx
  on public.leadgen_outreach (recipient_email)
  where recipient_email is not null;

create index if not exists leadgen_outreach_sent_idx
  on public.leadgen_outreach (sent_at desc)
  where state = 'sent';

-- 3. Was verschickt wurde, unabhaengig vom Lead -----------------------------
--
-- Die Versandliste liest aus dem Beleg und nicht aus der Warteschlange. Ein
-- Lead, den es nicht mehr gibt, hat trotzdem eine Nachricht bekommen, und
-- genau das soll die Liste zeigen.

create or replace function public.admin_list_leadgen_outreach(
  p_state text default 'sent',
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  outreach_id uuid,
  lead_id bigint,
  lead_vorhanden boolean,
  recipient_email text,
  company text,
  state text,
  subject text,
  body text,
  cta_url text,
  origin text,
  model text,
  credits integer,
  created_at timestamptz,
  sent_at timestamptz,
  prepared_at timestamptz,
  prepared_profile_id uuid,
  failure_reason text,
  stellenanzeige text,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with gefiltert as (
    select o.*, q.stellenanzeige, (q.id is not null) as lead_vorhanden
      from public.leadgen_outreach o
      left join public.leadgen_queue q on q.id = o.lead_id
     where (p_state is null or o.state = p_state)
       and (
         p_search is null
         or coalesce(o.recipient_email, '') ilike '%' || p_search || '%'
         or coalesce(o.company, '') ilike '%' || p_search || '%'
         or o.subject ilike '%' || p_search || '%'
       )
  ),
  gezaehlt as (
    select count(*) as total from gefiltert
  )
  select
    g.id,
    g.lead_id,
    g.lead_vorhanden,
    g.recipient_email,
    g.company,
    g.state,
    g.subject,
    g.body,
    g.cta_url,
    g.origin,
    g.model,
    g.credits,
    g.created_at,
    g.sent_at,
    g.prepared_at,
    g.prepared_profile_id,
    g.failure_reason,
    g.stellenanzeige,
    gezaehlt.total
  from gefiltert g
  cross join gezaehlt
  -- Der jüngste Versand zuerst; bei Entwuerfen der aelteste, denn der geht
  -- als naechster raus.
  order by
    case when g.state = 'draft' then 0 else 1 end,
    case when g.state = 'draft' then coalesce(g.prepared_at, g.created_at) end asc,
    coalesce(g.sent_at, g.created_at) desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.admin_list_leadgen_outreach(
  text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.admin_list_leadgen_outreach(
  text, text, integer, integer
) to service_role;

-- 4. Der Trichter zaehlt sauber ---------------------------------------------
--
-- Bisher standen Zahlen aus zwei Grundgesamtheiten nebeneinander: `gesamt`
-- zaehlte die Warteschlange, `abgeglichen` die Ergebniszeilen, die den Lead
-- ueberleben. Nach dem Loeschen standen dort "31 gesamt" und "261
-- abgeglichen" -- eine Gegenueberstellung, die niemand lesen kann.
--
-- Getrennt: `queue` beschreibt, was noch zu tun ist, `ergebnis`, was
-- insgesamt geschehen ist. `nicht_abgeglichen` wird gezaehlt und nicht mehr
-- als Differenz gerechnet, die negativ werden kann.

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
      count(*) filter (where status = 'replied') as beantwortet,
      count(*) filter (
        where archived_at is null
          and not exists (
            select 1 from public.shortlists s where s.lead_id = public.leadgen_queue.id
          )
      ) as nicht_abgeglichen
      from public.leadgen_queue
  ),
  abgleich as (
    select
      count(*) as abgeglichen,
      count(*) filter (where result_status = 'ranked') as treffer,
      count(*) filter (where result_status <> 'ranked') as ohne_treffer,
      count(*) filter (where lead_id is null) as abgleich_ohne_lead
      from public.shortlists
     where source = 'lead'
  ),
  post as (
    select
      count(*) filter (where state = 'sent') as verschickt,
      count(*) filter (where state = 'failed') as gescheitert,
      count(*) filter (where state = 'draft') as entwuerfe,
      count(*) filter (where state = 'draft' and origin = 'scheduler')
        as vorbereitet,
      count(*) filter (where state = 'sent' and lead_id is null)
        as beleg_ohne_lead,
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
    'nicht_abgeglichen', leads.nicht_abgeglichen,
    'abgeglichen', abgleich.abgeglichen,
    'treffer', abgleich.treffer,
    'ohne_treffer', abgleich.ohne_treffer,
    'abgleich_ohne_lead', abgleich.abgleich_ohne_lead,
    'verschickt', post.verschickt,
    'gescheitert', post.gescheitert,
    'entwuerfe', post.entwuerfe,
    'vorbereitet', post.vorbereitet,
    'beleg_ohne_lead', post.beleg_ohne_lead,
    'verschickt_heute', post.verschickt_heute,
    'zuletzt_verschickt', post.zuletzt_verschickt
  )
  from leads, abgleich, post;
$$;

revoke all on function public.admin_leadgen_pipeline_summary()
  from public, anon, authenticated;
grant execute on function public.admin_leadgen_pipeline_summary()
  to service_role;

-- 5. Die Aufbewahrung gilt jetzt dem Beleg ----------------------------------
--
-- Solange der Beleg am Lead hing, verschwand er mit ihm. Jetzt braucht er
-- eine eigene Frist, sonst bliebe er fuer immer stehen. Dieselbe Frist wie
-- fuer einen angeschriebenen Lead: ein Jahr als Nachweis.

create or replace function public.run_leadgen_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unhandled_days integer;
  v_contacted_days integer;
  v_unhandled integer := 0;
  v_contacted integer := 0;
  v_belege integer := 0;
  v_result jsonb;
begin
  select retention_days into v_unhandled_days
    from public.retention_policies
   where record_type = 'leadgen_unhandled'
     and is_enabled and deletion_mode = 'hard_delete';

  select retention_days into v_contacted_days
    from public.retention_policies
   where record_type = 'leadgen_contacted'
     and is_enabled and deletion_mode = 'hard_delete';

  if v_unhandled_days is not null then
    delete from public.leadgen_queue
     where last_contacted_at is null
       and created_at < now() - make_interval(days => v_unhandled_days);
    get diagnostics v_unhandled = row_count;
  end if;

  if v_contacted_days is not null then
    delete from public.leadgen_queue
     where last_contacted_at is not null
       and last_contacted_at < now() - make_interval(days => v_contacted_days);
    get diagnostics v_contacted = row_count;

    -- Der Beleg haengt nicht mehr am Lead und braucht deshalb seine eigene
    -- Frist. Gerechnet ab dem Versand, nicht ab dem Anlegen: Ein Entwurf,
    -- der nie rausging, ist kein Nachweis und faellt frueher.
    delete from public.leadgen_outreach
     where state = 'sent'
       and sent_at < now() - make_interval(days => v_contacted_days);
    get diagnostics v_belege = row_count;
  end if;

  v_result := jsonb_build_object(
    'leadgen_unhandled', v_unhandled,
    'leadgen_contacted', v_contacted,
    'leadgen_outreach', v_belege,
    'unhandled_retention_days', coalesce(v_unhandled_days, -1),
    'contacted_retention_days', coalesce(v_contacted_days, -1)
  );

  insert into public.audit_events (
    actor_tombstone, action, target_type, outcome, metadata
  ) values (
    'system:leadgen-retention', 'leadgen_cleanup',
    'leadgen_queue', 'success', v_result
  );

  return v_result;
end;
$$;

revoke all on function public.run_leadgen_cleanup() from public, anon, authenticated;


-- 6. Der Einzelversand traegt den Empfaenger ebenfalls in den Beleg ---------

create or replace function public.claim_leadgen_outreach(
  p_lead_id bigint,
  p_subject text,
  p_body text,
  p_model text,
  p_credits integer,
  p_created_by uuid,
  p_cta_url text,
  p_origin text,
  p_recipient_email text,
  p_company text
)
returns table (claimed boolean, reason text, outreach_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_email text;
  v_company text;
begin
  if p_lead_id is null or p_subject is null or p_body is null then
    return query select false, 'invalid_input'::text, null::uuid;
    return;
  end if;

  select q.recipient_email, q.company into v_email, v_company
    from public.leadgen_queue q
   where q.id = p_lead_id
     for update;
  if not found then
    return query select false, 'lead_not_found'::text, null::uuid;
    return;
  end if;

  begin
    insert into public.leadgen_outreach (
      lead_id, state, subject, body, model, credits, created_by,
      cta_url, origin, recipient_email, company
    ) values (
      p_lead_id, 'sending', p_subject, p_body, p_model, p_credits,
      p_created_by, p_cta_url,
      case when p_origin in ('scheduler', 'admin') then p_origin else null end,
      -- Was der Aufrufer mitgibt, hat Vorrang; sonst der Stand des Leads.
      coalesce(p_recipient_email, v_email),
      coalesce(p_company, v_company)
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
  bigint, text, text, text, integer, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.claim_leadgen_outreach(
  bigint, text, text, text, integer, uuid, text, text, text, text
) to service_role;

drop function if exists public.claim_leadgen_outreach(
  bigint, text, text, text, integer, uuid, text, text
);

notify pgrst, 'reload schema';

commit;
