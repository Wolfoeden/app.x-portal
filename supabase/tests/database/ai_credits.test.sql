-- AI credit and settled usage-ledger acceptance tests. Each file runs in its
-- own transaction and leaves no fixture identities or quota counters behind.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, is_anonymous,
  email_confirmed_at, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'c1111111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated', 'credit-user@example.invalid', '', false,
    now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c2222222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated', null, '', true,
    now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c3333333-3333-4333-8333-333333333333',
    'authenticated', 'authenticated', null, '', true,
    now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c4444444-4444-4444-8444-444444444444',
    'authenticated', 'authenticated', 'reconcile-user@example.invalid', '', false,
    now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c5555555-5555-4555-8555-555555555555',
    'authenticated', 'authenticated', null, '', true,
    now(), now(), now()
  );

set local role service_role;

select ok(
  coalesce(
    (
      select p.prosecdef
        and pg_get_userbyid(p.proowner) = 'postgres'
      from pg_proc p
      where p.oid =
        'public.get_ai_credit_snapshot(uuid,boolean,bigint)'::regprocedure
    ),
    false
  ),
  'credit snapshot RPC is SECURITY DEFINER and owned by trusted postgres role'
);

select ok(
  coalesce(
    (
      select p.prosecdef
        and pg_get_userbyid(p.proowner) = 'postgres'
      from pg_proc p
      where p.oid =
        'public.consume_ai_quota(text,text,text,boolean,integer,bigint,bigint,bigint,bigint,uuid,uuid,text,text,bigint,bigint,bigint,text,text)'::regprocedure
    ),
    false
  ),
  'extended quota RPC is SECURITY DEFINER and owned by trusted postgres role'
);

select is(
  (
    select s.credits_total::text || ':' || s.credits_remaining
    from public.get_ai_credit_snapshot(
      'c1111111-1111-4111-8111-111111111111', false, 100
    ) s
  ),
  '100:100',
  'server-supplied initial account credits are persisted without a SQL default'
);

select ok(
  (
    select q.allowed
    from public.consume_ai_quota(
      'guest-upgrade-reservation-01',
      'upgrade-user-hmac-000001',
      'upgrade-ip-hmac-0000001',
      true,
      100,
      10000,
      10000,
      10,
      1,
      'c5555555-5555-4555-8555-555555555555',
      'd5555555-5555-4555-8555-555555555555',
      'gpt-test',
      'project_brief',
      60,
      100,
      30000,
      'pricing-test-v1',
      'credits-test-v1'
    ) q
  ),
  'guest-to-account fixture reserves credits successfully'
);

reset role;
update auth.users
set is_anonymous = false
where id = 'c5555555-5555-4555-8555-555555555555';
set local role service_role;

select is(
  (
    select s.credits_total::text || ':' || s.credits_used || ':'
           || s.credits_reserved || ':' || s.credits_remaining
    from public.get_ai_credit_snapshot(
      'c5555555-5555-4555-8555-555555555555', false, 10
    ) s
  ),
  '60:0:60:0',
  'guest upgrade never lowers total credits below used plus reserved credits'
);

select is(
  (
    select q.allowed::text || ':' || q.reason || ':' || q.credits_remaining
    from public.consume_ai_quota(
      'credit-request-00000001',
      'credit-user-hmac-00000001',
      'credit-ip-hmac-0000000001',
      false,
      100,
      10000,
      10000,
      100,
      1,
      'c1111111-1111-4111-8111-111111111111',
      'd1111111-1111-4111-8111-111111111111',
      'gpt-test',
      'project_brief',
      60,
      100,
      30000,
      'pricing-test-v1',
      'credits-test-v1'
    ) q
  ),
  'true:reserved:40',
  'extended preflight reserves quota and credits atomically'
);

select is(
  (
    select q.allowed::text || ':' || q.reason || ':' || q.credits_reserved
    from public.consume_ai_quota(
      'credit-request-00000001',
      'credit-user-hmac-00000001',
      'credit-ip-hmac-0000000001',
      false,
      100,
      10000,
      10000,
      100,
      1,
      'c1111111-1111-4111-8111-111111111111',
      'd1111111-1111-4111-8111-111111111111',
      'gpt-test',
      'project_brief',
      60,
      100,
      30000,
      'pricing-test-v1',
      'credits-test-v1'
    ) q
  ),
  'false:already_reserved:60',
  'an exact same-user retry is idempotent and returns its own credit snapshot'
);

select is(
  (
    select q.reason
    from public.consume_ai_quota(
      'credit-request-00000001',
      'guest-user-hmac-00000001',
      'other-ip-hmac-00000000001',
      true,
      100,
      10000,
      10000,
      1,
      0,
      'c2222222-2222-4222-8222-222222222222',
      'd9999999-9999-4999-8999-999999999999',
      'gpt-test',
      'project_brief',
      1,
      1000,
      0,
      'pricing-test-v1',
      'credits-test-v1'
    ) q
  ),
  'request_key_conflict',
  'a request key cannot be replayed under another user identity'
);

select is(
  (
    select q.allowed::text || ':' || q.reason || ':' || q.credits_reserved
    from public.consume_ai_quota(
      'credit-request-00000002',
      'credit-user-hmac-00000001',
      'credit-ip-hmac-0000000001',
      false,
      100,
      10000,
      10000,
      50,
      1,
      'c1111111-1111-4111-8111-111111111111',
      'd2222222-2222-4222-8222-222222222222',
      'gpt-test',
      'project_brief',
      50,
      100,
      15000,
      'pricing-test-v1',
      'credits-test-v1'
    ) q
  ),
  'false:insufficient_credits:60',
  'a second reservation cannot oversubscribe credits held by an in-flight call'
);

select is(
  (
    select count(*)::integer
    from public.ai_usage_reservations
    where request_key = 'credit-request-00000002'
  ),
  0,
  'insufficient credits fail before creating provider quota state'
);

select is(
  (
    select r.recorded::text || ':' || r.reason || ':'
           || r.credits_used || ':' || r.credits_reserved || ':'
           || r.credits_remaining
    from public.record_ai_usage(
      'credit-request-00000001',
      10,
      3,
      5,
      15,
      1,
      2600,
      20,
      'succeeded',
      'gpt-test-actual',
      'resp_test_00000001',
      'pricing-test-v1',
      'credits-test-v1'
    ) r
  ),
  'true:recorded:20:0:80',
  'settlement replaces the credit reservation with actual consumption'
);

select ok(
  (
    select
      e.user_id = 'c1111111-1111-4111-8111-111111111111'::uuid
      and e.interaction_id = 'd1111111-1111-4111-8111-111111111111'::uuid
      and e.requested_model = 'gpt-test'
      and e.actual_model = 'gpt-test-actual'
      and e.provider_response_id = 'resp_test_00000001'
      and e.input_tokens = 10
      and e.cached_input_tokens = 3
      and e.output_tokens = 5
      and e.total_tokens = 15
      and e.actual_cost_nano_usd = 2600
      and e.credits_consumed = 20
    from public.ai_usage_events e
    where e.request_key = 'credit-request-00000001'
  ),
  'the settled-only view exposes the complete server ledger record'
);

select is(
  (
    select r.recorded::text || ':' || r.reason || ':' || r.credits_used
    from public.record_ai_usage(
      'credit-request-00000001',
      999,
      0,
      1,
      1000,
      999,
      999,
      999,
      'succeeded',
      'changed-model',
      'resp_changed',
      'changed-pricing',
      'changed-policy'
    ) r
  ),
  'true:already_recorded:20',
  'settlement replay is idempotent and cannot charge credits twice'
);

select throws_ok(
  $$
    update public.ai_usage_reservations
    set actual_credits = 999
    where request_key = 'credit-request-00000001'
  $$,
  '55000',
  'settled AI usage records are immutable',
  'even service-role direct updates cannot rewrite a settled usage event'
);

-- Unknown model price: persist usage and credits, leave precise cost and
-- pricing version null, and retain the conservative cents reservation in the
-- provider aggregate rather than silently treating the request as free.
select ok(
  (
    select q.allowed
    from public.consume_ai_quota(
      'unknown-model-request-01',
      'unknown-user-hmac-0000001',
      'unknown-ip-hmac-000000001',
      false,
      100,
      10000,
      10000,
      25,
      2,
      'c1111111-1111-4111-8111-111111111111',
      'd3333333-3333-4333-8333-333333333333',
      'future-model',
      'analysis',
      10,
      100,
      null,
      null,
      'credits-test-v1'
    ) q
  ),
  'unknown-price request still reserves credits and provider capacity'
);

select is(
  (
    select r.recorded::text || ':' || r.reason
    from public.record_ai_usage(
      'unknown-model-request-01',
      4,
      0,
      2,
      6,
      null,
      null,
      5,
      'succeeded',
      'future-model-actual',
      'resp_future_00000001',
      null,
      'credits-test-v1'
    ) r
  ),
  'true:recorded',
  'unknown model pricing does not prevent usage settlement'
);

select ok(
  (
    select e.actual_cost_nano_usd is null and e.pricing_version is null
    from public.ai_usage_events e
    where e.request_key = 'unknown-model-request-01'
  ),
  'unknown model price remains explicitly unknown in the ledger'
);

-- If a provider result never arrives, the reservation stays fail-closed until
-- the scheduled reconciler settles the conservative preflight estimate.
select ok(
  (
    select q.allowed
    from public.consume_ai_quota(
      'stale-reconcile-request-01',
      'stale-user-hmac-00000001',
      'stale-ip-hmac-0000000001',
      false,
      100,
      10000,
      10000,
      40,
      2,
      'c4444444-4444-4444-8444-444444444444',
      'd7777777-7777-4777-8777-777777777777',
      'gpt-test',
      'project_brief',
      30,
      100,
      45000,
      'pricing-test-v1',
      'credits-test-v1'
    ) q
  ),
  'stale-reconciliation fixture reserves successfully'
);

update public.ai_usage_reservations
set reserved_at = now() - interval '20 minutes'
where request_key = 'stale-reconcile-request-01';

select is(
  public.reconcile_stale_ai_usage(interval '15 minutes', 500),
  1,
  'the service reconciles one stale open reservation'
);

select ok(
  (
    select
      r.outcome = 'reconciled_estimate'
      and r.settled_at is not null
      and r.actual_input_tokens = r.estimated_tokens
      and r.actual_cached_input_tokens = 0
      and r.actual_output_tokens = 0
      and r.actual_total_tokens = r.estimated_tokens
      and r.actual_cost_cents = r.estimated_cost_cents
      and r.actual_cost_nano_usd = r.estimated_cost_nano_usd
      and r.actual_credits = r.estimated_credits
    from public.ai_usage_reservations r
    where r.request_key = 'stale-reconcile-request-01'
  ),
  'stale usage is visibly settled from its conservative estimate'
);

select is(
  (
    select a.credits_used::text || ':' || a.credits_reserved || ':'
           || greatest(a.credits_total - a.credits_used - a.credits_reserved, 0)
    from public.user_ai_credit_accounts a
    where a.user_id = 'c4444444-4444-4444-8444-444444444444'
  ),
  '30:0:70',
  'stale reconciliation moves estimated credits from reserved to used'
);

select ok(
  (
    select b.input_tokens = 40
      and b.output_tokens = 0
      and b.estimated_cost_cents = 2
    from public.ai_usage_buckets b
    where b.subject_type = 'user'
      and b.subject_hash = 'stale-user-hmac-00000001'
      and b.bucket_kind = 'day'
  ),
  'reconciliation preserves the already-reserved token and provider-cost estimate'
);

select is(
  public.reconcile_stale_ai_usage(interval '15 minutes', 500),
  0,
  'stale reconciliation is idempotent after the reservation is closed'
);

select ok(
  exists (
    select 1
    from public.audit_events a
    where a.action = 'ai_usage_stale_reconciled'
      and a.actor_tombstone = 'system:ai-usage-reconciliation'
      and a.metadata ->> 'reconciled_count' = '1'
  ),
  'stale reconciliation writes a redacted operational audit event'
);

-- Guest limits retain both the anonymous UID and HMAC-IP daily boundaries.
select ok(
  (
    select q.allowed
    from public.consume_ai_quota(
      'guest-credit-request-001',
      'guest-user-hmac-00000001',
      'shared-guest-ip-hmac-0001',
      true,
      100,
      100,
      10000,
      90,
      0,
      'c2222222-2222-4222-8222-222222222222',
      'd4444444-4444-4444-8444-444444444444',
      'gpt-test',
      'project_brief',
      90,
      1000,
      0,
      'pricing-test-v1',
      'credits-test-v1'
    ) q
  ),
  'guest receives a server-configured credit account and token reservation'
);

select is(
  (
    select q.reason
    from public.consume_ai_quota(
      'guest-credit-request-002',
      'guest-user-hmac-00000002',
      'shared-guest-ip-hmac-0001',
      true,
      100,
      100,
      10000,
      20,
      0,
      'c3333333-3333-4333-8333-333333333333',
      'd5555555-5555-4555-8555-555555555555',
      'gpt-test',
      'project_brief',
      20,
      1000,
      0,
      'pricing-test-v1',
      'credits-test-v1'
    ) q
  ),
  'anonymous_ip_daily_token_limit',
  'rotating the anonymous UID cannot bypass the HMAC-IP guest token limit'
);

select is(
  (
    select a.credits_reserved
    from public.user_ai_credit_accounts a
    where a.user_id = 'c3333333-3333-4333-8333-333333333333'
  ),
  0::bigint,
  'a quota denial releases the tentative guest credit reservation'
);

select like(
  public.prepare_user_deletion(
    'c1111111-1111-4111-8111-111111111111'
  ),
  'deleted:%',
  'deletion preparation returns an unlinkable audit tombstone'
);

select ok(
  not exists (
    select 1
    from public.ai_usage_reservations r
    where r.user_id = 'c1111111-1111-4111-8111-111111111111'
       or r.user_hash in (
         'credit-user-hmac-00000001',
         'unknown-user-hmac-0000001'
       )
       or r.ip_hash in (
         'credit-ip-hmac-0000000001',
         'unknown-ip-hmac-000000001'
       )
  ),
  'deletion preparation removes direct and HMAC-derived usage associations'
);

select ok(
  exists (
    select 1
    from public.ai_usage_events e
    where e.requested_model = 'gpt-test'
      and e.user_id is null
      and e.interaction_id is null
      and e.provider_response_id is null
  ),
  'aggregate settled usage remains available without a user association'
);

select like(
  public.prepare_user_deletion(
    'c2222222-2222-4222-8222-222222222222'
  ),
  'deleted:%',
  'deletion preparation handles an identity with an in-flight reservation'
);

select ok(
  exists (
    select 1
    from public.ai_usage_reservations r
    where r.user_id is null
      and r.outcome = 'reconciled_estimate'
      and r.settled_at is not null
      and r.estimated_credits = 90
      and r.actual_credits = 90
      and r.actual_input_tokens = 90
      and r.actual_total_tokens = 90
  ),
  'deletion conservatively charges an in-flight reservation before unlinking'
);

select is(
  (
    select a.credits_used::text || ':' || a.credits_reserved
    from public.user_ai_credit_accounts a
    where a.user_id = 'c2222222-2222-4222-8222-222222222222'
  ),
  '90:0',
  'deletion preparation converts held estimated credits into used credits'
);

select ok(
  (
    select q.allowed
    from public.consume_ai_quota(
      'direct-delete-request-01',
      'direct-delete-user-hmac-1',
      'direct-delete-ip-hmac-001',
      true,
      100,
      100,
      10000,
      10,
      1,
      'c3333333-3333-4333-8333-333333333333',
      'd6666666-6666-4666-8666-666666666666',
      'direct-delete-model',
      'analysis',
      10,
      1000,
      1000,
      'pricing-test-v1',
      'credits-test-v1'
    ) q
  ),
  'direct-deletion fixture reserves successfully'
);

reset role;

delete from auth.users
where id = 'c3333333-3333-4333-8333-333333333333';

set local role service_role;
select is(
  (
    select count(*)::integer
    from public.user_ai_credit_accounts a
    where a.user_id = 'c3333333-3333-4333-8333-333333333333'
  ),
  0,
  'auth-user deletion cascades to the internal credit account'
);

select ok(
  exists (
    select 1
    from public.ai_usage_reservations r
    where r.requested_model = 'direct-delete-model'
      and r.user_id is null
      and r.user_hash like 'deleted:%'
      and r.ip_hash like 'deleted:%'
      and r.request_key like 'deleted:%'
      and r.interaction_id is null
      and r.provider_response_id is null
      and r.outcome = 'reconciled_estimate'
      and r.actual_input_tokens = 10
      and r.actual_cached_input_tokens = 0
      and r.actual_output_tokens = 0
      and r.actual_total_tokens = 10
      and r.actual_cost_cents = 1
      and r.actual_cost_nano_usd = 1000
      and r.actual_credits = 10
      and r.settled_at is not null
  ),
  'direct auth deletion tombstones and conservatively closes in-flight usage'
);
reset role;

select is(
  (
    select count(*)::integer
    from cron.job
    where jobname = 'xportal-ai-usage-reconcile'
  ),
  1,
  'exactly one stale AI usage reconciliation cron job is installed'
);

select ok(
  (
    select j.schedule = '*/5 * * * *'
      and j.command =
        'select public.reconcile_stale_ai_usage(interval ''15 minutes'', 500);'
    from cron.job j
    where j.jobname = 'xportal-ai-usage-reconcile'
  ),
  'the cron job runs every five minutes with a fifteen-minute stale threshold'
);

select ok(
  not has_table_privilege(
    'authenticated', 'public.user_ai_credit_accounts', 'SELECT'
  )
  and not has_table_privilege(
    'authenticated', 'public.user_ai_credit_accounts', 'INSERT'
  )
  and not has_table_privilege(
    'authenticated', 'public.user_ai_credit_accounts', 'UPDATE'
  )
  and not has_table_privilege(
    'authenticated', 'public.user_ai_credit_accounts', 'DELETE'
  )
  and not has_table_privilege(
    'anon', 'public.user_ai_credit_accounts', 'SELECT'
  )
  and not has_table_privilege(
    'authenticated', 'public.ai_usage_events', 'SELECT'
  ),
  'credit accounts and settled usage events are unavailable to browser roles'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_ai_credit_snapshot(uuid,boolean,bigint)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.consume_ai_quota(text,text,text,boolean,integer,bigint,bigint,bigint,bigint,uuid,uuid,text,text,bigint,bigint,bigint,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.get_ai_credit_snapshot(uuid,boolean,bigint)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.consume_ai_quota(text,text,text,boolean,integer,bigint,bigint,bigint,bigint,uuid,uuid,text,text,bigint,bigint,bigint,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.get_ai_credit_snapshot(uuid,boolean,bigint)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.consume_ai_quota(text,text,text,boolean,integer,bigint,bigint,bigint,bigint,uuid,uuid,text,text,bigint,bigint,bigint,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.record_ai_usage(text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,text,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.reconcile_stale_ai_usage(interval,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.reconcile_stale_ai_usage(interval,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.reconcile_stale_ai_usage(interval,integer)',
    'EXECUTE'
  ),
  'new AI-credit and reconciliation RPCs are service-only'
);

select * from finish();
rollback;
