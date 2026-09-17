-- Bind the existing XPORTAL credit account to Stripe's subscription lifecycle.
--
-- Deliberately no second billing or invoice table: user_ai_credit_accounts remains
-- the entitlement record, while stripe_webhook_events remains the idempotency
-- ledger. Customer-facing invoices and payment history stay in Stripe.

begin;

alter table public.user_ai_credit_accounts
  add column if not exists stripe_plan_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_subscription_status text,
  add column if not exists stripe_cancel_at_period_end boolean not null default false,
  add column if not exists stripe_latest_invoice_id text,
  add column if not exists stripe_latest_invoice_status text,
  add column if not exists stripe_checkout_completed_at timestamptz,
  add column if not exists business_confirmed_at timestamptz,
  add column if not exists business_terms_version text;

alter table public.user_ai_credit_accounts
  drop constraint if exists user_ai_credit_accounts_stripe_plan_check;
alter table public.user_ai_credit_accounts
  add constraint user_ai_credit_accounts_stripe_plan_check check (
    stripe_plan_id is null or stripe_plan_id in ('basic', 'pro', 'business')
  );

alter table public.user_ai_credit_accounts
  drop constraint if exists user_ai_credit_accounts_stripe_subscription_status_check;
alter table public.user_ai_credit_accounts
  add constraint user_ai_credit_accounts_stripe_subscription_status_check check (
    stripe_subscription_status is null or stripe_subscription_status in (
      'pending', 'incomplete', 'incomplete_expired', 'trialing', 'active',
      'past_due', 'canceled', 'unpaid', 'paused'
    )
  );

create unique index if not exists user_ai_credit_accounts_stripe_subscription_uidx
  on public.user_ai_credit_accounts (stripe_subscription_id)
  where stripe_subscription_id is not null;

create index if not exists user_ai_credit_accounts_stripe_customer_idx
  on public.user_ai_credit_accounts (stripe_customer_id)
  where stripe_customer_id is not null;

comment on column public.user_ai_credit_accounts.stripe_plan_id is
  'Fixed monthly plan selected by the configured Stripe Payment Link.';
comment on column public.user_ai_credit_accounts.stripe_subscription_status is
  'Last signed Stripe subscription/payment status; credits are granted only by invoice.paid.';

-- A Stripe checkout establishes the external identifiers, but never grants
-- credits. The paid invoice remains the single entitlement trigger.
create or replace function public.link_stripe_subscription_checkout(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_plan_id text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_terms_version text
)
returns table (linked boolean, user_id uuid, plan_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
begin
  if p_event_id is null or p_event_type <> 'checkout.session.completed'
     or p_user_id is null
     or p_plan_id not in ('basic', 'pro', 'business')
     or p_stripe_customer_id is null
     or p_stripe_customer_id !~ '^cus_[A-Za-z0-9]+$'
     or p_stripe_subscription_id is null
     or p_stripe_subscription_id !~ '^sub_[A-Za-z0-9]+$'
     or p_terms_version is null
     or length(trim(p_terms_version)) = 0
     or not exists (
       select 1
         from public.user_ai_credit_accounts a
        where a.user_id = p_user_id
          and a.is_anonymous = false
          and a.business_confirmed_at is not null
          and a.business_terms_version = p_terms_version
     ) then
    raise exception 'invalid Stripe checkout link input' using errcode = '22023';
  end if;

  insert into public.stripe_webhook_events (event_id, event_type, user_id)
  values (p_event_id, p_event_type, p_user_id)
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return query
    select false, a.user_id, a.stripe_plan_id
      from public.user_ai_credit_accounts a
     where a.user_id = p_user_id;
    return;
  end if;

  update public.user_ai_credit_accounts
     set stripe_plan_id = p_plan_id,
         stripe_customer_id = p_stripe_customer_id,
         stripe_subscription_id = p_stripe_subscription_id,
         stripe_subscription_status = 'pending',
         stripe_cancel_at_period_end = false,
         stripe_checkout_completed_at = now(),
         updated_at = now()
   where user_id = p_user_id;

  return query select true, p_user_id, p_plan_id;
end;
$$;

-- Replace the first-payment-only activator with the same central function,
-- now driven by paid invoices and their real Stripe billing period.
drop function if exists public.activate_paid_plan(text, text, uuid, text, bigint);

create function public.activate_paid_plan(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_plan_id text,
  p_plan_allowance bigint,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_invoice_id text
)
returns table (
  activated boolean,
  credits_total bigint,
  was_first_payment boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
  v_expected bigint;
  v_account public.user_ai_credit_accounts%rowtype;
  v_first_payment boolean := false;
begin
  v_expected := private.credit_plan_monthly_allowance(p_plan_id);
  if p_event_id is null or p_event_type <> 'invoice.paid'
     or p_user_id is null
     or v_expected is null or p_plan_allowance is distinct from v_expected
     or p_plan_id not in ('basic', 'pro', 'business')
     or p_period_start is null or p_period_end is null
     or p_period_end <= p_period_start
     or p_stripe_customer_id is null
     or p_stripe_customer_id !~ '^cus_[A-Za-z0-9]+$'
     or p_stripe_subscription_id is null
     or p_stripe_subscription_id !~ '^sub_[A-Za-z0-9]+$'
     or p_invoice_id is null
     or p_invoice_id !~ '^in_[A-Za-z0-9]+$' then
    raise exception 'invalid paid Stripe invoice input' using errcode = '22023';
  end if;

  select a.* into v_account
    from public.user_ai_credit_accounts a
   where a.user_id = p_user_id
   for update;

  if not found
     or v_account.stripe_plan_id is distinct from p_plan_id
     or v_account.stripe_subscription_id is distinct from p_stripe_subscription_id
     or v_account.stripe_customer_id is distinct from p_stripe_customer_id then
    raise exception 'Stripe invoice does not match linked account' using errcode = '22023';
  end if;

  insert into public.stripe_webhook_events (event_id, event_type, user_id)
  values (p_event_id, p_event_type, p_user_id)
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return query select false, v_account.credits_total, false;
    return;
  end if;

  v_first_payment := v_account.stripe_latest_invoice_id is null;

  update public.user_ai_credit_accounts a
     set plan_id = p_plan_id,
         credits_total = least(
           v_expected,
           coalesce(a.credits_self_limit, v_expected)
         ),
         credits_used = 0,
         credits_reserved = 0,
         period_start = p_period_start,
         period_end = p_period_end,
         stripe_subscription_status = 'active',
         stripe_latest_invoice_id = p_invoice_id,
         stripe_latest_invoice_status = 'paid',
         updated_at = now()
   where a.user_id = p_user_id;

  return query
  select true, a.credits_total, v_first_payment
    from public.user_ai_credit_accounts a
   where a.user_id = p_user_id;
end;
$$;

-- Non-paying lifecycle events only update status. They never grant or reset
-- credits; already paid credits remain usable until period_end.
create or replace function public.record_stripe_subscription_status(
  p_event_id text,
  p_event_type text,
  p_stripe_subscription_id text,
  p_status text,
  p_cancel_at_period_end boolean,
  p_latest_invoice_id text default null,
  p_latest_invoice_status text default null
)
returns table (recorded boolean, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
  v_user_id uuid;
begin
  if p_event_id is null
     or p_event_type not in (
       'invoice.payment_failed',
       'customer.subscription.updated',
       'customer.subscription.deleted'
     )
     or p_stripe_subscription_id is null
     or p_stripe_subscription_id !~ '^sub_[A-Za-z0-9]+$'
     or p_status is null
     or p_status not in (
       'pending', 'incomplete', 'incomplete_expired', 'trialing', 'active',
       'past_due', 'canceled', 'unpaid', 'paused'
     )
     or (p_latest_invoice_id is not null and p_latest_invoice_id !~ '^in_[A-Za-z0-9]+$') then
    raise exception 'invalid Stripe subscription status input' using errcode = '22023';
  end if;

  select a.user_id into v_user_id
    from public.user_ai_credit_accounts a
   where a.stripe_subscription_id = p_stripe_subscription_id
   for update;
  if not found then
    raise exception 'Stripe subscription is not linked' using errcode = 'P0002';
  end if;

  insert into public.stripe_webhook_events (event_id, event_type, user_id)
  values (p_event_id, p_event_type, v_user_id)
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return query select false, v_user_id;
    return;
  end if;

  update public.user_ai_credit_accounts a
     set stripe_subscription_status = p_status,
         stripe_cancel_at_period_end = coalesce(
           p_cancel_at_period_end,
           a.stripe_cancel_at_period_end
         ),
         stripe_latest_invoice_id = coalesce(p_latest_invoice_id, a.stripe_latest_invoice_id),
         stripe_latest_invoice_status = coalesce(
           p_latest_invoice_status,
           a.stripe_latest_invoice_status
         ),
         updated_at = now()
   where a.user_id = v_user_id;

  return query select true, v_user_id;
end;
$$;

-- Stripe-managed fixed plans never refill from the local calendar. Once their
-- paid period expires, access drops to zero until another invoice.paid arrives.
create or replace function public.roll_ai_credit_period(p_user_id uuid)
returns table (
  rolled boolean,
  current_period_start timestamptz,
  current_period_end timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowance bigint;
begin
  if p_user_id is null then
    raise exception 'invalid AI credit period input' using errcode = '22023';
  end if;

  update public.user_ai_credit_accounts a
     set credits_total = 0,
         credits_used = 0,
         credits_reserved = 0,
         updated_at = now()
   where a.user_id = p_user_id
     and a.plan_id in ('basic', 'pro', 'business')
     and now() >= a.period_end
     and (a.credits_total <> 0 or a.credits_used <> 0 or a.credits_reserved <> 0);

  if found then
    return query
    select true, a.period_start, a.period_end
      from public.user_ai_credit_accounts a
     where a.user_id = p_user_id;
    return;
  end if;

  select private.credit_plan_monthly_allowance(a.plan_id)
    into v_allowance
    from public.user_ai_credit_accounts a
   where a.user_id = p_user_id;

  update public.user_ai_credit_accounts a
     set period_start = private.current_ai_credit_period_start(),
         period_end = private.current_ai_credit_period_start() + interval '1 month',
         credits_total = case
           when a.plan_id = 'enterprise_flex' then 0
           when v_allowance is not null then least(
             v_allowance,
             coalesce(a.credits_self_limit, v_allowance)
           )
           else a.credits_total
         end,
         credits_used = case
           when v_allowance is not null or a.plan_id = 'enterprise_flex' then 0
           else a.credits_used
         end,
         credits_reserved = case
           when v_allowance is not null or a.plan_id = 'enterprise_flex' then 0
           else a.credits_reserved
         end
   where a.user_id = p_user_id
     and a.plan_id not in ('basic', 'pro', 'business')
     and now() >= a.period_end;

  rolled := found;
  return query
  select rolled, a.period_start, a.period_end
    from public.user_ai_credit_accounts a
   where a.user_id = p_user_id;
end;
$$;

revoke all on function public.link_stripe_subscription_checkout(text,text,uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.link_stripe_subscription_checkout(text,text,uuid,text,text,text,text)
  to service_role;

revoke all on function public.activate_paid_plan(text,text,uuid,text,bigint,timestamptz,timestamptz,text,text,text)
  from public, anon, authenticated;
grant execute on function public.activate_paid_plan(text,text,uuid,text,bigint,timestamptz,timestamptz,text,text,text)
  to service_role;

revoke all on function public.record_stripe_subscription_status(text,text,text,text,boolean,text,text)
  from public, anon, authenticated;
grant execute on function public.record_stripe_subscription_status(text,text,text,text,boolean,text,text)
  to service_role;

notify pgrst, 'reload schema';

commit;
