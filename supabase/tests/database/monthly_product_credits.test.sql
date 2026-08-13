-- Acceptance tests for free monthly Nano analyses and separately purchased
-- product credits. All fixtures and temporary grants roll back.

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
    'a1000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', null, '', true,
    now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a1000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'quota-100@example.invalid', '', false,
    now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a1000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', null, '', true,
    now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a1000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'credits-a@example.invalid', '', false,
    now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a1000000-0000-4000-8000-000000000005',
    'authenticated', 'authenticated', 'credits-b@example.invalid', '', false,
    now(), now(), now()
  );

insert into public.projects (
  id, owner_user_id, title, original_request, structured_brief, brief_status
) values
  (
    'b1000000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000004',
    'External search project A', 'Find an external AI architect', '{}'::jsonb,
    'ready'
  ),
  (
    'b1000000-0000-4000-8000-000000000005',
    'a1000000-0000-4000-8000-000000000005',
    'External search project B', 'Find an external SAP consultant', '{}'::jsonb,
    'ready'
  );

set local role service_role;

select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in (
        'ai_free_usage_accounts', 'ai_free_usage_reservations',
        'product_credit_accounts', 'product_credit_reservations',
        'product_credit_ledger', 'external_freelancer_search_results'
      )
      and (not c.relrowsecurity or not c.relforcerowsecurity)
  ),
  0,
  'RLS is enabled and forced on every new entitlement table'
);

select is(
  (
    select s.usage_limit::text || ':' || s.used || ':' || s.reserved || ':' || s.remaining
    from public.get_monthly_ai_usage_snapshot(
      'a1000000-0000-4000-8000-000000000001', true
    ) s
  ),
  '10:0:0:10',
  'a guest starts each UTC calendar month with ten free Nano analyses'
);

do $quota_10$
declare
  i integer;
  v_allowed boolean;
  v_recorded boolean;
begin
  for i in 1..10 loop
    select r.allowed into v_allowed
      from public.reserve_monthly_ai_usage(
        'a1000000-0000-4000-8000-000000000001', true,
        'guest-success-' || lpad(i::text, 3, '0')
      ) r;
    if not v_allowed then
      raise exception 'guest reservation % unexpectedly denied', i;
    end if;

    select s.recorded into v_recorded
      from public.settle_monthly_ai_usage(
        'a1000000-0000-4000-8000-000000000001',
        'guest-success-' || lpad(i::text, 3, '0'), 'succeeded'
      ) s;
    if not v_recorded then
      raise exception 'guest settlement % unexpectedly denied', i;
    end if;
  end loop;
end;
$quota_10$;

select is(
  (
    select s.used::text || ':' || s.remaining
    from public.get_monthly_ai_usage_snapshot(
      'a1000000-0000-4000-8000-000000000001', true
    ) s
  ),
  '10:0',
  'ten successful guest analyses consume exactly ten monthly uses'
);

select is(
  (
    select r.allowed::text || ':' || r.reason
    from public.reserve_monthly_ai_usage(
      'a1000000-0000-4000-8000-000000000001', true,
      'guest-success-011'
    ) r
  ),
  'false:monthly_limit',
  'the eleventh guest analysis is denied before a provider call'
);

do $quota_100$
declare
  i integer;
  v_allowed boolean;
  v_recorded boolean;
begin
  for i in 1..100 loop
    select r.allowed into v_allowed
      from public.reserve_monthly_ai_usage(
        'a1000000-0000-4000-8000-000000000002', false,
        'account-success-' || lpad(i::text, 3, '0')
      ) r;
    if not v_allowed then
      raise exception 'account reservation % unexpectedly denied', i;
    end if;

    select s.recorded into v_recorded
      from public.settle_monthly_ai_usage(
        'a1000000-0000-4000-8000-000000000002',
        'account-success-' || lpad(i::text, 3, '0'), 'succeeded'
      ) s;
    if not v_recorded then
      raise exception 'account settlement % unexpectedly denied', i;
    end if;
  end loop;
end;
$quota_100$;

select is(
  (
    select s.usage_limit::text || ':' || s.used || ':' || s.remaining
    from public.get_monthly_ai_usage_snapshot(
      'a1000000-0000-4000-8000-000000000002', false
    ) s
  ),
  '100:100:0',
  'an authenticated account receives one hundred successful analyses per month'
);

select is(
  (
    select r.reason
    from public.reserve_monthly_ai_usage(
      'a1000000-0000-4000-8000-000000000002', false,
      'account-success-101'
    ) r
  ),
  'monthly_limit',
  'the one-hundred-and-first account analysis is denied'
);

-- A provider error releases the reservation and consumes no use.
select ok(
  (
    select r.allowed
    from public.reserve_monthly_ai_usage(
      'a1000000-0000-4000-8000-000000000003', true,
      'guest-provider-failure-001'
    ) r
  ),
  'a technical-failure fixture reserves one use'
);

select is(
  (
    select s.recorded::text || ':' || s.reason || ':' || s.used || ':' || s.remaining
    from public.settle_monthly_ai_usage(
      'a1000000-0000-4000-8000-000000000003',
      'guest-provider-failure-001', 'provider_error'
    ) s
  ),
  'true:released:0:10',
  'provider failure releases the use without consuming it'
);

-- Exact replays never authorize a second provider call.
select ok(
  (
    select r.allowed
    from public.reserve_monthly_ai_usage(
      'a1000000-0000-4000-8000-000000000003', true,
      'guest-idempotency-0001'
    ) r
  ),
  'first free-use reservation succeeds'
);

select is(
  (
    select r.allowed::text || ':' || r.reason
    from public.reserve_monthly_ai_usage(
      'a1000000-0000-4000-8000-000000000003', true,
      'guest-idempotency-0001'
    ) r
  ),
  'false:already_reserved',
  'a double click while in flight is identified and denied'
);

select ok(
  (
    select s.recorded
    from public.settle_monthly_ai_usage(
      'a1000000-0000-4000-8000-000000000003',
      'guest-idempotency-0001', 'succeeded'
    ) s
  ),
  'the original free-use request consumes one use'
);

select is(
  (
    select r.allowed::text || ':' || r.reason
    from public.reserve_monthly_ai_usage(
      'a1000000-0000-4000-8000-000000000003', true,
      'guest-idempotency-0001'
    ) r
  ),
  'false:already_consumed',
  'a completed request key can never call the provider again'
);

-- Crashed calls cannot lock a quota slot forever.
select ok(
  (
    select r.allowed
    from public.reserve_monthly_ai_usage(
      'a1000000-0000-4000-8000-000000000003', true,
      'guest-stale-reservation-01'
    ) r
  ),
  'stale free-use fixture reserves successfully'
);

reset role;
update public.ai_free_usage_reservations
   set expires_at = now() - interval '1 second'
 where request_key = 'guest-stale-reservation-01';
set local role service_role;

select is(
  (
    select s.reserved::text || ':' || s.remaining
    from public.get_monthly_ai_usage_snapshot(
      'a1000000-0000-4000-8000-000000000003', true
    ) s
  ),
  '0:9',
  'snapshot automatically releases an expired free-use reservation'
);

select is(
  (
    select r.reason
    from public.reserve_monthly_ai_usage(
      'a1000000-0000-4000-8000-000000000003', true,
      'guest-stale-reservation-01'
    ) r
  ),
  'already_released',
  'an expired request key remains terminal and cannot be replayed'
);

-- Calendar-month reset is represented by a new account row; no old usage is
-- copied into the new period.
reset role;
insert into public.ai_free_usage_accounts (
  user_id, period_start, period_end, is_anonymous, usage_limit, used
) values (
  'a1000000-0000-4000-8000-000000000003',
  (date_trunc('month', timezone('UTC', now())) at time zone 'UTC') - interval '1 month',
  date_trunc('month', timezone('UTC', now())) at time zone 'UTC',
  true, 10, 10
);
set local role service_role;

select is(
  (
    select count(*)::integer
    from public.ai_free_usage_accounts a
    where a.user_id = 'a1000000-0000-4000-8000-000000000003'
  ),
  2,
  'a new UTC month has a separate account from the previous month'
);

select is(
  (
    select s.used
    from public.get_monthly_ai_usage_snapshot(
      'a1000000-0000-4000-8000-000000000003', true
    ) s
  ),
  1,
  'previous-month usage does not alter the current-month count'
);

-- Purchased credits are independent from free monthly uses and legacy AI
-- credits. Operators grant pilot balance through the append-only RPC.
select is(
  (
    select g.recorded::text || ':' || g.reason
    from public.grant_product_credits(
      'a1000000-0000-4000-8000-000000000003',
      'anonymous-grant-must-fail-01', 30, 'Invalid anonymous grant',
      'operator:test'
    ) g
  ),
  'false:invalid_input',
  'anonymous guest identities cannot receive purchased product credits'
);

select is(
  (
    select g.recorded::text || ':' || g.reason || ':' || g.balance || ':' || g.available
    from public.grant_product_credits(
      'a1000000-0000-4000-8000-000000000004',
      'pilot-grant-credits-a-001', 60, 'Pilot search credits',
      'operator:roman@dering.info'
    ) g
  ),
  'true:granted:60:60',
  'the service-only operator RPC grants purchased product credits'
);

select is(
  (
    select g.recorded::text || ':' || g.reason || ':' || g.balance
    from public.grant_product_credits(
      'a1000000-0000-4000-8000-000000000004',
      'pilot-grant-credits-a-001', 60, 'Pilot search credits',
      'operator:roman@dering.info'
    ) g
  ),
  'false:already_recorded:60',
  'grant replay does not duplicate the balance'
);

select is(
  (
    select r.allowed::text || ':' || r.reason
    from public.reserve_product_credits(
      'a1000000-0000-4000-8000-000000000004',
      'wrong-external-price-0001', 'external_freelancer_search', 31
    ) r
  ),
  'false:invalid_input',
  'the database enforces exactly thirty credits for external search'
);

select is(
  (
    select r.allowed::text || ':' || r.reason || ':' || r.balance || ':'
           || r.reserved || ':' || r.available
    from public.reserve_product_credits(
      'a1000000-0000-4000-8000-000000000004',
      'external-search-request-001', 'external_freelancer_search', 30
    ) r
  ),
  'true:reserved:60:30:30',
  'external web search atomically reserves exactly thirty credits'
);

select is(
  (
    select r.allowed::text || ':' || r.reason || ':' || r.reserved
    from public.reserve_product_credits(
      'a1000000-0000-4000-8000-000000000004',
      'external-search-request-001', 'external_freelancer_search', 30
    ) r
  ),
  'false:already_reserved:30',
  'product-credit double click cannot authorize a second search'
);

select is(
  (
    select s.recorded::text || ':' || s.reason || ':' || s.balance || ':'
           || s.reserved || ':' || s.available
    from public.settle_product_credit_reservation(
      'a1000000-0000-4000-8000-000000000004',
      'external-search-request-001', 'technical_error'
    ) s
  ),
  'true:released:60:0:60',
  'technical search failure releases all thirty reserved credits'
);

select ok(
  (
    select r.allowed
    from public.reserve_product_credits(
      'a1000000-0000-4000-8000-000000000004',
      'external-search-request-002', 'external_freelancer_search', 30
    ) r
  ),
  'a second paid search reserves successfully'
);

select is(
  (
    select s.recorded::text || ':' || s.reason || ':' || s.balance || ':' || s.available
    from public.complete_external_search(
      'a1000000-0000-4000-8000-000000000004',
      'b1000000-0000-4000-8000-000000000004',
      'external-search-request-002', '[]'::jsonb,
      'resp_external_empty_0001', 'gpt-5.4-nano-2026-03-17'
    ) s
  ),
  'true:charged:30:30',
  'a completed search with no valid candidate still charges thirty credits'
);

select is(
  (
    select s.recorded::text || ':' || s.reason || ':' || s.balance
    from public.complete_external_search(
      'a1000000-0000-4000-8000-000000000004',
      'b1000000-0000-4000-8000-000000000004',
      'external-search-request-002', '[]'::jsonb,
      'resp_external_empty_0001', 'gpt-5.4-nano-2026-03-17'
    ) s
  ),
  'false:already_completed:30',
  'result-completion replay cannot debit purchased credits twice'
);

select is(
  (
    select count(*)::integer
    from public.product_credit_ledger l
    where l.owner_user_id = 'a1000000-0000-4000-8000-000000000004'
      and l.entry_type = 'debit'
      and l.amount_delta = -30
  ),
  1,
  'the append-only ledger contains exactly one thirty-credit debit'
);

-- Atomic result persistence + charging allows a lost HTTP response to be
-- reconstructed without another provider call.
select is(
  (
    select g.recorded::text || ':' || g.balance
    from public.grant_product_credits(
      'a1000000-0000-4000-8000-000000000004',
      'pilot-grant-result-retry-001', 30, 'Retry persistence fixture',
      'operator:roman@dering.info'
    ) g
  ),
  'true:60',
  'operator grants one further paid-search allowance'
);

select ok(
  (
    select r.allowed
    from public.reserve_product_credits(
      'a1000000-0000-4000-8000-000000000004',
      'external-search-result-001', 'external_freelancer_search', 30
    ) r
  ),
  'result-persistence fixture reserves thirty credits'
);

select is(
  (
    select s.recorded::text || ':' || s.reason || ':' || s.reserved
    from public.settle_product_credit_reservation(
      'a1000000-0000-4000-8000-000000000004',
      'external-search-result-001', 'completed'
    ) s
  ),
  'false:result_snapshot_required:30',
  'paid-search success cannot charge before its retryable result is persisted'
);

select is(
  (
    select c.recorded::text || ':' || c.reason || ':' || c.result_count
           || ':' || c.balance || ':' || c.available
    from public.complete_external_search(
      'a1000000-0000-4000-8000-000000000004',
      'b1000000-0000-4000-8000-000000000004',
      'external-search-result-001',
      '[{"displayName":"Public Example","bookingUrl":"https://example.invalid/book","externalUnverified":true}]'::jsonb,
      'resp_external_0001', 'gpt-5.4-nano-2026-03-17'
    ) c
  ),
  'true:charged:1:30:30',
  'validated external result and its debit commit atomically'
);

select is(
  (
    select c.recorded::text || ':' || c.reason || ':' || c.result_count
           || ':' || c.balance
    from public.complete_external_search(
      'a1000000-0000-4000-8000-000000000004',
      'b1000000-0000-4000-8000-000000000004',
      'external-search-result-001', '[]'::jsonb,
      'resp_changed_must_not_replace', 'gpt-5.4-nano-2026-03-17'
    ) c
  ),
  'false:already_completed:1:30',
  'retry returns the stored result and never charges or replaces it'
);

select ok(
  (
    select g.result_found
      and g.result_count = 1
      and g.result_snapshot -> 0 ->> 'displayName' = 'Public Example'
    from public.get_external_search_result(
      'a1000000-0000-4000-8000-000000000004',
      'b1000000-0000-4000-8000-000000000004',
      'external-search-result-001'
    ) g
  ),
  'a retry endpoint can reconstruct the already-paid max-three result snapshot'
);

select ok(
  exists (
    select 1
    from public.audit_events a
    where a.action = 'product_credits_granted'
      and a.actor_tombstone = 'operator:roman@dering.info'
      and a.metadata ->> 'amount' = '60'
  )
  and exists (
    select 1
    from public.audit_events a
    where a.action = 'external_freelancer_search_completed'
      and a.actor_user_id = 'a1000000-0000-4000-8000-000000000004'
      and a.metadata ->> 'credits_charged' = '30'
      and not (a.metadata ? 'result_snapshot')
  ),
  'grants and paid search completion create redacted audit records'
);

select is(
  (
    select g.result_found
    from public.get_external_search_result(
      'a1000000-0000-4000-8000-000000000005',
      'b1000000-0000-4000-8000-000000000005',
      'external-search-result-001'
    ) g
  ),
  false,
  'a different owner cannot retrieve another user search result by request key'
);

-- Product reservations also expire safely after a crash.
select ok(
  (
    select r.allowed
    from public.reserve_product_credits(
      'a1000000-0000-4000-8000-000000000004',
      'external-search-stale-001', 'external_freelancer_search', 30
    ) r
  ),
  'stale product-credit fixture reserves the remaining thirty credits'
);

reset role;
update public.product_credit_reservations
   set expires_at = now() - interval '1 second'
 where request_key = 'external-search-stale-001';
set local role service_role;

select is(
  (
    select s.balance::text || ':' || s.reserved || ':' || s.available
    from public.get_product_credit_snapshot(
      'a1000000-0000-4000-8000-000000000004'
    ) s
  ),
  '30:0:30',
  'snapshot releases a stale product reservation without charging it'
);

select is(
  (
    select r.reason
    from public.reserve_product_credits(
      'a1000000-0000-4000-8000-000000000004',
      'external-search-stale-001', 'external_freelancer_search', 30
    ) r
  ),
  'already_released',
  'expired product request key cannot trigger a later provider call'
);

-- Create real rows for a second account so the later cross-user assertions do
-- not pass merely because the target row is absent.
select ok(
  (
    select g.recorded
    from public.grant_product_credits(
      'a1000000-0000-4000-8000-000000000005',
      'pilot-grant-credits-b-001', 30, 'Second RLS fixture account',
      'operator:paul@dering.info'
    ) g
  ),
  'a second user has a real product-credit account and ledger entry'
);

select is(
  (
    select s.usage_limit::text || ':' || s.remaining
    from public.get_monthly_ai_usage_snapshot(
      'a1000000-0000-4000-8000-000000000005', false
    ) s
  ),
  '100:100',
  'the second authenticated user has an independently owned monthly account'
);

select ok(
  (
    select r.allowed
    from public.reserve_monthly_ai_usage(
      'a1000000-0000-4000-8000-000000000005', false,
      'cross-user-free-usage-001'
    ) r
  ),
  'cross-user settlement fixture reserves for user B'
);

select is(
  (
    select s.recorded::text || ':' || s.reason
    from public.settle_monthly_ai_usage(
      'a1000000-0000-4000-8000-000000000004',
      'cross-user-free-usage-001', 'succeeded'
    ) s
  ),
  'false:not_found',
  'user A cannot settle user B monthly reservation'
);

select is(
  (
    select s.reserved
    from public.get_monthly_ai_usage_snapshot(
      'a1000000-0000-4000-8000-000000000005', false
    ) s
  ),
  1,
  'a rejected cross-user settlement leaves the owner reservation intact'
);

select ok(
  (
    select s.recorded
    from public.settle_monthly_ai_usage(
      'a1000000-0000-4000-8000-000000000005',
      'cross-user-free-usage-001', 'cancelled'
    ) s
  ),
  'the owner can release their monthly reservation'
);

select ok(
  (
    select r.allowed
    from public.reserve_product_credits(
      'a1000000-0000-4000-8000-000000000005',
      'external-search-user-b-001', 'external_freelancer_search', 30
    ) r
  ),
  'user B reserves a real paid-search fixture for RLS verification'
);

select ok(
  (
    select c.recorded
    from public.complete_external_search(
      'a1000000-0000-4000-8000-000000000005',
      'b1000000-0000-4000-8000-000000000005',
      'external-search-user-b-001', '[]'::jsonb,
      'resp_external_user_b_001', 'gpt-5.4-nano-2026-03-17'
    ) c
  ),
  'user B has a real persisted external-search result row'
);

reset role;
select throws_ok(
  $$
    update public.product_credit_ledger
       set amount_delta = 999
     where idempotency_key = 'pilot-grant-credits-a-001'
  $$,
  '55000',
  'product credit ledger is append-only',
  'even the database owner cannot rewrite a ledger entry'
);

set local role service_role;

select ok(
  not has_table_privilege('authenticated', 'public.ai_free_usage_accounts', 'SELECT')
  and not has_table_privilege('authenticated', 'public.ai_free_usage_reservations', 'SELECT')
  and not has_table_privilege('authenticated', 'public.product_credit_accounts', 'SELECT')
  and not has_table_privilege('authenticated', 'public.product_credit_reservations', 'SELECT')
  and not has_table_privilege('authenticated', 'public.product_credit_ledger', 'SELECT')
  and not has_table_privilege('authenticated', 'public.external_freelancer_search_results', 'SELECT'),
  'browser roles cannot access quota or purchased-credit tables directly'
);

select ok(
  not has_table_privilege('service_role', 'public.ai_free_usage_accounts', 'UPDATE')
  and not has_table_privilege('service_role', 'public.ai_free_usage_reservations', 'UPDATE')
  and not has_table_privilege('service_role', 'public.product_credit_accounts', 'UPDATE')
  and not has_table_privilege('service_role', 'public.product_credit_reservations', 'UPDATE')
  and not has_table_privilege('service_role', 'public.product_credit_ledger', 'INSERT'),
  'service routes mutate quota and credit state only through audited RPCs'
);

select ok(
  not has_function_privilege(
    'authenticated', 'public.reserve_monthly_ai_usage(uuid,boolean,text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.settle_monthly_ai_usage(uuid,text,text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.grant_product_credits(uuid,text,bigint,text,text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.reserve_product_credits(uuid,text,text,bigint)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.complete_external_search(uuid,uuid,text,jsonb,text,text)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.reserve_monthly_ai_usage(uuid,boolean,text)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.reserve_product_credits(uuid,text,text,bigint)', 'EXECUTE'
  ),
  'all quota and credit mutation RPCs are service-role only'
);

reset role;

-- Defense in depth: even if a future release grants SELECT, RLS exposes only
-- the JWT owner's rows and denies cross-user reads.
grant select on public.ai_free_usage_accounts to authenticated;
grant select on public.product_credit_accounts to authenticated;
grant select on public.product_credit_ledger to authenticated;
grant select on public.external_freelancer_search_results to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated","is_anonymous":false}',
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.product_credit_accounts
  ),
  1,
  'RLS exposes exactly the signed-in user product-credit account'
);

select is(
  (
    select count(*)::integer
    from public.product_credit_accounts a
    where a.user_id = 'a1000000-0000-4000-8000-000000000005'
  ),
  0,
  'RLS denies a cross-user product-credit account read'
);

select is(
  (
    select count(*)::integer
    from public.ai_free_usage_accounts a
    where a.user_id = 'a1000000-0000-4000-8000-000000000005'
  ),
  0,
  'RLS denies a cross-user monthly-usage account read'
);

select is(
  (
    select count(*)::integer
    from public.product_credit_ledger l
    where l.owner_user_id <> 'a1000000-0000-4000-8000-000000000004'
  ),
  0,
  'RLS denies cross-user product ledger reads'
);

select is(
  (
    select count(*)::integer
    from public.external_freelancer_search_results r
    where r.owner_user_id <> 'a1000000-0000-4000-8000-000000000004'
  ),
  0,
  'RLS denies cross-user paid external-search result reads'
);

reset role;
revoke select on public.ai_free_usage_accounts from authenticated;
revoke select on public.product_credit_accounts from authenticated;
revoke select on public.product_credit_ledger from authenticated;
revoke select on public.external_freelancer_search_results from authenticated;

select * from finish();
rollback;
