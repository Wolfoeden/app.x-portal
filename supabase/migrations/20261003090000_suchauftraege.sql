-- Suchaufträge: „XPORTAL sucht für Sie“.
--
-- Bis heute verschwand, wer als Gast suchte, ein Ergebnis sah und ging —
-- ohne Adresse, ohne Weg zurück. Im September waren das 32 Gäste mit 58
-- Suchen; keiner fragte einen Freelancer an. Ein Suchauftrag hält den Bedarf
-- fest: Kontakt, Zustimmung zu den Vermittlungsbedingungen, eine Notiz. Der
-- Betreiber ordnet Freelancer zu; daraus wird eine gewöhnliche Anfrage in
-- intro_bookings, und der weitere Weg — Vorstellung, Beauftragung, Rechnung —
-- ist derselbe wie bei einer Anfrage aus der Ergebnisliste.

begin;

create table if not exists public.search_mandates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  contact_email text not null check (
    char_length(contact_email) <= 320
    and contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  contact_company text check (char_length(contact_company) <= 200),
  contact_name text check (char_length(contact_name) <= 120),
  contact_phone text check (char_length(contact_phone) <= 40),
  note text check (char_length(note) <= 1000),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'introduced', 'closed', 'declined')),
  -- Die Fassung der Vermittlungsbedingungen, der zugestimmt wurde.
  terms_version text not null check (char_length(terms_version) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz
);

comment on table public.search_mandates is
  'Suchaufträge aus dem Chat: Kontakt und Zustimmung zu den Vermittlungsbedingungen; '
  'der Betreiber ordnet Freelancer zu, daraus entstehen Anfragen in intro_bookings.';

-- Ein offener Auftrag je Projekt. Ein zweiter Klick liefert den ersten zurück.
create unique index if not exists search_mandates_one_open_per_project
  on public.search_mandates (project_id)
  where status in ('open', 'in_progress');
create index if not exists search_mandates_status_created_idx
  on public.search_mandates (status, created_at desc);
create index if not exists search_mandates_owner_idx
  on public.search_mandates (owner_user_id, created_at desc);
create index if not exists search_mandates_handled_by_idx
  on public.search_mandates (handled_by);

alter table public.search_mandates enable row level security;
alter table public.search_mandates force row level security;
revoke all on public.search_mandates from anon, authenticated;
grant select, insert, update on public.search_mandates to service_role;

commit;
