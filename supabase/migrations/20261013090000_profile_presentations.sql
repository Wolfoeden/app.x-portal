-- Aufbereitung der öffentlichen Profilseite (Oktober 2026).
--
-- Ein Recruiter soll auf /profil/<id> in einer Sekunde sehen, was jemand
-- kann: ein Satz zur Kernaussage, die Zusammenfassung auf Deutsch und die
-- Kompetenzen in wenigen Schwerpunkten statt einer Wand aus Begriffen.
-- Das erzeugt ein Sprachmodell einmal je Inhaltsstand; hier liegt das
-- Ergebnis, damit nicht jeder Aufruf neu fragt.
--
-- `input_hash` ist der Fingerabdruck der Angaben, aus denen die Aufbereitung
-- entstand (Rolle, Zusammenfassung, Kompetenzen, Branchen, Abschlüsse).
-- Ändert der Freelancer davon etwas, passt der Fingerabdruck nicht mehr und
-- die Seite zeigt bis zur neuen Aufbereitung die Rohdaten.
--
-- Nur der Server liest und schreibt (service_role); kein Zugriff für anon
-- oder authenticated.

create table if not exists public.freelancer_profile_presentations (
  profile_id uuid primary key references public.freelancer_profiles (id) on delete cascade,
  input_hash text not null check (char_length(input_hash) between 16 and 128),
  presentation jsonb,
  status text not null default 'ok' check (status in ('ok', 'failed')),
  model text check (model is null or char_length(model) <= 120),
  created_at timestamptz not null default now()
);

comment on table public.freelancer_profile_presentations is
  'Sprachmodell-Aufbereitung der öffentlichen Profilseite je Inhaltsstand (input_hash). Nur service_role.';

alter table public.freelancer_profile_presentations enable row level security;

revoke all on table public.freelancer_profile_presentations from public, anon, authenticated;
grant select, insert, update on table public.freelancer_profile_presentations to service_role;
