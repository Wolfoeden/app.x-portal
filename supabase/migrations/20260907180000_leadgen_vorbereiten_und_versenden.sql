-- Abgleich und Versand trennen.
--
-- Bisher tat ein Durchgang beides: eine Ausschreibung gegen den Katalog
-- halten und die Nachricht sofort zustellen. Das koppelt zwei Vorgaenge
-- aneinander, die nichts miteinander zu tun haben.
--
-- Der Abgleich kostet nichts: kein Modell, kein Netz, nur Rechenzeit gegen
-- 72 Profile. Der Versand kostet eine SMTP-Runde je Nachricht und ist bei
-- zwanzig Stueck am Tag gedeckelt, weil ein Postfach bei IONOS sonst im
-- Spamfilter landet. Zusammen in einem Durchgang richtet sich der Abgleich
-- nach dem Deckel des Versands: 251 offene Leads, und ein Durchgang sah
-- fuenfundfuenfzig davon, bevor die Zeitgrenze griff.
--
-- Das hat eine Folge, die ueber den Durchsatz hinausgeht. Eine Ausschreibung,
-- zu der der Katalog niemanden fuehrt, ist die ehrlichste Auskunft darueber,
-- welches Profil fehlt -- und diese Auskunft entstand nur so schnell, wie
-- Werbemails rausgingen. Getrennt liegt sie nach einem Vormittag vollstaendig
-- vor.
--
-- Danach zerfaellt der Vorgang in zwei:
--
--   Vorbereiten  jeden offenen Lead abgleichen. Treffer bekommen einen
--                fertigen Entwurf, Fehlschlaege wandern ins Archiv und in
--                die Nachfrage.
--   Versenden    die vorbereiteten Entwuerfe zustellen, zwanzig am Tag.

begin;

-- 1. Was in einem Entwurf steht ---------------------------------------------
--
-- Ein Entwurf nennt ein bestimmtes Profil mit Rolle, Kompetenzen und
-- Verfuegbarkeit. Zwischen Vorbereitung und Versand liegen Stunden bis Tage,
-- und in dieser Zeit kann das Profil abgelaufen, ausgebucht oder
-- zurueckgezogen sein. Eine Nachricht, die ein nicht mehr buchbares Profil
-- anbietet, ist schlechter als keine.
--
-- Deshalb steht die Kennung des Profils in der Zeile: Der Versand prueft sie
-- gegen den Katalog, bevor er zustellt, und verwirft den Entwurf, wenn sie
-- nicht mehr traegt.

alter table public.leadgen_outreach
  add column if not exists prepared_profile_id uuid,
  add column if not exists prepared_at timestamptz;

comment on column public.leadgen_outreach.prepared_profile_id is
  'Das Profil, das dieser Entwurf anbietet. Der Versand prueft es gegen den '
  'Katalog, bevor er zustellt -- zwischen Vorbereitung und Versand kann es '
  'abgelaufen sein.';
comment on column public.leadgen_outreach.prepared_at is
  'Wann der Entwurf entstand. Aelter als LEAD_DRAFT_MAX_AGE_DAYS wird er '
  'nicht mehr verschickt, sondern neu abgeglichen.';

create index if not exists leadgen_outreach_draft_prepared_idx
  on public.leadgen_outreach (prepared_at)
  where state = 'draft';

-- 2. Einen Entwurf zum Versand beanspruchen ---------------------------------
--
-- `claim_leadgen_outreach` legt eine neue Zeile im Zustand `sending` an. Fuer
-- einen vorbereiteten Entwurf waere das falsch: Die Zeile besteht schon, und
-- eine zweite daneben verletzt entweder den Index oder die Wahrheit.
--
-- Der Uebergang draft -> sending belegt denselben eindeutigen Index wie ein
-- verschickter Eintrag. Damit gilt weiter, was vorher galt: Zwei gleichzeitige
-- Laeufe koennen nicht beide zustellen, weil nur einer den Zustand aendern
-- kann.

create or replace function public.claim_leadgen_draft(
  p_outreach_id uuid
)
returns table (claimed boolean, reason text, lead_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead_id bigint;
begin
  if p_outreach_id is null then
    return query select false, 'invalid_input'::text, null::bigint;
    return;
  end if;

  begin
    update public.leadgen_outreach
       set state = 'sending'
     where id = p_outreach_id
       and state = 'draft'
    returning public.leadgen_outreach.lead_id into v_lead_id;
  exception when unique_violation then
    -- Fuer diesen Lead laeuft bereits ein Versand oder es ging schon etwas
    -- raus. Der Entwurf ist damit gegenstandslos.
    return query select false, 'already_sent'::text, null::bigint;
    return;
  end;

  if v_lead_id is null then
    return query select false, 'not_a_draft'::text, null::bigint;
    return;
  end if;

  return query select true, null::text, v_lead_id;
end;
$$;

revoke all on function public.claim_leadgen_draft(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_leadgen_draft(uuid) to service_role;

-- 3. Einen Entwurf verwerfen ------------------------------------------------
--
-- Wenn das angebotene Profil nicht mehr traegt, faellt der Entwurf weg und
-- der Lead geht zurueck in die Warteschlange. Beim naechsten Vorbereiten
-- wird er gegen den dann gueltigen Katalog neu abgeglichen -- vielleicht
-- passt inzwischen jemand anderes.
--
-- Die Zeile in `shortlists` bleibt stehen. Sie sagt, was der Abgleich an
-- jenem Tag ergeben hat, und das bleibt wahr, auch wenn der Entwurf verfaellt.

create or replace function public.discard_leadgen_draft(
  p_outreach_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead_id bigint;
begin
  delete from public.leadgen_outreach
   where id = p_outreach_id
     and state = 'draft'
  returning lead_id into v_lead_id;

  if v_lead_id is null then
    return false;
  end if;

  -- Zurueck in die Warteschlange, aber nur, wenn der Lead nicht laengst aus
  -- einem anderen Grund abgelegt wurde.
  update public.leadgen_queue
     set status = 'new',
         archived_at = null
   where id = v_lead_id
     and status = 'new';

  return true;
end;
$$;

revoke all on function public.discard_leadgen_draft(uuid, text)
  from public, anon, authenticated;
grant execute on function public.discard_leadgen_draft(uuid, text)
  to service_role;

-- 4. Die vorbereiteten Entwuerfe in der Reihenfolge ihres Alters ------------
--
-- Der Versand nimmt den aeltesten zuerst. Eine Ausschreibung veraltet, und
-- wer zuerst ausgeschrieben hat, wartet am laengsten auf eine Antwort.

create or replace function public.list_leadgen_prepared_drafts(
  p_limit integer default 50
)
returns table (
  outreach_id uuid,
  lead_id bigint,
  recipient_email text,
  subject text,
  body text,
  cta_url text,
  prepared_profile_id uuid,
  prepared_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    o.lead_id,
    q.recipient_email,
    o.subject,
    o.body,
    o.cta_url,
    o.prepared_profile_id,
    o.prepared_at
    from public.leadgen_outreach o
    join public.leadgen_queue q on q.id = o.lead_id
   where o.state = 'draft'
     and o.origin = 'scheduler'
   order by coalesce(o.prepared_at, o.created_at) asc, o.id asc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.list_leadgen_prepared_drafts(integer)
  from public, anon, authenticated;
grant execute on function public.list_leadgen_prepared_drafts(integer)
  to service_role;

-- 5. Der Trichter kennt jetzt einen Schritt mehr ----------------------------

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
      -- Was der Tageslauf vorbereitet hat und noch aussteht. Der Unterschied
      -- zu `entwuerfe` ist die Herkunft: ein von Hand erzeugter Entwurf
      -- wartet auf den Betreiber, kein Zeitgeber holt ihn ab.
      count(*) filter (where state = 'draft' and origin = 'scheduler')
        as vorbereitet,
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
    'vorbereitet', post.vorbereitet,
    'verschickt_heute', post.verschickt_heute,
    'zuletzt_verschickt', post.zuletzt_verschickt
  )
  from leads, abgleich, post;
$$;

revoke all on function public.admin_leadgen_pipeline_summary()
  from public, anon, authenticated;
grant execute on function public.admin_leadgen_pipeline_summary()
  to service_role;

-- 6. Das Laufprotokoll unterscheidet die beiden Vorgaenge -------------------

alter table public.leadgen_run
  add column if not exists kind text not null default 'send';

comment on column public.leadgen_run.kind is
  'Was der Durchgang getan hat: prepare gleicht ab und legt Entwuerfe an, '
  'send stellt sie zu.';

alter table public.leadgen_run
  drop constraint if exists leadgen_run_kind_check;
alter table public.leadgen_run
  add constraint leadgen_run_kind_check
  check (kind in ('prepare', 'send'));

-- Ein vorbereitender Durchgang hoert aus einem Grund auf, den es beim
-- Versand nicht gibt: Es ist nichts mehr abzugleichen.
alter table public.leadgen_run
  drop constraint if exists leadgen_run_stopped_by_check;
alter table public.leadgen_run
  add constraint leadgen_run_stopped_by_check
  check (
    stopped_by in (
      'queue_empty', 'time', 'examined', 'daily_limit', 'outside_window',
      'nothing_prepared'
    )
  );

notify pgrst, 'reload schema';

commit;
