-- Regression: real Stripe Checkout Session IDs contain cs_live_ / cs_test_.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, is_anonymous,
  email_confirmed_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'e3333333-3333-4333-8333-333333333333',
  'authenticated', 'authenticated', 'stripe-checkout-id@example.invalid', '', false,
  now(), now(), now()
);

set local role service_role;

select lives_ok(
  $test$
  do $body$
  declare v_request_key uuid;
  begin
    perform * from public.prepare_recruiting_checkout(
      'e3333333-3333-4333-8333-333333333333',
      'basic',
      'saas-2026-10-1-draft'
    );
    select request_key into v_request_key
      from public.recruiting_checkout_attempts
     where user_id = 'e3333333-3333-4333-8333-333333333333';
    perform public.save_recruiting_checkout_session(
      'e3333333-3333-4333-8333-333333333333',
      v_request_key,
      'cs_live_a1B2c3',
      'https://checkout.stripe.com/c/pay/cs_live_a1B2c3'
    );
  end;
  $body$
  $test$,
  'a live-mode Checkout Session ID is persisted'
);

select is(
  (
    select session_id
      from public.recruiting_checkout_attempts
     where user_id = 'e3333333-3333-4333-8333-333333333333'
  ),
  'cs_live_a1B2c3',
  'the exact Stripe Checkout Session ID is retained'
);

select throws_ok(
  $test$
  select public.save_recruiting_checkout_session(
    'e3333333-3333-4333-8333-333333333333',
    request_key,
    'cs_live__broken',
    'https://checkout.stripe.com/c/pay/cs_live__broken'
  )
  from public.recruiting_checkout_attempts
  where user_id = 'e3333333-3333-4333-8333-333333333333'
  $test$,
  'P0001',
  'invalid_session',
  'empty ID segments remain invalid'
);

reset role;
select * from finish();
rollback;
