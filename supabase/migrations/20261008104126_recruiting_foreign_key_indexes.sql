-- Follow-up to the recruiting migrations: indexed foreign keys keep deletes
-- and joins bounded. Existing data and authorization policies are unchanged.
begin;
create index if not exists intro_bookings_legacy_mandate_id_idx
  on public.intro_bookings (legacy_mandate_id);
create index if not exists recruiting_billing_grants_user_id_idx
  on public.recruiting_billing_grants (user_id);
commit;
