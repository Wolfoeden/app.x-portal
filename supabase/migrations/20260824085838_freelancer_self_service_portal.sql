-- Authenticated freelancer self-service, public profile avatars and private.
-- impression/click analytics. Browser clients still cannot enumerate or write
-- the curated catalogue: validated server routes retain service-role authority.

alter table public.freelancer_profiles
  add column owner_user_id uuid references auth.users (id) on delete set null,
  add column avatar_path text;

alter table public.freelancer_profiles
  add constraint freelancer_profiles_avatar_path_check
  check (
    avatar_path is null
    or avatar_path ~ (
      '^' || id::text ||
      '/avatar-[0-9a-f]{32}\.(jpg|jpeg|png|webp)$'
    )
  );

create unique index freelancer_profiles_owner_uidx
  on public.freelancer_profiles (owner_user_id)
  where owner_user_id is not null;

create index freelancer_applications_submitted_user_updated_idx
  on public.freelancer_applications (submitted_by_user_id, updated_at desc)
  where submitted_by_user_id is not null;

-- Existing approved applications are the only trustworthy automatic ownership
-- source. Rows without an authenticated applicant remain operator-unassigned.
with ownership_candidates as (
  select
    application.published_profile_id,
    application.submitted_by_user_id,
    row_number() over (
      partition by application.submitted_by_user_id
      order by application.reviewed_at desc nulls last, application.id
    ) as owner_rank
  from public.freelancer_applications as application
  where application.status = 'approved'
    and application.published_profile_id is not null
    and application.submitted_by_user_id is not null
)
update public.freelancer_profiles as profile
set owner_user_id = candidate.submitted_by_user_id
from ownership_candidates as candidate
where candidate.published_profile_id = profile.id
  and candidate.owner_rank = 1
  and profile.owner_user_id is null
  and not exists (
    select 1
    from public.freelancer_profiles as already_owned
    where already_owned.owner_user_id = candidate.submitted_by_user_id
      and already_owned.id <> profile.id
  );

create table public.freelancer_profile_events (
  id uuid primary key default gen_random_uuid(),
  event_key uuid not null unique,
  profile_id uuid not null
    references public.freelancer_profiles (id) on delete cascade,
  event_type text not null,
  source text not null,
  occurred_at timestamptz not null default now(),
  constraint freelancer_profile_events_type_check
    check (event_type in ('profile_view', 'booking_click')),
  constraint freelancer_profile_events_source_check
    check (source in ('profile_card', 'booking_link')),
  constraint freelancer_profile_events_pair_check
    check (
      (event_type = 'profile_view' and source = 'profile_card')
      or (event_type = 'booking_click' and source = 'booking_link')
    )
);

create index freelancer_profile_events_profile_type_time_idx
  on public.freelancer_profile_events
  (profile_id, event_type, occurred_at desc);

alter table public.freelancer_profile_events enable row level security;
alter table public.freelancer_profile_events force row level security;

revoke all privileges on table public.freelancer_profile_events from public;
revoke all privileges on table public.freelancer_profile_events
  from anon, authenticated, service_role;
grant select, insert, delete on table public.freelancer_profile_events
  to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'freelancer-avatars',
  'freelancer-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects write policy is created. A trusted route checks profile
-- ownership and issues a single-object signed upload token. Public reads are
-- intentional because the avatar is part of the published freelancer profile.

insert into public.retention_policies (
  record_type,
  retention_days,
  deletion_mode,
  is_enabled,
  notes
) values (
  'freelancer_profile_events',
  730,
  'operator_review',
  true,
  'Keep aggregateable view and booking-click events for up to two years; raw events contain no customer identity, IP address or project content.'
)
on conflict (record_type) do update set
  retention_days = excluded.retention_days,
  deletion_mode = excluded.deletion_mode,
  is_enabled = excluded.is_enabled,
  notes = excluded.notes;

-- Storage deletion cannot be part of a Postgres transaction. The server first
-- hides the profile, removes avatar/CV objects, and only then calls this
-- service-role-only transaction to remove catalogue and dependent product rows.
create or replace function public.delete_freelancer_profile_cascade(
  p_profile_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_shortlist_ids uuid[];
  v_deleted boolean := false;
begin
  if p_profile_id is null then
    raise exception 'profile id is required' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct shortlist_id), '{}'::uuid[])
  into v_shortlist_ids
  from public.matches
  where freelancer_profile_id = p_profile_id;

  delete from public.engagements
  where freelancer_profile_id = p_profile_id;

  delete from public.intro_bookings
  where freelancer_profile_id = p_profile_id;

  delete from public.matches
  where freelancer_profile_id = p_profile_id;

  update public.shortlists as shortlist
  set result_count = (
    select count(*)::smallint
    from public.matches as remaining
    where remaining.shortlist_id = shortlist.id
  )
  where shortlist.id = any(v_shortlist_ids);

  delete from public.freelancer_applications
  where published_profile_id = p_profile_id;

  -- This metadata uses ON DELETE RESTRICT so the Storage object must already be
  -- gone and the controller must explicitly remove the final reference.
  delete from public.freelancer_cv_documents
  where profile_id = p_profile_id;

  delete from public.freelancer_profiles
  where id = p_profile_id;
  v_deleted := found;

  return v_deleted;
end;
$$;

revoke all on function public.delete_freelancer_profile_cascade(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_freelancer_profile_cascade(uuid)
  to service_role;

comment on function public.delete_freelancer_profile_cascade(uuid) is
  'Service-role-only transactional cleanup after owned freelancer Storage objects have been removed.';

-- Preserve the existing service-only catalogue boundary explicitly after the
-- new columns are added. New Data API defaults do not make this implicit.
revoke all privileges on table public.freelancer_profiles
  from public, anon, authenticated;
grant select, insert, update, delete on table public.freelancer_profiles
  to service_role;
