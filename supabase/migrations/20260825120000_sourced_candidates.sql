-- Recherchierte Kandidaten aus der Websuche.
--
-- Ein Kandidat, den der Websuche-Agent gefunden hat, ist keine Profilzeile: er
-- hat nie zugestimmt, nie ein Formular abgeschickt und weiß nichts von XPORTAL.
-- Er ist eine Bewerbung, die noch niemand eingereicht hat — und läuft deshalb
-- durch denselben Trichter wie jede andere, nur einen Schritt früher.
--
-- Zwei Regeln machen das DSGVO-tauglich und stehen deshalb in der Datenbank,
-- nicht in der Anwendung:
--
--   1. Ohne Einwilligung keine Freigabe. Ein Kandidat kann nie zu einem
--      sichtbaren Profil werden, solange consent_at fehlt — unabhängig davon,
--      welcher Code das versucht.
--   2. Ohne Antwort keine Speicherung auf Dauer. Wer nach 30 Tagen nicht
--      zugestimmt hat, wird gelöscht. Das erledigt ein pg_cron-Job nach dem
--      Muster von run_credit_retention_cleanup().
--
-- Die Frist ist bewusst kurz: sie ist die Grenze, ab der aus "wir prüfen einen
-- Kontakt" ein Vorrat auf Verdacht würde.

begin;

-- 1. Neue Quelle und neuer Status ------------------------------------------

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_source_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_source_check
  check (source in ('apply_form', 'web_research'));

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_status_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_status_check
  check (status in ('sourced', 'submitted', 'in_review', 'approved', 'rejected'));

-- 2. Felder, die der Agent füllt --------------------------------------------

alter table public.freelancer_applications
  add column if not exists sourced_at timestamptz,
  add column if not exists sourced_by_user_id uuid references auth.users (id) on delete set null,
  add column if not exists source_urls jsonb not null default '[]'::jsonb,
  add column if not exists linkedin_url text,
  add column if not exists portfolio_url text,
  add column if not exists projects text[] not null default '{}'::text[],
  add column if not exists activities text[] not null default '{}'::text[],
  add column if not exists outreach_channel text,
  add column if not exists outreach_sent_at timestamptz;

comment on column public.freelancer_applications.source_urls is
  'Belegquellen der Recherche. Ein Feld ohne Quelle wird verworfen, nicht geraten.';
comment on column public.freelancer_applications.outreach_sent_at is
  'Wann die Person über die Speicherung informiert und um ihren CV gebeten wurde (Art. 14 DSGVO).';

-- 3. Einwilligung und Kontakt dürfen fehlen — aber nur solange recherchiert --

alter table public.freelancer_applications
  alter column consent_at drop not null,
  alter column contact_email drop not null;

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_consent_shape_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_consent_shape_check
  check (
    -- Eine selbst eingereichte Bewerbung braucht beides, wie bisher.
    source = 'web_research'
    or (consent_at is not null and contact_email is not null)
  );

-- Die Kernregel: eine Freigabe ohne Einwilligung ist unmöglich. Auch für den
-- Service-Role-Key, auch wenn ein Fehler in der Anwendung es versuchen würde.
alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_approval_needs_consent_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_approval_needs_consent_check
  check (status <> 'approved' or consent_at is not null);

-- Ein recherchierter Kandidat ohne Beleg ist wertlos und rechtlich angreifbar.
alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_sourced_shape_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_sourced_shape_check
  check (
    source <> 'web_research'
    or (
      sourced_at is not null
      and jsonb_typeof(source_urls) = 'array'
      and jsonb_array_length(source_urls) between 1 and 12
    )
  );

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_outreach_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_outreach_check
  check (
    (outreach_sent_at is null and outreach_channel is null)
    or (
      outreach_sent_at is not null
      and outreach_channel in ('email', 'linkedin', 'website', 'other')
    )
  );

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_linkedin_url_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_linkedin_url_check
  check (
    linkedin_url is null
    or (linkedin_url ~ '^https://' and char_length(linkedin_url) <= 1000)
  );

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_portfolio_url_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_portfolio_url_check
  check (
    portfolio_url is null
    or (portfolio_url ~ '^https://' and char_length(portfolio_url) <= 1000)
  );

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_research_arrays_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_research_arrays_check
  check (
    cardinality(projects) <= 20
    and cardinality(activities) <= 20
  );

-- Der Aufräum-Job liest genau diese Kombination.
create index if not exists freelancer_applications_sourced_purge_idx
  on public.freelancer_applications (sourced_at)
  where source = 'web_research' and status = 'sourced' and consent_at is null;

-- 4. Die Löschregel ----------------------------------------------------------

insert into public.retention_policies (
  record_type, retention_days, deletion_mode, is_enabled, notes
) values (
  'sourced_candidates',
  30,
  'hard_delete',
  true,
  'Recherchierte Kandidaten ohne Einwilligung werden 30 Tage nach der Recherche '
  || 'restlos gelöscht. Die Frist läuft ab sourced_at und wird durch eine '
  || 'Kontaktaufnahme nicht verlängert — nur eine Einwilligung beendet sie.'
)
on conflict (record_type) do update
  set retention_days = excluded.retention_days,
      deletion_mode = excluded.deletion_mode,
      is_enabled = excluded.is_enabled,
      notes = excluded.notes,
      updated_at = now();

create or replace function public.run_sourced_candidate_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_deleted integer := 0;
  v_result jsonb;
begin
  select retention_days into v_days
    from public.retention_policies
   where record_type = 'sourced_candidates'
     and is_enabled and deletion_mode = 'hard_delete';

  if v_days is not null then
    -- Nur unbeantwortete Recherchen. Wer zugestimmt hat, ist eine gewöhnliche
    -- Bewerbung und fällt unter deren eigene, längere Frist.
    delete from public.freelancer_applications
     where source = 'web_research'
       and status = 'sourced'
       and consent_at is null
       and sourced_at is not null
       and sourced_at < now() - make_interval(days => v_days);
    get diagnostics v_deleted = row_count;
  end if;

  v_result := jsonb_build_object(
    'sourced_candidates', v_deleted,
    'retention_days', coalesce(v_days, -1)
  );

  insert into public.audit_events (
    actor_tombstone, action, target_type, outcome, metadata
  ) values (
    'system:sourced-retention', 'sourced_candidate_cleanup',
    'freelancer_application', 'success', v_result
  );

  return v_result;
end;
$$;

revoke all on function public.run_sourced_candidate_cleanup()
  from public, anon, authenticated;
grant execute on function public.run_sourced_candidate_cleanup()
  to service_role;

create extension if not exists pg_cron;
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'xportal-sourced-candidate-retention-daily'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;
select cron.schedule(
  'xportal-sourced-candidate-retention-daily',
  '45 2 * * *',
  'select public.run_sourced_candidate_cleanup();'
);

notify pgrst, 'reload schema';

commit;
