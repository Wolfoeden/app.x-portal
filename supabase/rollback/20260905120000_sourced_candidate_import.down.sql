-- Nimmt die Übernahme recherchierter Kandidaten zurück.
--
-- Achtung: Die strengeren Regeln kehren zurück. Existieren zu diesem Zeitpunkt
-- recherchierte Kandidaten ohne Skills oder ohne Sprache — der Normalfall —,
-- schlägt das Wiederherstellen der Bedingungen fehl. Diese Zeilen müssen dann
-- vorher entfernt werden:
--
--   delete from public.freelancer_applications
--    where source = 'web_research'
--      and (cardinality(skills) = 0 or cardinality(languages) = 0);

begin;

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_approved_completeness_check;

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_languages_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_languages_check
  check (cardinality(languages) between 1 and 20);

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_skills_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_skills_check
  check (cardinality(skills) between 1 and 80);

drop index if exists public.freelancer_applications_source_profile_key;

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_source_profile_url_check;

alter table public.freelancer_applications
  drop column if exists source_profile_url;

notify pgrst, 'reload schema';

commit;
