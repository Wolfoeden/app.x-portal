-- Vermittlungsmodell, Paket 2: Beauftragung, Honorar und Nachfrage.
--
-- `engagements` war seit dem ersten Datenmodell für eine Beauftragung
-- angelegt, blieb aber ungenutzt. Es bekommt die Felder, aus denen sich das
-- Vermittlungshonorar ergibt, und dessen Rechnungsstand. `intro_bookings`
-- bekommt, was Kunde oder Freelancer auf die Nachfrage „Kam es zur
-- Zusammenarbeit?“ geantwortet haben, und wie oft nachgefragt wurde.
--
-- Nur hinzufügend und nullbar; nichts Bestehendes ändert sich. Idempotent,
-- weil Produktionsmigrationen über den Supabase-Connector mit eigener
-- Versionsnummer laufen und ein späteres `supabase db push` diese Datei
-- erneut ausführen kann.

alter table public.engagements
  add column if not exists day_rate_minor bigint,
  add column if not exists project_days integer,
  add column if not exists starts_on date,
  add column if not exists fee_minor bigint,
  add column if not exists fee_status text,
  add column if not exists invoice_reference text,
  add column if not exists invoiced_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists terms_version text;

alter table public.engagements
  drop constraint if exists engagements_day_rate_check,
  add constraint engagements_day_rate_check
    check (day_rate_minor is null or day_rate_minor > 0),
  drop constraint if exists engagements_project_days_check,
  add constraint engagements_project_days_check
    check (project_days is null or project_days between 1 and 400),
  drop constraint if exists engagements_fee_check,
  add constraint engagements_fee_check
    check (fee_minor is null or fee_minor >= 0),
  drop constraint if exists engagements_fee_status_check,
  add constraint engagements_fee_status_check
    check (fee_status is null or fee_status in ('open', 'invoiced', 'paid', 'waived')),
  drop constraint if exists engagements_invoice_reference_check,
  add constraint engagements_invoice_reference_check
    check (
      invoice_reference is null
      or char_length(btrim(invoice_reference)) between 1 and 120
    ),
  drop constraint if exists engagements_terms_version_check,
  add constraint engagements_terms_version_check
    check (terms_version is null or char_length(terms_version) between 1 and 80);

alter table public.intro_bookings
  add column if not exists outcome text,
  add column if not exists outcome_source text,
  add column if not exists outcome_reported_at timestamptz,
  add column if not exists follow_up_count smallint not null default 0,
  add column if not exists last_follow_up_at timestamptz;

alter table public.intro_bookings
  drop constraint if exists intro_bookings_outcome_check,
  add constraint intro_bookings_outcome_check
    check (outcome is null or outcome in ('engaged', 'talking', 'no_engagement')),
  drop constraint if exists intro_bookings_outcome_source_check,
  add constraint intro_bookings_outcome_source_check
    check (outcome_source is null or outcome_source in ('client', 'freelancer', 'operator')),
  drop constraint if exists intro_bookings_follow_up_count_check,
  add constraint intro_bookings_follow_up_count_check
    check (follow_up_count between 0 and 5);

comment on column public.engagements.fee_minor is
  'Vermittlungshonorar in Cent nach den Vermittlungsbedingungen der Fassung terms_version.';
comment on column public.intro_bookings.outcome is
  'Antwort auf die Nachfrage nach der Vorstellung: beauftragt, noch im Gespräch oder kein Auftrag.';
