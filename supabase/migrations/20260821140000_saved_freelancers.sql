-- Saved freelancers: the "Mein Team" list.
--
-- "Profil merken" previously set React state and nothing else, so the mark was
-- gone on the next chat. This gives it a home.
--
-- Guests deliberately cannot own a saved profile. The route establishes the
-- identity and refuses anonymous sessions before writing, and the trigger
-- below refuses them again at the table, so a future caller cannot create a
-- row that the account-only UI would never show again.
--
-- No entry is added to claim_guest_workspace: a guest can never hold a row
-- here, so there is nothing to transfer when they register.

begin;

create table public.saved_freelancers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  freelancer_id uuid not null
    references public.freelancer_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Marking the same profile twice is the same intent, not a second entry.
  constraint saved_freelancers_unique unique (owner_user_id, freelancer_id)
);

-- The list is always read newest-first for one owner.
create index saved_freelancers_owner_idx
  on public.saved_freelancers (owner_user_id, created_at desc);

create or replace function private.reject_anonymous_saved_freelancer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from auth.users u
    where u.id = new.owner_user_id
      and coalesce(u.is_anonymous, false) = false
  ) then
    raise exception 'saved freelancers require a permanent account'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger saved_freelancers_require_account
  before insert or update of owner_user_id on public.saved_freelancers
  for each row execute function private.reject_anonymous_saved_freelancer();

alter table public.saved_freelancers enable row level security;
alter table public.saved_freelancers force row level security;

-- Read-only for the owner. Every write goes through the service role, which is
-- the same shape project_collections uses.
create policy saved_freelancers_select_own
  on public.saved_freelancers for select to authenticated
  using ((select auth.uid()) = owner_user_id);

revoke all on public.saved_freelancers from public, anon;
grant select on public.saved_freelancers to authenticated;
grant all on public.saved_freelancers to service_role;

revoke all on function private.reject_anonymous_saved_freelancer()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
