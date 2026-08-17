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
  'caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'authenticated',
  'authenticated',
  'matching-v11@example.invalid',
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
  'ca000000-0000-4000-8000-000000000001',
  'caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Matching v11 test',
  'Python freelancer',
  '{"schemaVersion":2}'::jsonb,
  'ready'
);

select throws_ok(
  $$
    insert into public.shortlists (
      id, project_id, owner_user_id, matching_rule_version,
      brief_snapshot, result_count, profile_catalog_version
    ) values (
      'ca000000-0000-4000-8000-000000000002',
      'ca000000-0000-4000-8000-000000000001',
      'caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'freelancer-match-v11',
      '{}'::jsonb,
      0,
      'catalog-v11'
    )
  $$,
  '23514',
  null,
  'v11 shortlists require a result status and decision snapshot'
);

select throws_ok(
  $$
    insert into public.shortlists (
      id, project_id, owner_user_id, matching_rule_version,
      brief_snapshot, result_count, profile_catalog_version,
      result_status, decision_snapshot
    ) values (
      'ca000000-0000-4000-8000-000000000003',
      'ca000000-0000-4000-8000-000000000001',
      'caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'freelancer-match-v11',
      '{}'::jsonb,
      0,
      'catalog-v11',
      'ranked',
      '{}'::jsonb
    )
  $$,
  '23514',
  null,
  'ranked shortlists cannot be empty'
);

select throws_ok(
  $$
    insert into public.shortlists (
      id, project_id, owner_user_id, matching_rule_version,
      brief_snapshot, result_count, profile_catalog_version,
      result_status, decision_snapshot
    ) values (
      'ca000000-0000-4000-8000-000000000004',
      'ca000000-0000-4000-8000-000000000001',
      'caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'freelancer-match-v11',
      '{}'::jsonb,
      1,
      'catalog-v11',
      'no_reliable_match',
      '{}'::jsonb
    )
  $$,
  '23514',
  null,
  'no-reliable-match shortlists cannot contain results'
);

select lives_ok(
  $$
    insert into public.shortlists (
      id, project_id, owner_user_id, matching_rule_version,
      brief_snapshot, result_count, profile_catalog_version
    ) values (
      'ca000000-0000-4000-8000-000000000005',
      'ca000000-0000-4000-8000-000000000001',
      'caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'freelancer-match-v10',
      '{}'::jsonb,
      0,
      'catalog-v10'
    )
  $$,
  'legacy zero-result shortlists remain nullable and readable'
);

select * from finish();
rollback;
