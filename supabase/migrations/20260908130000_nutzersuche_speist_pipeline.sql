-- Die bezahlte Nutzersuche speist die Freelancer-Pipeline.
--
-- Bisher endete eine Websuche, die ein Auftraggeber ausgelöst hat, in drei
-- Karten für ihn — und die gefundenen Menschen blieben im `result_snapshot`
-- liegen, bis jemand im Adminbereich auf „Übernehmen" drückte. Das ist nie
-- passiert: acht Suchläufe, dreizehn gefundene Menschen, null Kandidaten.
--
-- Dabei ist gerade diese Suche der stärkste Anlass für eine Einladung: Es
-- sucht nicht irgendwer, sondern ein Auftraggeber mit einem konkreten
-- Projekt. Genau das soll in der Nachricht stehen können.

begin;

-- 1. Der Anlass der Einladung ------------------------------------------------
--
-- Was gesucht wurde, wandert mit dem Kandidaten mit: Thema, Arbeitsform, Ort
-- und die Anforderungen, die sein Profil erfüllt. Ohne das bliebe die
-- Einladung bei „Ein Unternehmen sucht Unterstützung in Ihrem Fachgebiet",
-- obwohl der Anlass viel konkreter ist.
--
-- Als jsonb und nicht als Spalten: Das ist der Textbaustein einer Nachricht,
-- kein Merkmal, nach dem je gefiltert wird.

alter table public.freelancer_applications
  add column if not exists sourcing_demand jsonb;

comment on column public.freelancer_applications.sourcing_demand is
  'Der Bedarf, aus dem dieser Kandidat stammt — Thema, Arbeitsform, Ort und '
  'die erfüllten Anforderungen. Grundlage der Einladung, kein Filtermerkmal.';

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_sourcing_demand_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_sourcing_demand_check
  check (
    sourcing_demand is null
    or (
      jsonb_typeof(sourcing_demand) = 'object'
      and pg_column_size(sourcing_demand) <= 4000
    )
  );

-- 2. Woher der Kandidat kam --------------------------------------------------
--
-- `source = 'web_research'` sagt bisher nur „nicht selbst beworben". Für die
-- Auswertung ist der Unterschied wesentlich: Ein Kandidat aus einer bezahlten
-- Kundensuche belegt echte Nachfrage, einer aus einem Beschaffungslauf nur
-- unsere eigene Vermutung.

alter table public.freelancer_applications
  add column if not exists sourcing_origin text;

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_sourcing_origin_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_sourcing_origin_check
  check (
    sourcing_origin is null
    or sourcing_origin in ('user_search', 'demand_run', 'manual')
  );

comment on column public.freelancer_applications.sourcing_origin is
  'user_search = aus der bezahlten Suche eines Auftraggebers, demand_run = '
  'aus einem Beschaffungslauf zu einem Nachfrageprofil, manual = von Hand.';

create index if not exists freelancer_applications_ohne_adresse_idx
  on public.freelancer_applications (created_at)
  where source = 'web_research' and status = 'sourced' and contact_email is null;

-- 3. Der Schalter ------------------------------------------------------------
--
-- Automatische Abläufe bekommen bei XPORTAL immer einen Schalter im
-- Adminbereich und einen Knopf für den Einzelfall. Hier ist er besonders
-- nötig: Mit dem Anlegen eines Kandidaten beginnt die Frist aus Art. 14 DSGVO,
-- und das Auflösen einer Adresse kostet Geld.

create table if not exists public.sourcing_automation (
  id boolean primary key default true check (id),
  -- Kandidaten aus einer Kundensuche automatisch anlegen.
  absorb_user_searches boolean not null default false,
  -- Zu Kandidaten ohne Adresse selbsttätig eine suchen.
  resolve_addresses boolean not null default false,
  -- Höchstzahl Adressauflösungen je Tag. Jede kostet rund fünf Cent.
  daily_address_budget integer not null default 20
    check (daily_address_budget between 0 and 500),
  -- Einladungen selbsttätig verschicken. Vorgabe aus: Wer angeschrieben wird,
  -- soll vorher von einem Menschen gesehen worden sein.
  auto_invite boolean not null default false,
  paused_until timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.sourcing_automation is
  'Die Betriebsarten der Beschaffung. Eine Zeile. Der Knopf im Adminbereich '
  'wirkt in jeder Betriebsart — „aus" heißt „von selbst passiert nichts".';

insert into public.sourcing_automation (id) values (true)
on conflict (id) do nothing;

alter table public.sourcing_automation enable row level security;
alter table public.sourcing_automation force row level security;
revoke all on public.sourcing_automation from anon, authenticated;
grant select, insert, update on public.sourcing_automation to service_role;

commit;
