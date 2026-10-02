-- Referenzprojekte und Links für Freelancer-Profile.
--
-- Karten und Profilansicht zeigten nur Text: keine Projekte, keine Wege, um
-- jemanden online nachzuschlagen. Diese Migration ergänzt beides, rein
-- additiv. Der Code erkennt eine fehlende Tabelle und zeigt dann schlicht
-- keine Projekte.
--
-- Projekte stammen vom Freelancer, vom Betreiber, aus der Bewerbung oder aus
-- einer Online-Recherche. Recherchierte Einträge tragen ihre Quelle und sind
-- unsichtbar, bis der Betreiber sie übernimmt (`is_public`). „Geprüft“ steht
-- nur mit `verified_at`.

begin;

create table if not exists public.freelancer_projects (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.freelancer_profiles (id) on delete cascade,
  position smallint not null check (position between 1 and 8),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  client_label text check (client_label is null or char_length(btrim(client_label)) between 2 and 120),
  industry text check (industry is null or char_length(btrim(industry)) between 2 and 80),
  project_role text check (project_role is null or char_length(btrim(project_role)) between 2 and 120),
  -- Monatsgenau: immer der Erste des Monats.
  started_on date check (started_on is null or extract(day from started_on) = 1),
  ended_on date check (ended_on is null or extract(day from ended_on) = 1),
  ongoing boolean not null default false,
  technologies text[] not null default '{}'
    check (cardinality(technologies) <= 12 and char_length(array_to_string(technologies, '|')) <= 600),
  outcome text check (outcome is null or char_length(btrim(outcome)) between 10 and 600),
  link_url text check (link_url is null or (link_url ~ '^https://\S+$' and char_length(link_url) <= 500)),
  is_public boolean not null default true,
  source text not null check (source in ('freelancer', 'operator', 'application', 'research')),
  source_url text check (source_url is null or (source_url ~ '^https://\S+$' and char_length(source_url) <= 500)),
  verified_at timestamptz,
  verified_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint freelancer_projects_period_check
    check (started_on is null or ended_on is null or ended_on >= started_on),
  constraint freelancer_projects_ongoing_check check (not ongoing or ended_on is null),
  constraint freelancer_projects_verifier_check check (verified_by is null or verified_at is not null),
  constraint freelancer_projects_research_source_check check (source <> 'research' or source_url is not null),
  -- Zugleich der Index für den Fremdschlüssel auf das Profil.
  constraint freelancer_projects_profile_position_key unique (profile_id, position)
);

create index if not exists freelancer_projects_verified_by_idx
  on public.freelancer_projects (verified_by);

drop trigger if exists freelancer_projects_set_updated_at on public.freelancer_projects;
create trigger freelancer_projects_set_updated_at
  before update on public.freelancer_projects
  for each row execute function private.set_updated_at();

comment on table public.freelancer_projects is
  'Referenzprojekte eines Profils, höchstens acht, in fester Reihenfolge. '
  'Recherchierte Einträge (source = research) bleiben unsichtbar, bis der Betreiber sie übernimmt.';

alter table public.freelancer_projects enable row level security;
alter table public.freelancer_projects force row level security;
revoke all on public.freelancer_projects from public, anon, authenticated;
grant select, insert, update, delete on public.freelancer_projects to service_role;

-- Wo man jemanden online findet: LinkedIn, Website, GitHub, Portfolio,
-- freelancermap. Höchstens sechs, nur https; geprüft wird im Code.
alter table public.freelancer_profiles
  add column if not exists profile_links jsonb not null default '[]'::jsonb;
alter table public.freelancer_profiles
  drop constraint if exists freelancer_profiles_profile_links_check;
alter table public.freelancer_profiles
  add constraint freelancer_profiles_profile_links_check
  check (
    jsonb_typeof(profile_links) = 'array'
    and jsonb_array_length(profile_links) <= 6
    and octet_length(profile_links::text) <= 4000
  );

-- Ersetzt die Projektliste eines Profils in einem Zug: Die Reihenfolge der
-- Einträge ist die Position. Scheitert ein Eintrag, bleibt die alte Liste.
create or replace function public.replace_freelancer_projects(p_profile_id uuid, p_projects jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_projects is null or jsonb_typeof(p_projects) <> 'array' or jsonb_array_length(p_projects) > 8 then
    raise exception using errcode = '22023', message = 'projects must be an array of at most 8 entries';
  end if;

  perform 1 from public.freelancer_profiles where id = p_profile_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'profile not found';
  end if;

  delete from public.freelancer_projects where profile_id = p_profile_id;

  insert into public.freelancer_projects (
    profile_id, position, title, client_label, industry, project_role,
    started_on, ended_on, ongoing, technologies, outcome, link_url,
    is_public, source, source_url, verified_at, verified_by, created_at
  )
  select
    p_profile_id,
    e.ord::smallint,
    e.item ->> 'title',
    nullif(e.item ->> 'client_label', ''),
    nullif(e.item ->> 'industry', ''),
    nullif(e.item ->> 'project_role', ''),
    nullif(e.item ->> 'started_on', '')::date,
    nullif(e.item ->> 'ended_on', '')::date,
    coalesce((e.item ->> 'ongoing')::boolean, false),
    coalesce(array(select jsonb_array_elements_text(coalesce(e.item -> 'technologies', '[]'::jsonb))), '{}'),
    nullif(e.item ->> 'outcome', ''),
    nullif(e.item ->> 'link_url', ''),
    coalesce((e.item ->> 'is_public')::boolean, true),
    e.item ->> 'source',
    nullif(e.item ->> 'source_url', ''),
    nullif(e.item ->> 'verified_at', '')::timestamptz,
    nullif(e.item ->> 'verified_by', '')::uuid,
    coalesce(nullif(e.item ->> 'created_at', '')::timestamptz, now())
  from jsonb_array_elements(p_projects) with ordinality as e(item, ord);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_freelancer_projects(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_freelancer_projects(uuid, jsonb) to service_role;

commit;
