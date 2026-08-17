-- Run after migrations with a privileged test connection, for example:
--   supabase test db supabase/tests/database/rls_isolation.test.sql
-- The transaction is rolled back and never leaves fixture data or temporary
-- privilege changes behind.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Stable, synthetic auth identities for isolation tests.
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
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'authenticated',
    'authenticated',
    'rls-user-a@example.invalid',
    '',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'authenticated',
    'authenticated',
    'rls-user-b@example.invalid',
    '',
    now(),
    now(),
    now()
  );

insert into public.user_profiles (id, display_name)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'RLS User A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'RLS User B');

insert into public.project_collections (id, owner_user_id, name) values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'User A folder'),
  ('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'User B folder');

insert into public.projects (
  id,
  owner_user_id,
  title,
  original_request,
  structured_brief,
  brief_status
) values
  (
    'a1000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'User A project',
    'I need a German-speaking React freelancer next month.',
    '{"required_skills":["react"],"language":"de","mode":"remote"}'::jsonb,
    'ready'
  ),
  (
    'b1000000-0000-4000-8000-000000000001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'User B project',
    'I need a German-speaking requirements analyst.',
    '{"required_skills":["requirements management"],"language":"de"}'::jsonb,
    'ready'
  );

insert into public.messages (
  id,
  project_id,
  owner_user_id,
  role,
  content,
  client_message_id
) values
  (
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'user',
    'React and German are required.',
    'rls-a-message-001'
  ),
  (
    'b2000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'user',
    'Requirements management is required.',
    'rls-b-message-001'
  );

insert into public.freelancer_profiles (
  id,
  slug,
  display_name,
  role_title,
  skill_tags,
  languages,
  work_modes,
  experience_summary,
  profile_status,
  availability_status,
  intro_policy,
  demo_status
) values
  (
    'c1000000-0000-4000-8000-000000000001',
    'rls-active-profile',
    'Active Demo Profile',
    'React Engineer',
    array['react', 'typescript'],
    array['de', 'en'],
    array['remote'],
    'Synthetic active profile used only by the RLS test.',
    'active',
    'available',
    'free',
    'demo'
  ),
  (
    'c1000000-0000-4000-8000-000000000002',
    'rls-paused-profile',
    'Paused Demo Profile',
    'React Engineer',
    array['react', 'typescript'],
    array['de', 'en'],
    array['remote'],
    'Synthetic paused profile used only by the RLS test.',
    'paused',
    'available',
    'free',
    'demo'
  );

insert into public.shortlists (
  id,
  project_id,
  owner_user_id,
  matching_rule_version,
  brief_snapshot,
  result_count,
  profile_catalog_version
) values
  (
    'a3000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'deterministic-v1',
    '{"required_skills":["react"]}'::jsonb,
    0,
    'test-catalog-v1'
  ),
  (
    'b3000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'deterministic-v1',
    '{"required_skills":["requirements management"]}'::jsonb,
    1,
    'test-catalog-v1'
  );

insert into public.matches (
  id,
  shortlist_id,
  project_id,
  owner_user_id,
  freelancer_profile_id,
  position,
  match_reasons,
  known_gaps,
  profile_snapshot,
  matching_rule_version,
  profile_data_version
) values (
  'b4000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'c1000000-0000-4000-8000-000000000001',
  1,
  array['Required skill is present'],
  array[]::text[],
  '{"display_name":"Active Demo Profile","demo_status":"demo"}'::jsonb,
  'deterministic-v1',
  1
);

insert into public.intro_bookings (
  id,
  project_id,
  owner_user_id,
  freelancer_profile_id,
  match_id,
  intro_policy_snapshot,
  status,
  idempotency_key,
  explicit_confirmation_at
) values (
  'b5000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'c1000000-0000-4000-8000-000000000001',
  'b4000000-0000-4000-8000-000000000001',
  'free',
  'requested',
  'rls-user-b-intro-001',
  now()
);

insert into public.engagements (
  id,
  project_id,
  owner_user_id,
  freelancer_profile_id,
  intro_booking_id,
  status,
  confirmation_source,
  confirmed_at
) values (
  'b6000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'c1000000-0000-4000-8000-000000000001',
  'b5000000-0000-4000-8000-000000000001',
  'proposed',
  'operator',
  now()
);

select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in (
        'user_profiles', 'projects', 'project_collections', 'messages', 'freelancer_profiles',
        'shortlists', 'matches', 'intro_bookings', 'engagements',
        'engagement_status_events', 'audit_events', 'ai_usage_buckets',
        'ai_usage_reservations', 'user_ai_credit_accounts', 'guest_claims',
        'retention_policies'
      )
      and not c.relrowsecurity
  ),
  0,
  'RLS is enabled on every V1 public table'
);

select ok(
  has_table_privilege('authenticated', 'public.projects', 'SELECT')
  and not has_table_privilege('authenticated', 'public.projects', 'INSERT')
  and not has_table_privilege('authenticated', 'public.projects', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.projects', 'DELETE'),
  'authenticated clients can read projects but all project writes are server-only'
);

select ok(
  has_table_privilege('authenticated', 'public.messages', 'SELECT')
  and not has_table_privilege('authenticated', 'public.messages', 'INSERT')
  and not has_table_privilege('authenticated', 'public.messages', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.messages', 'DELETE'),
  'authenticated clients can read messages but all message writes are server-only'
);

select ok(
  has_table_privilege('authenticated', 'public.project_collections', 'SELECT')
  and not has_table_privilege('authenticated', 'public.project_collections', 'INSERT')
  and not has_table_privilege('authenticated', 'public.project_collections', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.project_collections', 'DELETE'),
  'authenticated clients can read their project folders but all writes are server-only'
);

select ok(
  not has_table_privilege('anon', 'public.freelancer_profiles', 'SELECT')
  and not has_table_privilege('anon', 'public.freelancer_profiles', 'INSERT')
  and not has_table_privilege('anon', 'public.freelancer_profiles', 'UPDATE')
  and not has_table_privilege('anon', 'public.freelancer_profiles', 'DELETE'),
  'unauthenticated anon role cannot enumerate or mutate the curated profile catalogue'
);

select ok(
  not has_table_privilege('authenticated', 'public.freelancer_profiles', 'SELECT')
  and not has_table_privilege('authenticated', 'public.freelancer_profiles', 'INSERT')
  and not has_table_privilege('authenticated', 'public.freelancer_profiles', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.freelancer_profiles', 'DELETE'),
  'authenticated browsers cannot enumerate or mutate the curated profile catalogue'
);

select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and tablename = 'freelancer_profiles'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and 'authenticated' = any (roles)
  ),
  0::bigint,
  'no authenticated write policy exists for the curated profile catalogue'
);

select ok(
  not has_table_privilege('authenticated', 'public.ai_usage_buckets', 'SELECT')
  and not has_table_privilege('authenticated', 'public.ai_usage_reservations', 'SELECT')
  and not has_table_privilege('authenticated', 'public.user_ai_credit_accounts', 'SELECT')
  and not has_table_privilege('authenticated', 'public.guest_claims', 'SELECT')
  and not has_table_privilege('authenticated', 'public.audit_events', 'SELECT'),
  'privileged operational tables are unavailable to authenticated clients'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.consume_ai_quota(text,text,text,boolean,integer,bigint,bigint,bigint,bigint)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.claim_guest_workspace(text,uuid)',
    'EXECUTE'
  ),
  'quota and guest-claim RPCs are not callable by authenticated clients'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","is_anonymous":false}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.projects),
  1,
  'user A reads exactly their own project'
);

select is(
  (select count(*)::integer from public.projects where id = 'b1000000-0000-4000-8000-000000000001'),
  0,
  'user A cannot read user B project by ID'
);

select is(
  (select count(*)::integer from public.project_collections),
  1,
  'user A reads exactly their own project folder'
);

select is(
  (select count(*)::integer from public.project_collections where id = 'b0000000-0000-4000-8000-000000000001'),
  0,
  'user A cannot read user B project folder by ID'
);

select is(
  (select count(*)::integer from public.messages where id = 'b2000000-0000-4000-8000-000000000001'),
  0,
  'user A cannot read user B message by ID'
);

select is(
  (select count(*)::integer from public.shortlists where id = 'b3000000-0000-4000-8000-000000000001'),
  0,
  'user A cannot read user B shortlist by ID'
);

select is(
  (select count(*)::integer from public.matches where id = 'b4000000-0000-4000-8000-000000000001'),
  0,
  'user A cannot read user B match by ID'
);

select is(
  (select count(*)::integer from public.intro_bookings where id = 'b5000000-0000-4000-8000-000000000001'),
  0,
  'user A cannot read user B introduction by ID'
);

select is(
  (select count(*)::integer from public.engagements where id = 'b6000000-0000-4000-8000-000000000001'),
  0,
  'user A cannot read user B engagement by ID'
);

select is(
  (
    select count(*)::integer
    from public.engagement_status_events
    where engagement_id = 'b6000000-0000-4000-8000-000000000001'
  ),
  0,
  'user A cannot read user B engagement status history'
);

select throws_ok(
  $$
    insert into public.projects (owner_user_id, original_request)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Browser write must fail')
  $$,
  '42501',
  'permission denied for table projects',
  'direct browser project insert is denied'
);

reset role;

-- Temporarily grant writes inside this rolled-back test to prove that the RLS
-- ownership predicates themselves fail closed if a future migration grants too
-- much. This is defense-in-depth validation, not the production grant model.
grant update on public.projects to authenticated;
grant insert on public.messages to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","is_anonymous":false}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    update public.projects
    set title = 'Cross-user overwrite'
    where id = 'b1000000-0000-4000-8000-000000000001'
  $$,
  'cross-user project update is filtered without revealing whether the target exists'
);

select throws_ok(
  $$
    update public.projects
    set owner_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    where id = 'a1000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'new row violates row-level security policy for table "projects"',
  'project UPDATE WITH CHECK blocks ownership reassignment'
);

select throws_ok(
  $$
    insert into public.messages (
      project_id, owner_user_id, role, content, client_message_id
    ) values (
      'b1000000-0000-4000-8000-000000000001',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'user',
      'Cross-user message insert',
      'rls-cross-user-message'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "messages"',
  'message INSERT policy rejects another owner and project'
);

select throws_ok(
  $$
    insert into public.messages (
      project_id, owner_user_id, role, content, client_message_id
    ) values (
      'a1000000-0000-4000-8000-000000000001',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'assistant',
      'A browser cannot impersonate the assistant.',
      'rls-assistant-impersonation'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "messages"',
  'message INSERT policy prevents assistant-role impersonation'
);

reset role;

select is(
  (
    select title
    from public.projects
    where id = 'b1000000-0000-4000-8000-000000000001'
  ),
  'User B project',
  'RLS leaves the cross-user project unchanged even if UPDATE were accidentally granted'
);

revoke update on public.projects from authenticated;
revoke insert on public.messages from authenticated;

select * from finish();
rollback;
