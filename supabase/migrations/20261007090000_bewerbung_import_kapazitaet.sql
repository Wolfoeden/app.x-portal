-- Onboarding mit Import (Lebenslauf, GitHub) und zwei neuen Angaben.
--
-- 1. `freelancer_applications.import_provenance`: woher übernommene Angaben
--    stammen, z. B. {"imports":[{"source":"cv","importedAt":"…"}],
--    "values":[{"field":"skills","value":"Python","source":"github"}]}.
--    Reine Kennzeichnung für die Sichtung; „geprüft“ setzt weiterhin nur das
--    Team bei der Freigabe (verified_facts, freelancer_projects.verified_at).
-- 2. `capacity_days_per_week` (1–5) und `desired_projects` (bis 500 Zeichen):
--    freiwillige Angaben, die kein Import liefert. Sie stehen in Bewerbung
--    und Profil; das Matching wertet sie nicht aus.
--
-- Rein additiv und idempotent. Die Anwendung prüft das Vorhandensein der
-- Spalten und lässt sie vorher weg.

begin;

alter table public.freelancer_applications
  add column if not exists import_provenance jsonb,
  add column if not exists capacity_days_per_week smallint,
  add column if not exists desired_projects text;

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_import_provenance_check,
  add constraint freelancer_applications_import_provenance_check
    check (
      import_provenance is null
      or (
        jsonb_typeof(import_provenance) = 'object'
        and octet_length(import_provenance::text) <= 20000
      )
    ),
  drop constraint if exists freelancer_applications_capacity_check,
  add constraint freelancer_applications_capacity_check
    check (capacity_days_per_week is null or capacity_days_per_week between 1 and 5),
  drop constraint if exists freelancer_applications_desired_projects_check,
  add constraint freelancer_applications_desired_projects_check
    check (desired_projects is null or char_length(desired_projects) <= 500);

alter table public.freelancer_profiles
  add column if not exists capacity_days_per_week smallint,
  add column if not exists desired_projects text;

alter table public.freelancer_profiles
  drop constraint if exists freelancer_profiles_capacity_check,
  add constraint freelancer_profiles_capacity_check
    check (capacity_days_per_week is null or capacity_days_per_week between 1 and 5),
  drop constraint if exists freelancer_profiles_desired_projects_check,
  add constraint freelancer_profiles_desired_projects_check
    check (desired_projects is null or char_length(desired_projects) <= 500);

comment on column public.freelancer_applications.import_provenance is
  'Herkunft übernommener Angaben (Lebenslauf, GitHub, LinkedIn). Kennzeichnung '
  'für die Sichtung, kein Nachweis.';
comment on column public.freelancer_applications.capacity_days_per_week is
  'Freiwillig: verfügbare Tage pro Woche (1–5).';
comment on column public.freelancer_applications.desired_projects is
  'Freiwillig: welche Projekte die Person sucht, bis 500 Zeichen.';
comment on column public.freelancer_profiles.capacity_days_per_week is
  'Freiwillig: verfügbare Tage pro Woche (1–5). Aus der Bewerbung oder dem Dashboard.';
comment on column public.freelancer_profiles.desired_projects is
  'Freiwillig: gewünschte Projekte, bis 500 Zeichen. Aus der Bewerbung oder dem Dashboard.';

notify pgrst, 'reload schema';

commit;
