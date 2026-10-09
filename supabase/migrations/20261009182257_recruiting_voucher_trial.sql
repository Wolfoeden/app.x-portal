-- One campaign code grants a cardless 14-day recruiting trial to at most
-- 50 distinct accounts. Redemption, capacity and credit grant share one
-- transaction so concurrent requests cannot overbook the campaign.
begin;

alter table public.user_ai_credit_accounts
  add column if not exists voucher_trial_redeemed_at timestamptz,
  add column if not exists voucher_trial_end timestamptz,
  add column if not exists voucher_campaign text;

create table if not exists private.recruiting_vouchers (
  code_hash text primary key,
  campaign text not null unique,
  max_redemptions integer not null check (max_redemptions > 0),
  redemption_count integer not null default 0 check (
    redemption_count >= 0 and redemption_count <= max_redemptions
  ),
  trial_days integer not null check (trial_days > 0 and trial_days <= 31),
  trial_credits bigint not null check (trial_credits > 0 and trial_credits <= 10000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists private.recruiting_voucher_redemptions (
  code_hash text not null references private.recruiting_vouchers(code_hash),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null check (plan_id in ('basic', 'pro', 'business')),
  redeemed_at timestamptz not null,
  expires_at timestamptz not null,
  primary key (code_hash, user_id),
  check (expires_at > redeemed_at)
);

alter table private.recruiting_vouchers enable row level security;
alter table private.recruiting_voucher_redemptions enable row level security;
revoke all on private.recruiting_vouchers from public, anon, authenticated;
revoke all on private.recruiting_voucher_redemptions from public, anon, authenticated;

insert into private.recruiting_vouchers (
  code_hash,
  campaign,
  max_redemptions,
  trial_days,
  trial_credits
)
values (
  encode(extensions.digest('XPORTAL2026', 'sha256'), 'hex'),
  'xportal-2026-launch',
  50,
  14,
  90
)
on conflict (code_hash) do update
set campaign = excluded.campaign,
    max_redemptions = excluded.max_redemptions,
    trial_days = excluded.trial_days,
    trial_credits = excluded.trial_credits;

create or replace function public.redeem_recruiting_voucher(
  p_user_id uuid,
  p_code text,
  p_plan_id text
)
returns table (
  status text,
  credits_total bigint,
  trial_end timestamptz,
  redemptions_remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_voucher private.recruiting_vouchers%rowtype;
  v_existing private.recruiting_voucher_redemptions%rowtype;
  v_user auth.users%rowtype;
  v_account public.user_ai_credit_accounts%rowtype;
  v_now timestamptz := date_trunc('second', now());
  v_end timestamptz;
  v_legacy bigint;
begin
  if p_user_id is null or p_code is null or p_plan_id not in ('basic', 'pro', 'business') then
    return query select 'invalid'::text, 0::bigint, null::timestamptz, 0;
    return;
  end if;

  select u.* into v_user from auth.users u where u.id = p_user_id;
  if not found or coalesce(v_user.is_anonymous, false) or v_user.email_confirmed_at is null then
    return query select 'account_ineligible'::text, 0::bigint, null::timestamptz, 0;
    return;
  end if;

  v_hash := encode(extensions.digest(upper(trim(p_code)), 'sha256'), 'hex');
  select v.* into v_voucher
    from private.recruiting_vouchers v
   where v.code_hash = v_hash
   for update;

  if not found or not v_voucher.active then
    return query select 'invalid'::text, 0::bigint, null::timestamptz, 0;
    return;
  end if;

  select r.* into v_existing
    from private.recruiting_voucher_redemptions r
   where r.code_hash = v_hash and r.user_id = p_user_id;
  if found then
    return query
      select 'already_redeemed'::text,
             coalesce(a.credits_total, 0),
             v_existing.expires_at,
             greatest(v_voucher.max_redemptions - v_voucher.redemption_count, 0)
        from public.user_ai_credit_accounts a
       where a.user_id = p_user_id;
    return;
  end if;

  if v_voucher.redemption_count >= v_voucher.max_redemptions then
    return query select 'exhausted'::text, 0::bigint, null::timestamptz, 0;
    return;
  end if;

  perform * from public.get_ai_credit_snapshot(p_user_id, false, 0);
  select a.* into v_account
    from public.user_ai_credit_accounts a
   where a.user_id = p_user_id
   for update;

  if not found
     or v_account.is_anonymous
     or v_account.stripe_trial_claimed_at is not null
     or v_account.voucher_trial_redeemed_at is not null
     or v_account.stripe_subscription_id is not null
     or (v_account.billing_generation = 'legacy'
         and v_account.plan_id in ('enterprise', 'enterprise_legacy', 'enterprise_flex')) then
    return query
      select 'account_ineligible'::text,
             coalesce(v_account.credits_total, 0),
             v_account.voucher_trial_end,
             greatest(v_voucher.max_redemptions - v_voucher.redemption_count, 0);
    return;
  end if;

  v_end := v_now + make_interval(days => v_voucher.trial_days);
  v_legacy := greatest(
    v_account.legacy_credit_balance - greatest(v_account.credits_used - v_account.billing_grant_credits, 0),
    0
  );

  insert into private.recruiting_voucher_redemptions (
    code_hash, user_id, plan_id, redeemed_at, expires_at
  ) values (
    v_hash, p_user_id, p_plan_id, v_now, v_end
  );

  update private.recruiting_vouchers v
     set redemption_count = v.redemption_count + 1
   where v.code_hash = v_hash;

  update public.user_ai_credit_accounts a
     set plan_id = p_plan_id,
         billing_generation = 'voucher_v1',
         credits_total = v_legacy + v_voucher.trial_credits,
         credits_used = 0,
         legacy_credit_balance = v_legacy,
         billing_grant_credits = v_voucher.trial_credits,
         period_start = v_now,
         period_end = v_end,
         voucher_trial_redeemed_at = v_now,
         voucher_trial_end = v_end,
         voucher_campaign = v_voucher.campaign,
         stripe_trial_claimed_at = coalesce(a.stripe_trial_claimed_at, v_now),
         updated_at = now()
   where a.user_id = p_user_id;

  return query
    select 'redeemed'::text,
           a.credits_total,
           v_end,
           greatest(v_voucher.max_redemptions - v_voucher.redemption_count - 1, 0)
      from public.user_ai_credit_accounts a
     where a.user_id = p_user_id;
end;
$$;

create or replace function public.roll_ai_credit_period(p_user_id uuid)
returns table (rolled boolean, current_period_start timestamptz, current_period_end timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_account public.user_ai_credit_accounts%rowtype;
  v_legacy bigint;
  v_allowance bigint;
  v_rolled boolean := false;
begin
  if p_user_id is null then
    raise exception 'user identity is required' using errcode = '22023';
  end if;
  select a.* into v_account from public.user_ai_credit_accounts a where a.user_id = p_user_id for update;
  if not found then return; end if;

  if v_account.billing_generation = 'voucher_v1'
     and v_account.voucher_trial_end is not null
     and now() >= v_account.voucher_trial_end
     and v_account.billing_grant_credits > 0 then
    v_legacy := greatest(
      v_account.legacy_credit_balance - greatest(v_account.credits_used - v_account.billing_grant_credits, 0),
      0
    );
    update public.user_ai_credit_accounts a
       set credits_total = v_legacy,
           credits_used = 0,
           legacy_credit_balance = v_legacy,
           billing_grant_credits = 0
     where a.user_id = p_user_id;
    v_rolled := true;
  elsif v_account.stripe_subscription_id is not null then
    if now() >= v_account.period_end and v_account.billing_grant_credits > 0 then
      v_legacy := greatest(v_account.legacy_credit_balance - greatest(v_account.credits_used - v_account.billing_grant_credits, 0), 0);
      update public.user_ai_credit_accounts a set credits_total = v_legacy, credits_used = 0,
        legacy_credit_balance = v_legacy, billing_grant_credits = 0 where a.user_id = p_user_id;
      v_rolled := true;
    end if;
  elsif v_account.billing_generation = 'legacy'
        and v_account.plan_id in ('enterprise', 'enterprise_legacy', 'enterprise_flex')
        and now() >= v_account.period_end then
    v_allowance := private.credit_plan_monthly_allowance(v_account.plan_id);
    update public.user_ai_credit_accounts a set period_start = private.current_ai_credit_period_start(),
      period_end = private.current_ai_credit_period_start() + interval '1 month',
      credits_total = coalesce(least(v_allowance, coalesce(a.credits_self_limit, v_allowance)), 0),
      credits_used = 0 where a.user_id = p_user_id;
    v_rolled := true;
  end if;
  return query select v_rolled, a.period_start, a.period_end from public.user_ai_credit_accounts a where a.user_id = p_user_id;
end;
$$;

create or replace function public.get_recruiting_entitlement(p_user_id uuid)
returns table(can_run_ai boolean, can_use_recruiting boolean, source text, reason text)
language plpgsql security definer set search_path = '' as $$
declare
  a public.user_ai_credit_accounts%rowtype;
  v_source text := 'none';
  v_active boolean := false;
  v_remaining bigint;
begin
  perform * from public.roll_ai_credit_period(p_user_id);
  select c.* into a from public.user_ai_credit_accounts c where c.user_id = p_user_id;
  if not found then
    return query select false, false, 'none'::text, 'billing_required'::text;
    return;
  end if;
  v_remaining := greatest(a.credits_total - a.credits_used - a.credits_reserved, 0);
  if a.voucher_trial_redeemed_at is not null and a.voucher_trial_end > now() then
    v_source := 'trial';
    v_active := true;
  elsif a.stripe_trial_claimed_at is not null and a.stripe_trial_end > now()
        and a.stripe_subscription_status in ('trialing', 'canceled') then
    v_source := 'trial';
    v_active := true;
  elsif a.stripe_paid_through > now() and a.stripe_first_paid_at is not null
        and a.stripe_subscription_status in ('active', 'past_due', 'canceled', 'unpaid') then
    v_source := 'paid';
    v_active := true;
  elsif a.billing_generation = 'legacy' and a.stripe_subscription_id is null
        and (v_remaining > 0 or a.plan_id in ('enterprise', 'enterprise_legacy', 'enterprise_flex')) then
    v_source := 'legacy';
    v_active := true;
  elsif a.legacy_credit_balance > 0 and v_remaining > 0 then
    v_source := 'legacy';
    v_active := true;
  end if;
  return query select
    v_active and (v_remaining > 0 or a.plan_id = 'enterprise_flex'),
    v_active and not a.is_anonymous,
    v_source,
    case
      when not v_active then 'billing_required'
      when v_remaining = 0 and a.plan_id <> 'enterprise_flex' then 'insufficient_credits'
      else 'ok'
    end;
end;
$$;

revoke all on function public.redeem_recruiting_voucher(uuid, text, text) from public, anon, authenticated;
grant execute on function public.redeem_recruiting_voucher(uuid, text, text) to service_role;

notify pgrst, 'reload schema';
commit;
