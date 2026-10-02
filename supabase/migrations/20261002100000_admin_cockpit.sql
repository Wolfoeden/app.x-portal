-- Das Cockpit im Adminbereich: ein Schalter für die Lead-Automatik, eine
-- Kontaktliste für die eigene Akquise und ein Blick auf die Zeitgeber.
--
-- 1. leadgen_automation
--    Bis heute entschied eine Konstante im Code (SCHEDULED_LEAD_SEND_ENABLED),
--    ob der Zeitplan selbst verschickt. Umschalten hieß einen Deploy. Die
--    Betriebsart steht jetzt in einer Zeile, die der Betreiber im Adminbereich
--    setzt — getrennt für Abgleich und Versand (docs/leadgen-betriebsarten.md).
--    Der Versand beginnt auf `manual`: Die Frage nach § 7 UWG ist offen, und
--    wer automatisch verschickt, soll es bewusst eingeschaltet haben.
--
-- 2. trigger_leadgen_run(p_mode, p_source)
--    Der Zeitgeber fragt die Einstellung, bevor er die Anwendung weckt. Der
--    Versandtakt ruft bisher alle zehn Minuten eine Route auf, nur damit sie
--    „manual_only“ antwortet; das entfällt.
--
-- 3. „Sofort bei Eingang“
--    Ein Trigger je Anweisung (nicht je Zeile) auf leadgen_queue stößt den
--    Abgleich an, gedrosselt auf einmal je Minute.
--
-- 4. crm_contacts, crm_contact_events
--    Recruiter und Auftraggeber, die der Betreiber selbst anspricht: Import
--    aus einer Tabelle, Stufe, Wiedervorlage, Verlauf. Keine automatische
--    Ansprache — jede Mail schreibt der Betreiber aus seinem Postfach.
--
-- 5. admin_system_health()
--    Zeitgeber und ihre HTTP-Antworten der letzten Stunden, für die
--    Systemseite. Bisher sah das nur, wer SQL schreibt.

begin;

-- 1. Betriebsart der Lead-Automatik -----------------------------------------

create table if not exists public.leadgen_automation (
  id boolean primary key default true check (id),
  prepare_mode text not null default 'scheduled'
    check (prepare_mode in ('on_arrival', 'scheduled', 'manual')),
  send_mode text not null default 'manual'
    check (send_mode in ('scheduled', 'manual')),
  -- Vorübergehend anhalten, ohne die Betriebsart zu verlieren.
  paused_until timestamptz,
  -- Übersteuert LEAD_BULK_SEND_LIMIT, wenn gesetzt.
  daily_limit integer check (daily_limit between 1 and 200),
  -- Wann der Eingangs-Trigger zuletzt gefeuert hat. Grundlage der Drosselung.
  last_arrival_trigger_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.leadgen_automation is
  'Betriebsart der Lead-Automatik. Eine Zeile. Der Knopf im Adminbereich '
  'wirkt in jeder Betriebsart — manual heißt „von selbst passiert nichts“.';

insert into public.leadgen_automation (id) values (true)
on conflict (id) do nothing;

alter table public.leadgen_automation enable row level security;
alter table public.leadgen_automation force row level security;
revoke all on public.leadgen_automation from anon, authenticated;
grant select, insert, update on public.leadgen_automation to service_role;

-- 2. Der Zeitgeber fragt die Einstellung --------------------------------------

-- Zwei Fassungen nebeneinander wären mehrdeutig: `trigger_leadgen_run('send')`
-- passte auf beide. Die alte fällt deshalb weg; die Cron-Befehle bleiben
-- wörtlich gleich und treffen die neue.
drop function if exists public.trigger_leadgen_run(text);

create or replace function public.trigger_leadgen_run(
  p_mode text default 'send',
  p_source text default 'schedule'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_origin text;
  v_mode text;
  v_source text;
  v_prepare_mode text;
  v_send_mode text;
  v_paused_until timestamptz;
begin
  v_mode := case when p_mode = 'prepare' then 'prepare' else 'send' end;
  v_source := case when p_source = 'arrival' then 'arrival' else 'schedule' end;

  select a.prepare_mode, a.send_mode, a.paused_until
    into v_prepare_mode, v_send_mode, v_paused_until
    from public.leadgen_automation a
   where a.id;

  -- Fehlt die Zeile, gilt die vorsichtige Vorgabe: abgleichen ja,
  -- verschicken nein.
  v_prepare_mode := coalesce(v_prepare_mode, 'scheduled');
  v_send_mode := coalesce(v_send_mode, 'manual');

  if v_paused_until is not null and v_paused_until > now() then
    return;
  end if;
  if v_mode = 'send' and v_send_mode <> 'scheduled' then
    return;
  end if;
  if v_mode = 'prepare' and v_prepare_mode = 'manual' then
    return;
  end if;
  if v_source = 'arrival' and v_prepare_mode <> 'on_arrival' then
    return;
  end if;

  select decrypted_secret into v_token
    from vault.decrypted_secrets
   where name = 'leadgen_run_token';

  select decrypted_secret into v_origin
    from vault.decrypted_secrets
   where name = 'leadgen_run_origin';

  if v_token is null or v_origin is null then
    raise warning 'leadgen run skipped: vault secrets leadgen_run_token/leadgen_run_origin missing';
    return;
  end if;

  perform net.http_post(
    url := v_origin || '/api/leadgen/run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-leadgen-run-token', v_token
    ),
    body := jsonb_build_object('mode', v_mode),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.trigger_leadgen_run(text, text)
  from public, anon, authenticated;

comment on function public.trigger_leadgen_run(text, text) is
  'Weckt POST /api/leadgen/run, wenn leadgen_automation es zulässt. prepare '
  'gleicht ab, send stellt zu; p_source arrival kommt vom Eingangs-Trigger.';

-- 3. Sofort bei Eingang --------------------------------------------------------

create or replace function public.leadgen_queue_arrival()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prepare_mode text;
  v_last timestamptz;
  v_paused_until timestamptz;
begin
  if not exists (select 1 from neu where neu.status = 'new') then
    return null;
  end if;

  select a.prepare_mode, a.last_arrival_trigger_at, a.paused_until
    into v_prepare_mode, v_last, v_paused_until
    from public.leadgen_automation a
   where a.id
     for update;

  if v_prepare_mode is distinct from 'on_arrival' then
    return null;
  end if;
  if v_paused_until is not null and v_paused_until > now() then
    return null;
  end if;
  -- Ein Werkzeug, das in Häppchen schreibt, soll nicht fünfzig Läufe
  -- auslösen. Den Rest holt der reguläre Takt.
  if v_last is not null and v_last > now() - interval '60 seconds' then
    return null;
  end if;

  update public.leadgen_automation
     set last_arrival_trigger_at = now()
   where id;

  -- Ein Import darf nie daran scheitern, dass der Anstoß nicht klappt.
  begin
    perform public.trigger_leadgen_run('prepare', 'arrival');
  exception when others then
    raise warning 'leadgen arrival trigger failed: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.leadgen_queue_arrival()
  from public, anon, authenticated;

drop trigger if exists leadgen_queue_arrival on public.leadgen_queue;
create trigger leadgen_queue_arrival
  after insert on public.leadgen_queue
  referencing new table as neu
  for each statement
  execute function public.leadgen_queue_arrival();

-- 4. Kontakte -------------------------------------------------------------------

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  -- Firma, Person und Adresse kleingeschrieben: derselbe Kontakt aus zwei
  -- Importen wird aktualisiert statt verdoppelt.
  dedupe_key text not null unique check (char_length(dedupe_key) between 1 and 700),
  company text not null check (char_length(btrim(company)) between 1 and 200),
  contact_name text check (char_length(contact_name) <= 160),
  role_title text check (char_length(role_title) <= 200),
  kind text check (char_length(kind) <= 80),
  region text check (char_length(region) <= 160),
  focus text check (char_length(focus) <= 400),
  email text check (
    email is null
    or (char_length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  ),
  email_kind text not null default 'unknown'
    check (email_kind in ('personal', 'company', 'team', 'none', 'unknown')),
  email_source_url text check (char_length(email_source_url) <= 500),
  project_url text check (char_length(project_url) <= 500),
  note text check (char_length(note) <= 2000),
  source text not null default 'manual' check (char_length(source) between 1 and 80),
  stage text not null default 'new'
    check (stage in ('new', 'contacted', 'replied', 'meeting', 'customer', 'not_interested', 'do_not_contact')),
  next_follow_up_on date,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.crm_contacts is
  'Recruiter und Auftraggeber für die eigene Akquise des Betreibers. Keine '
  'automatische Ansprache; do_not_contact hält einen Widerspruch fest.';

create index if not exists crm_contacts_stage_follow_up_idx
  on public.crm_contacts (stage, next_follow_up_on);
create index if not exists crm_contacts_updated_idx
  on public.crm_contacts (updated_at desc);
create index if not exists crm_contacts_created_by_idx
  on public.crm_contacts (created_by);
create index if not exists crm_contacts_updated_by_idx
  on public.crm_contacts (updated_by);

create table if not exists public.crm_contact_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts (id) on delete cascade,
  kind text not null check (kind in ('imported', 'note', 'stage', 'mail_drafted', 'updated')),
  body text check (char_length(body) <= 2000),
  from_stage text,
  to_stage text,
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists crm_contact_events_contact_idx
  on public.crm_contact_events (contact_id, created_at desc);
create index if not exists crm_contact_events_actor_idx
  on public.crm_contact_events (actor_user_id);

alter table public.crm_contacts enable row level security;
alter table public.crm_contacts force row level security;
revoke all on public.crm_contacts from anon, authenticated;
grant select, insert, update, delete on public.crm_contacts to service_role;

alter table public.crm_contact_events enable row level security;
alter table public.crm_contact_events force row level security;
revoke all on public.crm_contact_events from anon, authenticated;
grant select, insert, update, delete on public.crm_contact_events to service_role;

-- 5. Zeitgeber und HTTP-Antworten -----------------------------------------------

create or replace function public.admin_system_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'generatedAt', now(),
    'jobs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', j.jobname,
          'schedule', j.schedule,
          'active', j.active,
          'lastRunAt', r.last_run,
          'lastStatus', r.last_status,
          'lastMessage', left(r.last_message, 160),
          'runs24h', coalesce(r.runs, 0),
          'failures24h', coalesce(r.failures, 0)
        )
        order by j.jobname
      )
      from cron.job j
      left join lateral (
        select max(d.start_time) as last_run,
               (array_agg(d.status order by d.start_time desc))[1] as last_status,
               (array_agg(d.return_message order by d.start_time desc))[1] as last_message,
               count(*) as runs,
               count(*) filter (where d.status <> 'succeeded') as failures
          from cron.job_run_details d
         where d.jobid = j.jobid
           and d.start_time > now() - interval '24 hours'
      ) r on true
    ), '[]'::jsonb),
    -- pg_net hält Antworten nur wenige Stunden. Für Fehler der letzte
    -- Antworttext, gekürzt: Er stammt von den eigenen Routen und sagt, was
    -- fehlt („cron_secret_unconfigured“, „Ungültiges Token.“).
    'http', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'status', h.status,
          'count', h.n,
          'lastAt', h.last_at,
          'lastBody', case when h.status between 200 and 299 then null else left(h.last_body, 160) end,
          'lastError', left(h.last_error, 160)
        )
        order by h.n desc
      )
      from (
        select coalesce(r.status_code, 0) as status,
               count(*) as n,
               max(r.created) as last_at,
               (array_agg(r.content order by r.created desc))[1] as last_body,
               (array_agg(r.error_msg order by r.created desc))[1] as last_error
          from net._http_response r
         where r.created > now() - interval '6 hours'
         group by coalesce(r.status_code, 0)
      ) h
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_system_health() from public, anon, authenticated;
grant execute on function public.admin_system_health() to service_role;

comment on function public.admin_system_health() is
  'Zeitgeber (24 h) und HTTP-Antworten von pg_net (6 h) für die Systemseite '
  'im Adminbereich. Nur service_role.';

commit;
