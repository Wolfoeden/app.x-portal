-- Double-Opt-in für die Whitelist.
--
-- Bisher speicherte `whitelist_leads` eine Einwilligungserklärung samt
-- Zeitstempel — bestätigt wurde sie nie. Für eine Werbe-E-Mail verlangt § 7
-- Abs. 2 UWG aber eine *nachweisbare* Einwilligung, und ein Formularfeld, das
-- jeder mit fremder Adresse ausfüllen kann, ist kein Nachweis. Ohne
-- Bestätigung ist der Datensatz eine Behauptung, keine Einwilligung.
--
-- `consent_at` behält seine Bedeutung: der Zeitpunkt, zu dem jemand die
-- Erklärung abgeschickt hat. Der Nachweis ist neu und heißt `confirmed_at`.
-- Nur wer den bestätigt hat, darf angeschrieben werden.
--
-- Bestandsdatensätze bleiben bewusst auf `pending`. Sie nachträglich als
-- bestätigt zu markieren wäre genau die Behauptung, die hier abgeschafft wird.
-- Sie dürfen erst nach einer eigenen Bestätigung angeschrieben werden — und
-- die Bestätigungsmail selbst ist bei einer Adresse ohne Einwilligung bereits
-- die heikle Nachricht. Im Zweifel gehören sie gelöscht.

begin;

alter table public.whitelist_leads
  add column if not exists status text not null default 'pending',
  add column if not exists confirmation_token_hash text,
  add column if not exists confirmation_expires_at timestamptz,
  add column if not exists confirmation_sent_at timestamptz,
  add column if not exists confirmed_at timestamptz;

alter table public.whitelist_leads
  drop constraint if exists whitelist_leads_status_check;
alter table public.whitelist_leads
  add constraint whitelist_leads_status_check
  check (status in ('pending', 'confirmed'));

-- Ein bestätigter Datensatz ohne Zeitpunkt wäre wieder nur eine Behauptung.
alter table public.whitelist_leads
  drop constraint if exists whitelist_leads_confirmation_check;
alter table public.whitelist_leads
  add constraint whitelist_leads_confirmation_check
  check (
    (status = 'confirmed' and confirmed_at is not null)
    or (status = 'pending' and confirmed_at is null)
  );

-- Der Token liegt nur als SHA-256-Hex in der Datenbank. Wer sie liest, kann
-- damit keine fremde Anmeldung bestätigen.
alter table public.whitelist_leads
  drop constraint if exists whitelist_leads_token_hash_check;
alter table public.whitelist_leads
  add constraint whitelist_leads_token_hash_check
  check (
    confirmation_token_hash is null
    or confirmation_token_hash ~ '^[0-9a-f]{64}$'
  );

create unique index if not exists whitelist_leads_token_hash_idx
  on public.whitelist_leads (confirmation_token_hash)
  where confirmation_token_hash is not null;

create index if not exists whitelist_leads_pending_idx
  on public.whitelist_leads (created_at desc)
  where status = 'pending';

comment on column public.whitelist_leads.consent_at is
  'Zeitpunkt der abgegebenen Einwilligungserklärung. Für sich genommen kein '
  'Nachweis — der steht in confirmed_at.';
comment on column public.whitelist_leads.confirmed_at is
  'Zeitpunkt der Bestätigung über den Double-Opt-in-Link. Erst ab hier darf '
  'die Adresse angeschrieben werden.';
comment on column public.whitelist_leads.confirmation_token_hash is
  'SHA-256 des Bestätigungstokens. Der Token selbst verlässt die Anwendung nur '
  'in der Bestätigungsmail.';

update public.retention_policies
   set notes =
         'Early-access-Anmeldungen. Unbestätigte Datensätze (status = pending) '
         || 'sind keine Einwilligung und werden nach 30 Tagen gelöscht; '
         || 'bestätigte nach 365 Tagen überprüft.',
       updated_at = now()
 where record_type = 'whitelist_leads';

-- Unbestätigte Anmeldungen häufen sich sonst unbegrenzt an: Wer nicht
-- bestätigt hat, hat nicht eingewilligt, und dann gibt es keinen Grund, die
-- Adresse zu behalten.
create or replace function public.run_whitelist_pending_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.whitelist_leads
   where status = 'pending'
     and created_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('whitelist_pending', v_deleted);
end;
$$;

revoke all on function public.run_whitelist_pending_cleanup()
  from public, anon, authenticated;
grant execute on function public.run_whitelist_pending_cleanup() to service_role;

create extension if not exists pg_cron;
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'xportal-whitelist-pending-cleanup-daily'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;
select cron.schedule(
  'xportal-whitelist-pending-cleanup-daily',
  '35 3 * * *',
  'select public.run_whitelist_pending_cleanup();'
);

notify pgrst, 'reload schema';

commit;
