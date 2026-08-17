begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'authenticated',
  'authenticated',
  'matching-v12@example.invalid',
  '',
  now(),
  now(),
  now()
);

insert into public.projects (
  id,
  owner_user_id,
  title,
  original_request,
  structured_brief,
  brief_status
) values (
  'cb000000-0000-4000-8000-000000000001',
  'cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'Matching v12 test',
  'KI trainer remote',
  '{"schemaVersion":2}'::jsonb,
  'ready'
);

select throws_ok(
  $$
    insert into public.shortlists (
      id, project_id, owner_user_id, matching_rule_version,
      brief_snapshot, result_count, profile_catalog_version
    ) values (
      'cb000000-0000-4000-8000-000000000002',
      'cb000000-0000-4000-8000-000000000001',
      'cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'freelancer-match-v12',
      '{}'::jsonb,
      0,
      'catalog-v12'
    )
  $$,
  '23514',
  null,
  'v12 shortlists require a result status and decision snapshot'
);

select lives_ok(
  $$
    insert into public.shortlists (
      id, project_id, owner_user_id, matching_rule_version,
      brief_snapshot, result_count, profile_catalog_version,
      result_status, decision_snapshot
    ) values (
      'cb000000-0000-4000-8000-000000000003',
      'cb000000-0000-4000-8000-000000000001',
      'cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'freelancer-match-v12',
      '{}'::jsonb,
      0,
      'catalog-v12',
      'no_reliable_match',
      '{"schemaVersion":1}'::jsonb
    )
  $$,
  'v12 zero-result decisions remain auditable'
);

select * from finish();
rollback;
