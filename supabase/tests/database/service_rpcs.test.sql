-- Atomic service-RPC acceptance tests. Run only on local/staging after the V1
-- migration; all fixture data and counters are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated', 'rpc-guest@example.invalid', '',
    now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated', 'rpc-target@example.invalid', '',
    now(), now(), now()
  );

insert into public.projects (id, owner_user_id, original_request)
values (
  '11111111-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Guest workspace transfer fixture'
);

insert into public.guest_claims (token_hash, guest_user_id, expires_at)
values (
  repeat('a', 64),
  '11111111-1111-4111-8111-111111111111',
  now() + interval '10 minutes'
);

set local role service_role;

select ok(
  public.claim_guest_workspace(
    repeat('a', 64),
    '22222222-2222-4222-8222-222222222222'
  ),
  'valid guest claim succeeds'
);

select is(
  (
    select owner_user_id
    from public.projects
    where id = '11111111-0000-4000-8000-000000000001'
  ),
  '22222222-2222-4222-8222-222222222222'::uuid,
  'guest project ownership transfers atomically'
);

select ok(
  (
    select consumed_at is not null
    from public.guest_claims
    where token_hash = repeat('a', 64)
  ),
  'successful claim is consumed'
);

select is(
  public.claim_guest_workspace(
    repeat('a', 64),
    '22222222-2222-4222-8222-222222222222'
  ),
  false,
  'a consumed claim cannot be replayed'
);

reset role;

insert into public.guest_claims (token_hash, guest_user_id, expires_at)
values (
  repeat('b', 64),
  '22222222-2222-4222-8222-222222222222',
  now() + interval '10 minutes'
);

select throws_ok(
  $$
    insert into public.guest_claims (token_hash, guest_user_id, expires_at)
    values (
      repeat('c', 64),
      '22222222-2222-4222-8222-222222222222',
      now() + interval '10 minutes'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "guest_claims_one_open_per_guest_uidx"',
  'only one open guest claim can exist per anonymous identity'
);

set local role service_role;
select ok(
  public.claim_guest_workspace(
    repeat('b', 64),
    '22222222-2222-4222-8222-222222222222'
  ),
  'linkIdentity same-user callback consumes without transfer error'
);
reset role;

-- Quota reservation, replay, reconciliation and each hard stop.
set local role service_role;

select ok(
  (
    select q.allowed
    from public.consume_ai_quota(
      'rpc-quota-request-001',
      'user-hmac-0000000000000001',
      'ip-hmac-00000000000000001',
      false,
      10,
      1000,
      1000,
      100,
      10
    ) q
  ),
  'quota call reserves capacity below all limits'
);

select is(
  (
    select q.allowed::text || ':' || q.reason
    from public.consume_ai_quota(
      'rpc-quota-request-001',
      'user-hmac-0000000000000001',
      'ip-hmac-00000000000000001',
      false,
      10,
      1000,
      1000,
      100,
      10
    ) q
  ),
  'false:already_reserved',
  'replayed request key cannot issue a second provider call'
);

select is(
  (
    select r.recorded::text || ':' || r.reason
    from public.record_ai_usage(
      'rpc-quota-request-001', 40, 20, 8, 'succeeded'
    ) r
  ),
  'true:recorded',
  'actual AI usage reconciles a reservation'
);

select is(
  (
    select b.input_tokens + b.output_tokens
    from public.ai_usage_buckets b
    where b.subject_type = 'user'
      and b.subject_hash = 'user-hmac-0000000000000001'
      and b.bucket_kind = 'day'
  ),
  60::bigint,
  'day bucket contains actual rather than estimated tokens after reconciliation'
);

select is(
  (
    select q.reason
    from public.consume_ai_quota(
      'rpc-quota-request-002',
      'user-hmac-0000000000000001',
      'ip-hmac-00000000000000001',
      false,
      1,
      1000,
      1000,
      1,
      0
    ) q
  ),
  'user_minute_limit',
  'user minute request limit fails closed'
);

select is(
  (
    select q.reason
    from public.consume_ai_quota(
      'rpc-quota-request-003',
      'user-hmac-0000000000000003',
      'ip-hmac-00000000000000003',
      false,
      10,
      100,
      1000,
      101,
      0
    ) q
  ),
  'user_daily_token_limit',
  'daily user token limit fails closed'
);

select ok(
  (
    select q.allowed
    from public.consume_ai_quota(
      'rpc-quota-request-004',
      'user-hmac-0000000000000004',
      'shared-ip-hmac-000000000004',
      true,
      100,
      100,
      1000,
      90,
      0
    ) q
  ),
  'anonymous IP receives an initial daily reservation'
);

select is(
  (
    select q.reason
    from public.consume_ai_quota(
      'rpc-quota-request-005',
      'user-hmac-0000000000000005',
      'shared-ip-hmac-000000000004',
      true,
      100,
      100,
      1000,
      20,
      0
    ) q
  ),
  'anonymous_ip_daily_token_limit',
  'anonymous account rotation cannot bypass the IP daily token limit'
);

select is(
  (
    select q.reason
    from public.consume_ai_quota(
      'rpc-quota-request-006',
      'user-hmac-0000000000000006',
      'ip-hmac-00000000000000006',
      false,
      100,
      1000,
      15,
      1,
      8
    ) q
  ),
  'provider_monthly_budget',
  'provider monthly cost cap fails closed across users'
);

reset role;
select * from finish();
rollback;
