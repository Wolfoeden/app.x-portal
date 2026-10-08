-- Restore null validation and keep the legacy paid-invoice RPC compatible
-- with grant expiry, retained balances, and in-flight reservations.
begin;

create or replace function public.roll_ai_credit_period(p_user_id uuid)
returns table (rolled boolean,current_period_start timestamptz,current_period_end timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_account public.user_ai_credit_accounts%rowtype; v_legacy bigint; v_allowance bigint; v_rolled boolean:=false;
begin
  if p_user_id is null then raise exception 'user identity is required' using errcode='22023'; end if;
  select a.* into v_account from public.user_ai_credit_accounts a where a.user_id=p_user_id for update;
  if not found then return; end if;
  if v_account.stripe_subscription_id is not null then
    if now()>=v_account.period_end and v_account.billing_grant_credits>0 then
      -- Consume the current entitlement before retained legacy balance.
      v_legacy:=greatest(v_account.legacy_credit_balance-greatest(v_account.credits_used-v_account.billing_grant_credits,0),0);
      update public.user_ai_credit_accounts a set credits_total=v_legacy,credits_used=0,
        legacy_credit_balance=v_legacy,billing_grant_credits=0 where a.user_id=p_user_id;
      -- Keep reservations: in-flight requests may still settle after expiry.
      v_rolled:=true;
    end if;
  elsif v_account.billing_generation='legacy' and v_account.plan_id in ('enterprise','enterprise_legacy','enterprise_flex') and now()>=v_account.period_end then
    v_allowance:=private.credit_plan_monthly_allowance(v_account.plan_id);
    update public.user_ai_credit_accounts a set period_start=private.current_ai_credit_period_start(),
      period_end=private.current_ai_credit_period_start()+interval '1 month',
      credits_total=coalesce(least(v_allowance,coalesce(a.credits_self_limit,v_allowance)),0),
      credits_used=0 where a.user_id=p_user_id;
    v_rolled:=true;
  end if;
  return query select v_rolled,a.period_start,a.period_end from public.user_ai_credit_accounts a where a.user_id=p_user_id;
end; $$;

create or replace function public.activate_paid_plan(
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
         legacy_credit_balance = greatest(a.legacy_credit_balance - greatest(a.credits_used - a.billing_grant_credits, 0), 0),
         credits_total = greatest(a.legacy_credit_balance - greatest(a.credits_used - a.billing_grant_credits, 0), 0) + least(
           v_expected,
           coalesce(a.credits_self_limit, v_expected)
         ),
         credits_used = 0,
         credits_reserved = a.credits_reserved,
         billing_grant_credits = least(v_expected, coalesce(a.credits_self_limit, v_expected)),
         stripe_paid_through = p_period_end,
         stripe_first_paid_at = coalesce(a.stripe_first_paid_at, now()),
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


commit;
