-- Der zweite Kontaktweg aus dem Impressum.
--
-- § 5 DDG verlangt Angaben, die eine schnelle elektronische Kontaktaufnahme
-- und eine unmittelbare Kommunikation ermöglichen. Eine E-Mail-Adresse allein
-- wird dafür regelmäßig als zu wenig angesehen; ein Formular mit zugesagter
-- Reaktionszeit schließt die Lücke, ohne eine private Telefonnummer zu
-- veröffentlichen.
--
-- Der Eingang liegt in der Datenbank statt in einem Postfach, weil XPORTAL
-- keinen E-Mail-Anbieter hat (siehe docs/processor-register.md). Gelesen wird
-- er über Supabase Studio — derselbe Weg, den `whitelist_leads` schon geht.
--
-- Bewusst nicht gespeichert: IP-Adresse, User-Agent, Referrer. Gegen Missbrauch
-- steht die Ratenbegrenzung, und die braucht nichts davon in dieser Tabelle.

begin;

create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  subject text not null,
  message text not null,
  source text not null default 'contact_form',
  -- Der Betreiber setzt das in Studio, sobald die Anfrage beantwortet ist.
  -- Es ist zugleich die Grundlage für die Löschfrist.
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_requests_full_name_check
    check (char_length(btrim(full_name)) between 2 and 100),
  constraint contact_requests_email_check
    check (
      email = lower(email)
      and char_length(email) between 3 and 160
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  constraint contact_requests_subject_check
    check (char_length(btrim(subject)) between 3 and 150),
  constraint contact_requests_message_check
    check (char_length(btrim(message)) between 20 and 5000),
  constraint contact_requests_source_check
    check (source in ('contact_form', 'imprint'))
);

comment on table public.contact_requests is
  'Eingang des Kontaktformulars aus dem Impressum. Enthält nur, was der '
  'Absender selbst geschrieben hat — keine IP, kein User-Agent, kein Referrer.';

create index if not exists contact_requests_open_idx
  on public.contact_requests (created_at desc)
  where handled_at is null;

alter table public.contact_requests enable row level security;
alter table public.contact_requests force row level security;

revoke all on public.contact_requests from public, anon, authenticated;
grant select, insert, update, delete on public.contact_requests to service_role;

create trigger contact_requests_touch
  before update on public.contact_requests
  for each row execute function private.set_updated_at();

insert into public.retention_policies (
  record_type, retention_days, deletion_mode, is_enabled, notes
) values (
  'contact_requests',
  365,
  'operator_review',
  true,
  'Kontaktanfragen werden gelöscht, sobald das Anliegen erledigt ist. Die '
  || 'Frist von 365 Tagen ist die äußere Grenze für die Prüfung, nicht die '
  || 'Regelspeicherdauer. Eine Anfrage, die zu einem Vertrag führt, kann als '
  || 'Handelsbrief längeren gesetzlichen Aufbewahrungspflichten unterliegen '
  || 'und wird dann dort geführt, nicht hier.'
)
on conflict (record_type) do update
  set retention_days = excluded.retention_days,
      deletion_mode = excluded.deletion_mode,
      is_enabled = excluded.is_enabled,
      notes = excluded.notes,
      updated_at = now();

notify pgrst, 'reload schema';

commit;
