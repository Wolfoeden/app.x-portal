-- Stripe lifecycle behaviour for the existing AI credit account.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, is_anonymous,
  email_confirmed_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'd3333333-3333-4333-8333-333333333333',
  'authenticated', 'authenticated', 'stripe-user@example.invalid', '', false,
  now(), now(), now()
);

select lives_ok(
  $$select * from public.get_ai_credit_snapshot(
      'd3333333-3333-4333-8333-333333333333', false, 300
    )$$,
  'the existing account is available before checkout'
);

update public.user_ai_credit_accounts
   set business_confirmed_at = now(), business_terms_version = '1.0'
 where user_id = 'd3333333-3333-4333-8333-333333333333';

select lives_ok(
  $$select * from public.link_stripe_subscription_checkout(
      'evt_checkout_1', 'checkout.session.completed',
      'd3333333-3333-4333-8333-333333333333', 'basic',
      'cus_Test1', 'sub_Test1', '1.0'
    )$$,
  'checkout links the existing account'
);

select is(
  (
    select a.plan_id || ':' || a.credits_total || ':' || a.stripe_subscription_status
      from public.user_ai_credit_accounts a
     where a.user_id = 'd3333333-3333-4333-8333-333333333333'
  ),
  'trial:300:pending',
  'checkout alone grants no paid credits'
);

select throws_ok(
  $$select * from public.activate_paid_plan(
      'evt_invoice_bad', 'invoice.paid',
      'd3333333-3333-4333-8333-333333333333', 'basic', 1250,
      '2026-09-16 00:00:00+00', '2026-10-16 00:00:00+00',
      'cus_Test1', 'sub_Test1', 'in_Bad1'
    )$$,
  '22023',
  null,
  'a mismatched allowance cannot activate the account'
);

select is(
  (
    select r.activated::text || ':' || r.credits_total || ':' || r.was_first_payment
      from public.activate_paid_plan(
        'evt_invoice_1', 'invoice.paid',
        'd3333333-3333-4333-8333-333333333333', 'basic', 500,
        '2026-09-16 00:00:00+00', '2026-10-16 00:00:00+00',
        'cus_Test1', 'sub_Test1', 'in_Test1'
      ) r
  ),
  'true:500:true',
  'a paid invoice grants exactly one Basic period'
);

select is(
  (
    select r.activated::text || ':' || r.was_first_payment
      from public.activate_paid_plan(
        'evt_invoice_1', 'invoice.paid',
        'd3333333-3333-4333-8333-333333333333', 'basic', 500,
        '2026-09-16 00:00:00+00', '2026-10-16 00:00:00+00',
        'cus_Test1', 'sub_Test1', 'in_Test1'
      ) r
  ),
  'false:false',
  'replaying the same invoice event grants nothing twice'
);

select lives_ok(
  $$select * from public.record_stripe_subscription_status(
      'evt_failed_1', 'invoice.payment_failed', 'sub_Test1', 'past_due',
      null, 'in_Test2', 'payment_failed'
    )$$,
  'a failed renewal is recorded'
);

select is(
  (
    select a.stripe_subscription_status || ':' || a.credits_total || ':' || a.credits_used
      from public.user_ai_credit_accounts a
     where a.user_id = 'd3333333-3333-4333-8333-333333333333'
  ),
  'past_due:500:0',
  'a failed renewal changes status but not already-paid credits'
);

select lives_ok(
  $$select * from public.record_stripe_subscription_status(
      'evt_cancel_1', 'customer.subscription.updated', 'sub_Test1', 'active',
      true, null, null
    )$$,
  'a cancellation at period end is recorded'
);

select is(
  (
    select a.stripe_cancel_at_period_end
      from public.user_ai_credit_accounts a
     where a.user_id = 'd3333333-3333-4333-8333-333333333333'
  ),
  true,
  'the account exposes cancellation at period end'
);

update public.user_ai_credit_accounts
   set period_end = now() - interval '1 second',
       period_start = now() - interval '1 month'
 where user_id = 'd3333333-3333-4333-8333-333333333333';

select is(
  (
    select r.rolled
      from public.roll_ai_credit_period('d3333333-3333-4333-8333-333333333333') r
  ),
  true,
  'an expired paid period is closed locally'
);

select is(
  (
    select a.credits_total
      from public.user_ai_credit_accounts a
     where a.user_id = 'd3333333-3333-4333-8333-333333333333'
  ),
  0::bigint,
  'no local calendar refill replaces the next invoice.paid'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.link_stripe_subscription_checkout(text,text,uuid,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.activate_paid_plan(text,text,uuid,text,bigint,timestamptz,timestamptz,text,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.record_stripe_subscription_status(text,text,text,text,boolean,text,text)',
    'EXECUTE'
  ),
  'Stripe lifecycle RPCs are service-only'
);

select * from finish();
rollback;
