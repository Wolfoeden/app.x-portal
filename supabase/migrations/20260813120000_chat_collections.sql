begin;

create table public.project_collections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint project_collections_name_check
    check (char_length(btrim(name)) between 1 and 120)
);

alter table public.projects
  add column collection_id uuid references public.project_collections (id) on delete set null;

create index project_collections_owner_active_idx
  on public.project_collections (owner_user_id, updated_at desc)
  where archived_at is null;
create index projects_owner_collection_updated_idx
  on public.projects (owner_user_id, collection_id, updated_at desc);

alter table public.project_collections enable row level security;
alter table public.project_collections force row level security;

create policy project_collections_select_own
  on public.project_collections for select to authenticated
  using ((select auth.uid()) = owner_user_id);
revoke all on public.project_collections from public, anon;
grant select on public.project_collections to authenticated;
grant all on public.project_collections to service_role;

notify pgrst, 'reload schema';
commit;
