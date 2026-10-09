begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, is_anonymous,
  email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'voucher-one@example.invalid', '', false, now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'voucher-two@example.invalid', '', false, now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'voucher-three@example.invalid', '', false, now(), now(), now());

select is(
  (select r.status || ':' || r.credits_total || ':' || r.redemptions_remaining
     from public.redeem_recruiting_voucher('a1111111-1111-4111-8111-111111111111', 'xportal2026', 'basic') r),
  'redeemed:90:49',
  'the normalized code grants 90 credits and consumes one campaign slot'
);

select ok(
  (select e.can_run_ai and e.can_use_recruiting and e.source = 'trial'
     from public.get_recruiting_entitlement('a1111111-1111-4111-8111-111111111111') e),
  'the cardless voucher creates a recruiting trial entitlement'
);

select is(
  (select r.status from public.redeem_recruiting_voucher('a1111111-1111-4111-8111-111111111111', 'XPORTAL2026', 'basic') r),
  'already_redeemed',
  'the same account cannot consume a second slot'
);

select is(
  (select v.redemption_count from private.recruiting_vouchers v where v.campaign = 'xportal-2026-launch'),
  1,
  'an idempotent retry leaves the counter unchanged'
);

select is(
  (select r.status from public.redeem_recruiting_voucher('a2222222-2222-4222-8222-222222222222', 'WRONG', 'basic') r),
  'invalid',
  'an invalid code grants nothing'
);

update private.recruiting_vouchers set redemption_count = 49 where campaign = 'xportal-2026-launch';

select is(
  (select r.status || ':' || r.redemptions_remaining
     from public.redeem_recruiting_voucher('a2222222-2222-4222-8222-222222222222', 'XPORTAL2026', 'pro') r),
  'redeemed:0',
  'the fiftieth redemption succeeds'
);

select is(
  (select r.status from public.redeem_recruiting_voucher('a3333333-3333-4333-8333-333333333333', 'XPORTAL2026', 'business') r),
  'exhausted',
  'the fifty-first redemption is rejected'
);

update public.user_ai_credit_accounts
   set period_start = now() - interval '15 days',
       voucher_trial_end = now() - interval '1 second',
       period_end = now() - interval '1 second'
 where user_id = 'a1111111-1111-4111-8111-111111111111';

select is(
  (select r.rolled from public.roll_ai_credit_period('a1111111-1111-4111-8111-111111111111') r),
  true,
  'an expired voucher grant is closed'
);

select is(
  (select a.credits_total from public.user_ai_credit_accounts a where a.user_id = 'a1111111-1111-4111-8111-111111111111'),
  0::bigint,
  'expired voucher credits cannot be used'
);

select ok(
  not has_function_privilege('authenticated', 'public.redeem_recruiting_voucher(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.redeem_recruiting_voucher(uuid,text,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.redeem_recruiting_voucher(uuid,text,text)', 'EXECUTE'),
  'voucher redemption stays service-only'
);

select * from finish();
rollback;
