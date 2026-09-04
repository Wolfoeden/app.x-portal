-- Recherchierte Kandidaten aus einem bezahlten Suchlauf übernehmen.
--
-- Bisher entstand aus einem Suchergebnis nichts: Der Auftraggeber sah drei
-- Karten, und die Personen dahinter blieben im `result_snapshot` liegen. Wer
-- sie ansprechen wollte, musste sie von Hand abtippen. Diese Migration macht
-- den Weg von der Suche in die Kandidatenliste möglich — nicht mehr.
--
-- Zwei Hindernisse standen dem im Weg, und beide sind Regeln aus der Zeit, als
-- eine Bewerbung nur aus einem ausgefüllten Formular kommen konnte.

begin;

-- 1. Dieselbe Person nicht zweimal ------------------------------------------
--
-- Ohne einen Schlüssel entstünde bei jedem Suchlauf, der dieselbe Person
-- findet, eine zweite Zeile — und die Person bekäme ein zweites Mal Post, als
-- sei nie etwas gewesen. Die Profiladresse ist dieser Schlüssel: Sie ist genau
-- das, was die Suche als Identitätsbeleg verlangt, und sie ist stabil.
--
-- Der Index gilt über alle Zustände hinweg, nicht nur für offene Kandidaten.
-- Wer inzwischen zugestimmt hat und eine gewöhnliche Bewerbung geworden ist,
-- soll erst recht nicht ein zweites Mal als Fremder angeschrieben werden.

alter table public.freelancer_applications
  add column if not exists source_profile_url text;

comment on column public.freelancer_applications.source_profile_url is
  'Die Profilseite, über die dieser Kandidat gefunden wurde. Schlüssel gegen '
  'Doppelte: derselbe Mensch wird nicht zweimal angelegt und nicht zweimal '
  'angeschrieben.';

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_source_profile_url_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_source_profile_url_check
  check (
    source_profile_url is null
    or (
      source_profile_url ~ '^https://'
      and char_length(source_profile_url) <= 1000
    )
  );

create unique index if not exists freelancer_applications_source_profile_key
  on public.freelancer_applications (source_profile_url)
  where source_profile_url is not null;

-- 2. Was eine Recherche nicht wissen kann -----------------------------------
--
-- `skills` und `languages` verlangten je mindestens einen Eintrag. Für ein
-- ausgefülltes Formular ist das richtig — wer sich bewirbt, kennt seine
-- Sprachen. Eine Websuche kennt sie nicht, und sie zu raten ist ausgeschlossen:
-- Eine erfundene Sprachangabe wäre eine Behauptung über einen Menschen, der
-- von alldem nichts weiß.
--
-- Die Regel wird deshalb nach Quelle getrennt, genauso wie es
-- 20260825120000_sourced_candidates.sql schon mit `consent_at` und
-- `contact_email` getan hat. Die Obergrenzen bleiben für alle gleich.
--
-- Für die Veröffentlichung ändert das nichts: Ein Kandidat wird ohne
-- Einwilligung nie freigegeben, und bis dahin ergänzt die Person ihre Angaben
-- selbst.

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_skills_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_skills_check
  check (
    cardinality(skills) <= 80
    and (source = 'web_research' or cardinality(skills) >= 1)
  );

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_languages_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_languages_check
  check (
    cardinality(languages) <= 20
    and (source = 'web_research' or cardinality(languages) >= 1)
  );

-- Eine Freigabe braucht weiterhin beides. Die Lockerung gilt für den
-- Zwischenzustand, nicht für das Ergebnis: Ein veröffentlichtes Profil ohne
-- Skills wäre im Matching wertlos, eines ohne Sprache irreführend.
alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_approved_completeness_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_approved_completeness_check
  check (
    status <> 'approved'
    or (cardinality(skills) >= 1 and cardinality(languages) >= 1)
  );

notify pgrst, 'reload schema';

commit;
