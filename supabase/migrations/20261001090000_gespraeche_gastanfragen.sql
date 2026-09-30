-- Anfragen ohne Konto und „Gespräche“.
--
-- 1. Gäste fragen im Vermittlungsmodell an, ohne sich zu registrieren. Die
--    Anfrage gehört ihrem Gastkonto (anonyme Sitzung); damit XPORTAL sie
--    vorstellen und nachfragen kann, stehen E-Mail, Firma und optional Name
--    an der Anfrage. Legt der Gast später ein Konto an, zieht
--    `claim_guest_workspace` die Anfrage wie bisher mit um.
-- 2. Nachgefragt wird beide Seiten, und jede Antwort bleibt für sich stehen:
--    `client_outcome` und `freelancer_outcome`. `outcome` bleibt der
--    zusammengefasste Stand nach `outcomeReplaces`, auf dem Honorar und
--    Admin aufbauen. Widersprechen sich die beiden, sieht es der Betreiber.
--
-- Nur hinzufügend und nullbar. Idempotent.

begin;

alter table public.intro_bookings
  add column if not exists contact_email text,
  add column if not exists contact_company text,
  add column if not exists contact_name text,
  add column if not exists client_outcome text,
  add column if not exists client_outcome_at timestamptz,
  add column if not exists freelancer_outcome text,
  add column if not exists freelancer_outcome_at timestamptz;

alter table public.intro_bookings
  drop constraint if exists intro_bookings_contact_email_check,
  add constraint intro_bookings_contact_email_check
    check (contact_email is null or (char_length(contact_email) <= 320 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  drop constraint if exists intro_bookings_contact_company_check,
  add constraint intro_bookings_contact_company_check
    check (contact_company is null or char_length(btrim(contact_company)) between 1 and 200),
  drop constraint if exists intro_bookings_contact_name_check,
  add constraint intro_bookings_contact_name_check
    check (contact_name is null or char_length(btrim(contact_name)) between 1 and 120),
  drop constraint if exists intro_bookings_client_outcome_check,
  add constraint intro_bookings_client_outcome_check
    check (client_outcome is null or client_outcome in ('engaged', 'talking', 'no_engagement')),
  drop constraint if exists intro_bookings_freelancer_outcome_check,
  add constraint intro_bookings_freelancer_outcome_check
    check (freelancer_outcome is null or freelancer_outcome in ('engaged', 'talking', 'no_engagement'));

-- Was bisher schon gemeldet wurde, der Seite zuordnen, die es gesagt hat.
update public.intro_bookings
  set client_outcome = outcome, client_outcome_at = coalesce(outcome_reported_at, now())
  where outcome is not null and outcome_source = 'client' and client_outcome is null;
update public.intro_bookings
  set freelancer_outcome = outcome, freelancer_outcome_at = coalesce(outcome_reported_at, now())
  where outcome is not null and outcome_source = 'freelancer' and freelancer_outcome is null;

comment on column public.intro_bookings.contact_email is
  'Bei einer Anfrage ohne Konto: die E-Mail-Adresse des Gastes für Vorstellung und Nachfrage.';
comment on column public.intro_bookings.client_outcome is
  'Was der Kunde zuletzt zur Beauftragung gesagt hat (Gespräche oder Antwortlink).';
comment on column public.intro_bookings.freelancer_outcome is
  'Was der Freelancer zuletzt zur Beauftragung gesagt hat (Gespräche oder Antwortlink).';

notify pgrst, 'reload schema';

commit;
