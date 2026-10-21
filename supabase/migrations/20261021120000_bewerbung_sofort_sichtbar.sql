-- Bewerbung in drei Minuten, sofort sichtbar (21.10.2026).
--
-- 1. Der Lebenslauf ist keine Pflicht mehr. Die Seite sagte das schon
--    („Lebenslauf hilft, ist kein Muss“), die Datenbank verlangte ihn noch
--    (`cv_required_check`, NOT VALID, also für jede neue Zeile und jedes
--    Update). Daran scheiterte auch das Leeren von `cv_storage_path` nach der
--    Übergabe an das Profil.
-- 2. Eine vollständige Bewerbung geht ohne Sichtung live, als Angabe des
--    Freelancers (`verification_status = 'unverified'`). `auto_published_at`
--    hält fest, dass niemand vom Team entschieden hat; die Entscheidungsregel
--    lässt eine Freigabe ohne Prüfer nur mit diesem Vermerk zu.
-- 3. Zwei freiwillige Einwilligungen, getrennt von den AGB: Profil in
--    Suchmaschinen und Angaben anonymisiert in Marktstatistiken. Ohne Häkchen
--    bleibt beides aus.
begin;

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_cv_required_check;

alter table public.freelancer_applications
  add column if not exists auto_published_at timestamptz,
  add column if not exists consent_search_index boolean not null default false,
  add column if not exists consent_market_stats boolean not null default false;

alter table public.freelancer_profiles
  add column if not exists consent_search_index boolean not null default false,
  add column if not exists consent_market_stats boolean not null default false;

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_decision_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_decision_check
  check (
    status in ('sourced', 'submitted', 'in_review')
    or (
      reviewed_at is not null
      and (
        reviewed_by_user_id is not null
        or (status = 'approved' and auto_published_at is not null)
      )
    )
  );

comment on column public.freelancer_applications.auto_published_at is
  'Set when the application went live without operator review (self-reported profile).';
comment on column public.freelancer_profiles.consent_search_index is
  'Opt-in: the public profile page may be indexed by search engines (never contact data).';
comment on column public.freelancer_profiles.consent_market_stats is
  'Opt-in: rate, skills and availability may feed anonymised market statistics (k >= 10).';

notify pgrst, 'reload schema';
commit;
