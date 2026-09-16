-- Monthly period behaviour for the customer-facing AI credit balance.
-- Runs in its own transaction and leaves no fixture identities behind.

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
    'd1111111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated', 'period-user@example.invalid', '', false,
    now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd2222222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated', null, '', true,
    now(), now(), now()
  );

-- ---------------------------------------------------------------------
-- A new account starts in the current UTC calendar month.
-- ---------------------------------------------------------------------
select lives_ok(
  $$select * from public.get_ai_credit_snapshot(
      'd1111111-1111-4111-8111-111111111111', false, 300
    )$$,
  'creating an account through the snapshot RPC succeeds'
);

select is(
  (
    select a.period_start
    from public.user_ai_credit_accounts a
    where a.user_id = 'd1111111-1111-4111-8111-111111111111'
  ),
  date_trunc('month', (now() at time zone 'utc')) at time zone 'utc',
  'a new account starts in the current UTC calendar month'
);

-- Compared as timestamps rather than as a difference: subtracting two
-- timestamptz values yields days, never months, so the window of a 31-day
-- month would read as '31 days' against an expected '1 mon'.
select is(
  (
    select a.period_end
    from public.user_ai_credit_accounts a
    where a.user_id = 'd1111111-1111-4111-8111-111111111111'
  ),
  (
    select a.period_start + interval '1 month'
    from public.user_ai_credit_accounts a
    where a.user_id = 'd1111111-1111-4111-8111-111111111111'
  ),
  'the period window is exactly one calendar month'
);

-- ---------------------------------------------------------------------
-- Rolling inside a live period must not refill anything.
-- ---------------------------------------------------------------------
update public.user_ai_credit_accounts
  set credits_used = 100, credits_reserved = 25
  where user_id = 'd1111111-1111-4111-8111-111111111111';

select is(
  (
    select r.rolled
    from public.roll_ai_credit_period(
      'd1111111-1111-4111-8111-111111111111'
    ) r
  ),
  false,
  'rolling inside a live period reports no roll'
);

select is(
  (
    select a.credits_used::text || ':' || a.credits_reserved
    from public.user_ai_credit_accounts a
    where a.user_id = 'd1111111-1111-4111-8111-111111111111'
  ),
  '100:25',
  'rolling inside a live period preserves usage'
);

select is(
  (
    select s.credits_remaining
    from public.get_ai_credit_snapshot(
      'd1111111-1111-4111-8111-111111111111', false, 300
    ) s
  ),
  175::bigint,
  'remaining is total minus used minus reserved within a live period'
);

-- ---------------------------------------------------------------------
-- An expired one-time trial advances the window without refilling.
-- ---------------------------------------------------------------------
update public.user_ai_credit_accounts
  set period_start = private.current_ai_credit_period_start()
        - interval '2 months',
      period_end = private.current_ai_credit_period_start()
        - interval '1 month',
      credits_used = 300,
      credits_reserved = 0
  where user_id = 'd1111111-1111-4111-8111-111111111111';

select is(
  (
    select r.rolled
    from public.roll_ai_credit_period(
      'd1111111-1111-4111-8111-111111111111'
    ) r
  ),
  true,
  'an expired period reports a roll'
);

select is(
  (
    select a.credits_used::text || ':' || a.credits_reserved
    from public.user_ai_credit_accounts a
    where a.user_id = 'd1111111-1111-4111-8111-111111111111'
  ),
  '300:0',
  'rolling an expired trial does not grant another 300 credits'
);

select is(
  (
    select a.period_start
    from public.user_ai_credit_accounts a
    where a.user_id = 'd1111111-1111-4111-8111-111111111111'
  ),
  private.current_ai_credit_period_start(),
  'rolling moves the window to the current month'
);

-- A second roll in the same period must be a no-op, so that two concurrent
-- callers cannot refill twice.
update public.user_ai_credit_accounts
  set credits_used = 100
  where user_id = 'd1111111-1111-4111-8111-111111111111';

select is(
  (
    select r.rolled
    from public.roll_ai_credit_period(
      'd1111111-1111-4111-8111-111111111111'
    ) r
  ),
  false,
  'a repeated roll within the same period is a no-op'
);

select is(
  (
    select a.credits_used
    from public.user_ai_credit_accounts a
    where a.user_id = 'd1111111-1111-4111-8111-111111111111'
  ),
  100::bigint,
  'a repeated roll does not clear usage again'
);

-- ---------------------------------------------------------------------
-- The snapshot RPC does not refill an expired one-time trial.
-- ---------------------------------------------------------------------
update public.user_ai_credit_accounts
  set period_start = private.current_ai_credit_period_start()
        - interval '2 months',
      period_end = private.current_ai_credit_period_start()
        - interval '1 month',
      credits_used = 300
  where user_id = 'd1111111-1111-4111-8111-111111111111';

select is(
  (
    select s.credits_remaining
    from public.get_ai_credit_snapshot(
      'd1111111-1111-4111-8111-111111111111', false, 300
    ) s
  ),
  0::bigint,
  'an exhausted trial remains exhausted after the period ends'
);

-- ---------------------------------------------------------------------
-- A guest account also receives no recurring grant.
-- ---------------------------------------------------------------------
select lives_ok(
  $$select * from public.get_ai_credit_snapshot(
      'd2222222-2222-4222-8222-222222222222', true, 100
    )$$,
  'creating a guest account through the snapshot RPC succeeds'
);

update public.user_ai_credit_accounts
  set period_start = private.current_ai_credit_period_start()
        - interval '2 months',
      period_end = private.current_ai_credit_period_start()
        - interval '1 month',
      credits_used = 100
  where user_id = 'd2222222-2222-4222-8222-222222222222';

select is(
  (
    select s.credits_remaining
    from public.get_ai_credit_snapshot(
      'd2222222-2222-4222-8222-222222222222', true, 100
    ) s
  ),
  0::bigint,
  'an exhausted guest is not refilled after the period ends'
);

-- ---------------------------------------------------------------------
-- A one-time entitlement preserves an existing historical balance without
-- silently adding or removing credits.
-- ---------------------------------------------------------------------
update public.user_ai_credit_accounts
  set credits_total = 50000,
      credits_used = 20225,
      period_start = private.current_ai_credit_period_start()
        - interval '2 months',
      period_end = private.current_ai_credit_period_start()
        - interval '1 month'
  where user_id = 'd1111111-1111-4111-8111-111111111111';

select is(
  (
    select s.credits_total::text || ':' || s.credits_remaining
    from public.get_ai_credit_snapshot(
      'd1111111-1111-4111-8111-111111111111', false, 300
    ) s
  ),
  '50000:29775',
  'a rolled trial preserves its existing historical balance'
);

-- Re-reading a one-time grant cannot raise it inside a live period.
update public.user_ai_credit_accounts
  set credits_total = 105, credits_used = 0, credits_reserved = 0
  where user_id = 'd2222222-2222-4222-8222-222222222222';

select is(
  (
    select s.credits_total
    from public.get_ai_credit_snapshot(
      'd2222222-2222-4222-8222-222222222222', true, 500
    ) s
  ),
  105::bigint,
  'raising an input value cannot regrant a guest trial'
);

select is(
  (
    select s.credits_total
    from public.get_ai_credit_snapshot(
      'd2222222-2222-4222-8222-222222222222', true, 100
    ) s
  ),
  105::bigint,
  'later snapshot calls preserve the existing guest grant'
);

-- ---------------------------------------------------------------------
-- Fixed subscriptions refill to the exact plan allowance, without rollover.
-- ---------------------------------------------------------------------
update public.user_ai_credit_accounts
  set plan_id = 'basic', credits_total = 500, credits_used = 499,
      period_start = private.current_ai_credit_period_start() - interval '2 months',
      period_end = private.current_ai_credit_period_start() - interval '1 month'
  where user_id = 'd1111111-1111-4111-8111-111111111111';

select is(
  (select s.credits_total::text || ':' || s.credits_used || ':' || s.credits_remaining
     from public.get_ai_credit_snapshot('d1111111-1111-4111-8111-111111111111', false, 300) s),
  '500:0:500',
  'Basic starts a new period with exactly 500 credits'
);

update public.user_ai_credit_accounts
  set plan_id = 'pro', credits_total = 1250, credits_used = 1250,
      period_start = private.current_ai_credit_period_start() - interval '2 months',
      period_end = private.current_ai_credit_period_start() - interval '1 month'
  where user_id = 'd1111111-1111-4111-8111-111111111111';

select is(
  (select s.credits_total::text || ':' || s.credits_remaining
     from public.get_ai_credit_snapshot('d1111111-1111-4111-8111-111111111111', false, 300) s),
  '1250:1250',
  'Pro starts a new period with exactly 1,250 credits'
);

update public.user_ai_credit_accounts
  set plan_id = 'business', credits_total = 4000, credits_used = 3999,
      period_start = private.current_ai_credit_period_start() - interval '2 months',
      period_end = private.current_ai_credit_period_start() - interval '1 month'
  where user_id = 'd1111111-1111-4111-8111-111111111111';

select is(
  (select s.credits_total::text || ':' || s.credits_remaining
     from public.get_ai_credit_snapshot('d1111111-1111-4111-8111-111111111111', false, 300) s),
  '4000:4000',
  'Business starts a new period with exactly 4,000 credits'
);

-- ---------------------------------------------------------------------
-- Invariants and access.
-- ---------------------------------------------------------------------
select throws_ok(
  $$update public.user_ai_credit_accounts
      set period_end = period_start - interval '1 day'
      where user_id = 'd1111111-1111-4111-8111-111111111111'$$,
  '23514',
  null,
  'a period cannot end before it starts'
);

select throws_ok(
  $$select * from public.roll_ai_credit_period(null)$$,
  '22023',
  null,
  'the roll RPC rejects a null identity'
);

select ok(
  not has_function_privilege(
    'authenticated', 'public.roll_ai_credit_period(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.roll_ai_credit_period(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.roll_ai_credit_period(uuid)', 'EXECUTE'
  ),
  'the period-roll RPC is service-only'
);

select * from finish();
rollback;
