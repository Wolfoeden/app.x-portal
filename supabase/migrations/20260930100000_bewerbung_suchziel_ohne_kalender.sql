-- Bewerbungen für den Zulauf über die Agentur für Arbeit.
--
-- 1. Der Terminlink ist keine Pflicht mehr. Seit dem Vermittlungsmodell fragt
--    der Kunde über XPORTAL an, und die Vorstellung läuft per Mail; ein
--    Kalender beschleunigt das nur. `20260908140000_kandidat_ohne_kalender`
--    hatte ihn ab dem Zustand `submitted` verlangt. Die Formprüfung (HTTPS,
--    Länge) bleibt, wenn einer angegeben ist.
-- 2. Was die Person sucht: Freelance-Projekte, eine Festanstellung oder
--    beides. Bewerbungen und Profile tragen es; wer nur eine Festanstellung
--    sucht, erscheint nicht in der Freelancer-Suche.
-- 3. Woher die Bewerbung kommt (`?quelle=arbeitsagentur`), damit sich der
--    Zulauf einer Quelle zählen und gezielt sichten lässt.
--
-- Nur lockernd und hinzufügend; bestehende Zeilen bekommen `projects`.
-- Idempotent.

begin;

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_booking_required_check;

comment on column public.freelancer_applications.booking_url is
  'Der öffentliche Terminlink, eine Kann-Angabe. Ohne ihn fragen Kunden über '
  'XPORTAL an, und die Vorstellung läuft per Mail.';

alter table public.freelancer_applications
  add column if not exists seeking text not null default 'projects',
  add column if not exists referral text;

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_seeking_check,
  add constraint freelancer_applications_seeking_check
    check (seeking in ('projects', 'employment', 'both')),
  drop constraint if exists freelancer_applications_referral_check,
  add constraint freelancer_applications_referral_check
    check (referral is null or referral ~ '^[a-z0-9-]{1,40}$');

create index if not exists freelancer_applications_referral_idx
  on public.freelancer_applications (referral, created_at desc)
  where referral is not null;

alter table public.freelancer_profiles
  add column if not exists seeking text not null default 'projects';

alter table public.freelancer_profiles
  drop constraint if exists freelancer_profiles_seeking_check,
  add constraint freelancer_profiles_seeking_check
    check (seeking in ('projects', 'employment', 'both'));

comment on column public.freelancer_applications.seeking is
  'Was die Person sucht: projects (Freelance), employment (Festanstellung) oder both.';
comment on column public.freelancer_applications.referral is
  'Herkunft der Bewerbung aus ?quelle=, zum Beispiel arbeitsagentur.';
comment on column public.freelancer_profiles.seeking is
  'Aus der Bewerbung übernommen. employment erscheint nicht in der Freelancer-Suche.';

notify pgrst, 'reload schema';

commit;
