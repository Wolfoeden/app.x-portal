begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'cddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'authenticated',
  'authenticated',
  'matching-v13@example.invalid',
  '',
  now(),
  now(),
  now()
);

insert into public.projects (
  id, owner_user_id, title, original_request, structured_brief, brief_status
) values (
  'cd000000-0000-4000-8000-000000000001',
  'cddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'Matching v13 test',
  'SAP MM and PP',
  '{"schemaVersion":2}'::jsonb,
  'ready'
);

select throws_ok(
  $$
    insert into public.shortlists (
      id, project_id, owner_user_id, matching_rule_version,
      brief_snapshot, result_count, profile_catalog_version
    ) values (
      'cd000000-0000-4000-8000-000000000002',
      'cd000000-0000-4000-8000-000000000001',
      'cddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'freelancer-match-v13',
      '{}'::jsonb,
      0,
      'catalog-v13'
    )
  $$,
  '23514',
  null,
  'v13 shortlists require a result status and decision snapshot'
);

select lives_ok(
  $$
    insert into public.shortlists (
      id, project_id, owner_user_id, matching_rule_version,
      brief_snapshot, result_count, profile_catalog_version,
      result_status, decision_snapshot, partial_matches_snapshot
    ) values (
      'cd000000-0000-4000-8000-000000000003',
      'cd000000-0000-4000-8000-000000000001',
      'cddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'freelancer-match-v13',
      '{}'::jsonb,
      0,
      'catalog-v13',
      'no_reliable_match',
      '{"schemaVersion":2,"partialProfileIds":[]}'::jsonb,
      '[{"recommendationRole":"partial"}]'::jsonb
    )
  $$,
  'v13 can persist bounded non-recommended partial snapshots without counting them as recommendations'
);

select throws_ok(
  $$
    insert into public.shortlists (
      id, project_id, owner_user_id, matching_rule_version,
      brief_snapshot, result_count, profile_catalog_version,
      result_status, decision_snapshot, partial_matches_snapshot
    ) values (
      'cd000000-0000-4000-8000-000000000004',
      'cd000000-0000-4000-8000-000000000001',
      'cddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'freelancer-match-v13',
      '{}'::jsonb,
      1,
      'catalog-v13',
      'ranked',
      '{"schemaVersion":2,"partialProfileIds":[]}'::jsonb,
      '[{"recommendationRole":"partial"}]'::jsonb
    )
  $$,
  '23514',
  null,
  'ranked v13 decisions cannot carry partial snapshots'
);

select throws_ok(
  $$
    insert into public.shortlists (
      id, project_id, owner_user_id, matching_rule_version,
      brief_snapshot, result_count, profile_catalog_version,
      result_status, decision_snapshot, partial_matches_snapshot
    ) values (
      'cd000000-0000-4000-8000-000000000005',
      'cd000000-0000-4000-8000-000000000001',
      'cddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'freelancer-match-v13',
      '{}'::jsonb,
      0,
      'catalog-v13',
      'no_reliable_match',
      '{"schemaVersion":2,"partialProfileIds":[]}'::jsonb,
      '[{}, {}, {}]'::jsonb
    )
  $$,
  '23514',
  null,
  'v13 stores at most two partial snapshots'
);

select * from finish();
rollback;
