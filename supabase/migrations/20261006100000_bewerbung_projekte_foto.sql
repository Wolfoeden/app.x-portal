-- Bewerbung mit Referenzprojekten und Foto.
--
-- 1. `reference_projects`: bis zu acht Projekte, wie das Formular sie schickt
--    (Titel, Kunde/Branche, Rolle, Zeitraum, Technologien, Ergebnis, Link,
--    „im Profil zeigen“). Sie sind Angaben der Bewerberin oder des Bewerbers;
--    bei der Freigabe übernimmt das Team die gewählten nach
--    `freelancer_projects` (Quelle `application`), „geprüft“ nur dort.
--    Nicht zu verwechseln mit `projects text[]` aus
--    20260825120000_sourced_candidates: Stichworte aus der Recherche.
-- 2. `photo_storage_path`: ein freiwilliges Foto im privaten Bucket
--    `freelancer-avatars` unter `incoming/<uuid>/avatar-<hex>.<ext>`. Das
--    Präfix liegt außerhalb des Musters `<profil-uuid>/avatar-…`, das die
--    Bildroute ausliefert: Ein Foto aus der Bewerbung ist für niemanden
--    abrufbar, bis es bei der Freigabe ins Profil übernommen wird.
--
-- Rein additiv und idempotent; bestehende Zeilen bekommen eine leere Liste.

begin;

alter table public.freelancer_applications
  add column if not exists reference_projects jsonb not null default '[]'::jsonb,
  add column if not exists photo_storage_path text;

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_reference_projects_check,
  add constraint freelancer_applications_reference_projects_check
    check (
      jsonb_typeof(reference_projects) = 'array'
      and jsonb_array_length(reference_projects) <= 8
      and octet_length(reference_projects::text) <= 40000
    ),
  drop constraint if exists freelancer_applications_photo_path_check,
  add constraint freelancer_applications_photo_path_check
    check (
      photo_storage_path is null
      or photo_storage_path ~ '^incoming/[0-9a-f-]{36}/avatar-[0-9a-f]{32}\.(jpg|png|webp)$'
    );

comment on column public.freelancer_applications.reference_projects is
  'Referenzprojekte aus dem Formular (höchstens acht), Angaben der Person. '
  'Bei der Freigabe werden die gewählten nach freelancer_projects übernommen.';
comment on column public.freelancer_applications.photo_storage_path is
  'Freiwilliges Foto im Bucket freelancer-avatars unter incoming/. Wird bei der '
  'Freigabe ins Profil übernommen oder gelöscht, ebenso bei Ablehnung und '
  'Neueinreichung.';

update public.retention_policies
   set notes = 'Delete rejected freelancer applications together with the uploaded CV object once the review period has passed. '
            || 'An application photo is deleted at rejection, resubmission or approval (moved to the profile if used). '
            || 'Approved applications are retained as the provenance record for the published profile.'
 where record_type = 'freelancer_applications';

notify pgrst, 'reload schema';

commit;
