-- Defense in depth for environments upgraded from an earlier V1 build: booking
-- URLs are released only after an explicit introduction click and therefore do
-- not belong in owner-readable shortlist snapshots.

begin;

update public.matches
set profile_snapshot = jsonb_set(
  profile_snapshot,
  '{introPolicy,bookingUrl}',
  'null'::jsonb,
  true
)
where profile_snapshot #>> '{introPolicy,bookingUrl}' is not null;

commit;
