-- Beschaffungsläufe und die Einladungen, die aus ihnen entstehen.
--
-- Die Auswertung unter /chat/admin/demand endet bisher mit der Empfehlung
-- „Beschaffen" und niemand beschafft. Diese Migration legt die zwei Tabellen
-- an, die aus der Empfehlung einen nachvollziehbaren Vorgang machen: was zu
-- welchem Bedarf gesucht wurde, und wer daraufhin welche Nachricht bekommen
-- hat.
--
-- Warum nicht `external_freelancer_search_results` mitbenutzen: Dort sind
-- `owner_user_id` und `project_id` Pflicht, weil jede Zeile dort belegt, was
-- ein Kunde bezahlt hat. Ein Beschaffungslauf hat weder Kunde noch Projekt —
-- ihn dort einzutragen hieße, den Nachweis der bezahlten Leistung mit den
-- eigenen Läufen zu vermischen.
--
-- Warum nicht `outreach_log` mitbenutzen: Die Tabelle ist leer und wird vom
-- Anwendungscode nirgends gelesen oder geschrieben; ihre Spalten
-- (`lead_id`, `company`, `match_count`) beschreiben die Ansprache an
-- Auftraggeber. Eine tote Tabelle mit fremdem Zuschnitt umzudeuten wäre
-- billiger zu schreiben und teurer zu lesen.

begin;

-- 1. Der Lauf ----------------------------------------------------------------

create table if not exists public.sourcing_runs (
  id uuid primary key default gen_random_uuid(),
  -- Der Bedarf, aus dem der Lauf entstand. Schlüssel und Beschriftung so, wie
  -- `search-demand-analysis.ts` sie bildet.
  demand_profile_key text not null check (char_length(demand_profile_key) between 1 and 200),
  demand_profile_label text not null check (char_length(demand_profile_label) between 1 and 200),
  -- Wonach tatsächlich gesucht wurde. Das kann weniger sein als das Profil
  -- hergibt: Nicht zu jedem Skill gibt es bei der Quelle eine Liste.
  skills text[] not null default '{}',
  source text not null default 'freelancermap'
    check (source in ('freelancermap')),
  found_count integer not null default 0 check (found_count >= 0),
  addressable_count integer not null default 0 check (addressable_count >= 0),
  imported_count integer not null default 0 check (imported_count >= 0),
  -- Skills, zu denen die Quelle keine Liste hat. Sichtbar, damit eine Lücke
  -- nicht stillschweigend unbearbeitet bleibt.
  skipped_skills text[] not null default '{}',
  triggered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.sourcing_runs is
  'Ein Beschaffungslauf: Was zu einem Nachfrageprofil bei einer externen '
  'Quelle gesucht wurde und was dabei herauskam.';

-- Ein Lauf je Profil und Tag. Die Kostenbremse sitzt in der Datenbank und
-- nicht im Anwendungscode, damit auch ein doppelter Klick sie nicht umgeht.
--
-- `at time zone 'UTC'` ist nicht Kosmetik: `created_at::date` allein hängt von
-- der Sitzungszeitzone ab und ist deshalb nicht IMMUTABLE — Postgres lehnt
-- den Index rundheraus ab. Der Tag ist damit ein UTC-Tag; das ist für eine
-- Kostenbremse die richtige Wahl, weil er nicht zur Zeitumstellung springt.
create unique index if not exists sourcing_runs_profile_day_idx
  on public.sourcing_runs (
    demand_profile_key,
    ((created_at at time zone 'UTC')::date)
  );

create index if not exists sourcing_runs_created_idx
  on public.sourcing_runs (created_at desc);

-- 2. Die Einladung -----------------------------------------------------------

create table if not exists public.sourcing_outreach (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.sourcing_runs (id) on delete set null,
  -- Der Kandidat. Bleibt leer, wenn dessen Zeile später gelöscht wird — der
  -- Versandbeleg überlebt den Kandidaten, sonst verschwände mit der
  -- 30-Tage-Löschung auch der Nachweis, dass jemand angeschrieben wurde.
  application_id uuid references public.freelancer_applications (id) on delete set null,
  demand_profile_label text,
  recipient_email text not null check (char_length(recipient_email) between 3 and 254),
  recipient_name text,
  profile_url text check (profile_url is null or profile_url ~ '^https://'),
  channel text not null default 'email'
    check (channel in ('email', 'linkedin', 'website', 'other')),
  subject text,
  body_text text,
  status text not null
    check (status in ('sent', 'failed', 'suppressed', 'manual')),
  error text,
  created_at timestamptz not null default now()
);

comment on table public.sourcing_outreach is
  'Wer aus einem Beschaffungslauf welche Nachricht bekommen hat — auch dann, '
  'wenn der Versand scheiterte oder die Sperrliste ihn aufhielt.';

comment on column public.sourcing_outreach.status is
  'sent = zugestellt, failed = Versand gescheitert, suppressed = Widerspruch '
  'lag vor, manual = kein Kanal für automatischen Versand (LinkedIn, XING, '
  'Kontaktformular der Plattform).';

create index if not exists sourcing_outreach_created_idx
  on public.sourcing_outreach (created_at desc);

create index if not exists sourcing_outreach_run_idx
  on public.sourcing_outreach (run_id);

-- Dieselbe Person nicht zweimal einladen. Ein gescheiterter Versuch darf
-- wiederholt werden, ein zugestellter nicht.
create unique index if not exists sourcing_outreach_sent_once_idx
  on public.sourcing_outreach (lower(recipient_email))
  where status = 'sent';

-- 3. Zugriff -----------------------------------------------------------------
--
-- Wie bei `leadgen_queue`: nur `service_role`. Beide Tabellen enthalten
-- personenbezogene Daten von Menschen, die von XPORTAL noch nichts wissen —
-- sie gehören nicht in die Reichweite eines angemeldeten Kontos.

alter table public.sourcing_runs enable row level security;
alter table public.sourcing_runs force row level security;
alter table public.sourcing_outreach enable row level security;
alter table public.sourcing_outreach force row level security;

revoke all on public.sourcing_runs from anon, authenticated;
revoke all on public.sourcing_outreach from anon, authenticated;

-- Die Rechte für `service_role` ausdrücklich setzen und nicht darauf bauen,
-- dass die Standardrechte des Projekts sie schon mitbringen.
--
-- Gelernt beim ersten Versand: Die Mail ging raus, der Beleg nicht. Die
-- Tabelle hatte für `service_role` nur REFERENCES, TRIGGER und TRUNCATE —
-- der INSERT scheiterte, und weil sein Fehler nicht geprüft wurde, blieb es
-- unbemerkt. Beides ist repariert; das hier ist die eine Hälfte.
grant select, insert, update, delete on public.sourcing_runs to service_role;
grant select, insert, update, delete on public.sourcing_outreach to service_role;

commit;
