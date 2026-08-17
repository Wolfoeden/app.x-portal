-- The curated catalogue is maintained only by trusted server/operator paths.
-- Anonymous Supabase users also use the authenticated database role, so even
-- an INSERT-only grant would let a browser inject a production candidate.
drop policy if exists freelancer_profiles_insert_authenticated
  on public.freelancer_profiles;

revoke all privileges on table public.freelancer_profiles from public;
revoke all privileges on table public.freelancer_profiles from anon, authenticated;

grant select, insert, update, delete on table public.freelancer_profiles
  to service_role;
