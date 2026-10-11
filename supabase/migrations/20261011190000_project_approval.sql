-- Referenzprojekte erst nach Freigabe sichtbar (Oktober 2026).
--
-- Ein Freelancer darf sein Profil nach der Prüfung weiter selbst pflegen
-- (Honorar, Verfügbarkeit, Kompetenzen). Projekte, die er neu anlegt oder
-- inhaltlich ändert, sieht ein Kunde aber erst, wenn XPORTAL sie freigegeben
-- hat: `approved_at` ist gesetzt. Das ist etwas anderes als „geprüft“
-- (`verified_at`, mit Nachweis): Ein freigegebenes Projekt kann weiter nur
-- „angegeben“ sein.
--
-- Alles, was bisher öffentlich war, gilt als freigegeben; es verschwindet
-- also nichts.

begin;

alter table public.freelancer_projects
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users (id) on delete set null;

update public.freelancer_projects
set approved_at = coalesce(verified_at, created_at),
    approved_by = verified_by
where approved_at is null;

alter table public.freelancer_projects
  drop constraint if exists freelancer_projects_approver_check;
alter table public.freelancer_projects
  add constraint freelancer_projects_approver_check check (approved_by is null or approved_at is not null);

create index if not exists freelancer_projects_approved_by_idx
  on public.freelancer_projects (approved_by);

-- Die Liste „Projekte zur Freigabe“ im Admin-Bereich.
create index if not exists freelancer_projects_pending_idx
  on public.freelancer_projects (updated_at desc)
  where approved_at is null and is_public;

comment on column public.freelancer_projects.approved_at is
  'Freigabe durch XPORTAL. Ohne Freigabe sieht kein Kunde das Projekt, auch wenn is_public gesetzt ist.';

-- Wie 20261006090000, zusätzlich mit Freigabe. Fehlt der Schlüssel
-- `approved_at` im Eintrag (ältere App-Version während des Deploys), gilt das
-- Projekt wie bisher als freigegeben; die neue App schickt ihn immer mit.
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
    is_public, source, source_url, verified_at, verified_by,
    approved_at, approved_by, created_at
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
    -- `-> 'approved_at'` ist SQL-NULL nur, wenn der Schlüssel fehlt (JSON-null zählt als vorhanden).
    case when (e.item -> 'approved_at') is not null then nullif(e.item ->> 'approved_at', '')::timestamptz else now() end,
    case when (e.item -> 'approved_at') is not null then nullif(e.item ->> 'approved_by', '')::uuid else null end,
    coalesce(nullif(e.item ->> 'created_at', '')::timestamptz, now())
  from jsonb_array_elements(p_projects) with ordinality as e(item, ord);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_freelancer_projects(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_freelancer_projects(uuid, jsonb) to service_role;

commit;
