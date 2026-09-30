-- Vermittlungsmodell, Paket 3: Rechnung über Stripe.
--
-- Bis hierher wurde eine Beauftragung verbucht und das Honorar berechnet; die
-- Rechnung entstand außerhalb, und im Admin stand nur ihre Nummer. Jetzt
-- erzeugt XPORTAL sie über Stripe: Rechnungsanschrift des Kunden, Stripe-Kunde
-- und -Rechnung, Link und PDF liegen an der Beauftragung. `invoice.paid`
-- setzt den Stand auf bezahlt.
--
-- Nur hinzufügend und nullbar, idempotent wie 20260928120000.

alter table public.engagements
  add column if not exists billing_company text,
  add column if not exists billing_contact text,
  add column if not exists billing_email text,
  add column if not exists billing_street text,
  add column if not exists billing_postal_code text,
  add column if not exists billing_city text,
  add column if not exists billing_country text,
  add column if not exists billing_vat_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_invoice_id text,
  add column if not exists invoice_url text,
  add column if not exists invoice_pdf_url text,
  add column if not exists invoice_due_on date;

alter table public.engagements
  drop constraint if exists engagements_billing_company_check,
  add constraint engagements_billing_company_check
    check (billing_company is null or char_length(btrim(billing_company)) between 1 and 200),
  drop constraint if exists engagements_billing_contact_check,
  add constraint engagements_billing_contact_check
    check (billing_contact is null or char_length(btrim(billing_contact)) between 1 and 200),
  drop constraint if exists engagements_billing_email_check,
  add constraint engagements_billing_email_check
    check (billing_email is null or (char_length(billing_email) <= 320 and billing_email ~ '^[^@\s]+@[^@\s]+$')),
  drop constraint if exists engagements_billing_street_check,
  add constraint engagements_billing_street_check
    check (billing_street is null or char_length(btrim(billing_street)) between 1 and 200),
  drop constraint if exists engagements_billing_postal_code_check,
  add constraint engagements_billing_postal_code_check
    check (billing_postal_code is null or char_length(btrim(billing_postal_code)) between 1 and 20),
  drop constraint if exists engagements_billing_city_check,
  add constraint engagements_billing_city_check
    check (billing_city is null or char_length(btrim(billing_city)) between 1 and 120),
  drop constraint if exists engagements_billing_country_check,
  add constraint engagements_billing_country_check
    check (billing_country is null or billing_country ~ '^[A-Z]{2}$'),
  drop constraint if exists engagements_billing_vat_id_check,
  add constraint engagements_billing_vat_id_check
    check (billing_vat_id is null or billing_vat_id ~ '^[A-Z]{2}[A-Z0-9]{2,14}$'),
  drop constraint if exists engagements_stripe_customer_check,
  add constraint engagements_stripe_customer_check
    check (stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  drop constraint if exists engagements_stripe_invoice_check,
  add constraint engagements_stripe_invoice_check
    check (stripe_invoice_id is null or stripe_invoice_id ~ '^in_[A-Za-z0-9]+$'),
  drop constraint if exists engagements_invoice_url_check,
  add constraint engagements_invoice_url_check
    check (invoice_url is null or (invoice_url ~ '^https://' and char_length(invoice_url) <= 2000)),
  drop constraint if exists engagements_invoice_pdf_url_check,
  add constraint engagements_invoice_pdf_url_check
    check (invoice_pdf_url is null or (invoice_pdf_url ~ '^https://' and char_length(invoice_pdf_url) <= 2000));

-- Eine Stripe-Rechnung gehört zu genau einer Beauftragung; `invoice.paid`
-- findet sie darüber.
create unique index if not exists engagements_stripe_invoice_key
  on public.engagements (stripe_invoice_id)
  where stripe_invoice_id is not null;

comment on column public.engagements.stripe_invoice_id is
  'Die Stripe-Rechnung über das Vermittlungshonorar. invoice.paid setzt fee_status auf paid.';
comment on column public.engagements.billing_company is
  'Rechnungsempfänger (Firma), wie er auf der Stripe-Rechnung steht.';

notify pgrst, 'reload schema';
