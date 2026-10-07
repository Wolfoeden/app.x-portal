-- Recruiting SaaS: verified card trial, atomic checkout, paid periods and legacy preservation.
-- Apply to an isolated database first. No existing contracts or invoice history are deleted.
begin;

alter table public.user_ai_credit_accounts
  add column billing_generation text not null default 'recruiting_v1',
  add column legacy_credit_balance bigint not null default 0 check (legacy_credit_balance >= 0),
  add column billing_grant_credits bigint not null default 0 check (billing_grant_credits >= 0),
  add column stripe_trial_started_at timestamptz,
  add column stripe_trial_end timestamptz,
  add column stripe_trial_claimed_at timestamptz,
  add column stripe_paid_through timestamptz,
  add column stripe_first_paid_at timestamptz,
  add column stripe_cancel_requested_at timestamptz,
  add column stripe_synced_at timestamptz;

-- Pre-migration one-time balances remain usable and are never replaced by a
-- smaller new-user allowance. They are carried through a later subscription.
update public.user_ai_credit_accounts a set billing_generation = 'legacy',
  legacy_credit_balance = case when a.stripe_subscription_id is null and a.plan_id in ('guest','trial','free')
    then a.credits_total else 0 end,
  billing_grant_credits = case when a.stripe_subscription_id is not null then a.credits_total else 0 end,
  stripe_paid_through = case when a.stripe_subscription_id is not null and a.stripe_latest_invoice_status = 'paid' then a.period_end else null end,
  stripe_first_paid_at = case when a.stripe_subscription_id is not null and a.stripe_latest_invoice_status = 'paid' then a.created_at else null end;

create table public.recruiting_checkout_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  request_key uuid not null unique default gen_random_uuid(),
  plan_id text not null check (plan_id in ('basic','pro','business')),
  session_id text unique,
  session_url text,
  customer_id text,
  trial_eligible boolean not null,
  expires_at timestamptz not null,
  completed_at timestamptz
);
alter table public.recruiting_checkout_attempts enable row level security;
revoke all on public.recruiting_checkout_attempts from public, anon, authenticated;
grant select,insert,update,delete on public.recruiting_checkout_attempts to service_role;

-- A keyed identity survives account deletion/recreation. Email itself stays in Auth.
create table private.recruiting_trial_identities (
  email_hash text primary key,
  reserved_by uuid not null,
  reserved_until timestamptz not null,
  claimed_at timestamptz
);
alter table private.recruiting_trial_identities enable row level security;
revoke all on private.recruiting_trial_identities from public, anon, authenticated;

create table public.recruiting_billing_grants (
  subscription_id text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  invoice_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_paid bigint not null check (amount_paid > 0),
  primary key (subscription_id,period_start,period_end)
);
alter table public.recruiting_billing_grants enable row level security;
revoke all on public.recruiting_billing_grants from public, anon, authenticated;
grant select,insert on public.recruiting_billing_grants to service_role;

create or replace function public.get_ai_credit_snapshot(p_user_id uuid,p_is_anonymous boolean,p_initial_credit_total bigint)
returns table (user_id uuid,is_anonymous boolean,credits_total bigint,credits_used bigint,credits_reserved bigint,credits_remaining bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if p_user_id is null or p_is_anonymous is null or not exists (
    select 1 from auth.users u where u.id=p_user_id and coalesce(u.is_anonymous,false)=p_is_anonymous
  ) then raise exception 'invalid AI credit account input' using errcode='22023'; end if;
  -- Initial parameter intentionally ignored: no caller can restore a bonus.
  insert into public.user_ai_credit_accounts(user_id,is_anonymous,credits_total,plan_id)
    values(p_user_id,p_is_anonymous,0,case when p_is_anonymous then 'guest' else 'trial' end)
    on conflict on constraint user_ai_credit_accounts_pkey do update
      set is_anonymous=excluded.is_anonymous;
  perform * from public.roll_ai_credit_period(p_user_id);
  return query select a.user_id,a.is_anonymous,a.credits_total,a.credits_used,a.credits_reserved,
    greatest(a.credits_total-a.credits_used-a.credits_reserved,0::bigint)
    from public.user_ai_credit_accounts a where a.user_id=p_user_id;
end; $$;

create or replace function public.roll_ai_credit_period(p_user_id uuid)
returns table (rolled boolean,current_period_start timestamptz,current_period_end timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_account public.user_ai_credit_accounts%rowtype; v_legacy bigint; v_allowance bigint; v_rolled boolean:=false;
begin
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

create function public.get_recruiting_entitlement(p_user_id uuid)
returns table(can_run_ai boolean,can_use_recruiting boolean,source text,reason text)
language plpgsql security definer set search_path = '' as $$
declare a public.user_ai_credit_accounts%rowtype; v_source text:='none'; v_active boolean:=false; v_remaining bigint;
begin
  perform * from public.roll_ai_credit_period(p_user_id);
  select c.* into a from public.user_ai_credit_accounts c where c.user_id=p_user_id;
  if not found then return query select false,false,'none'::text,'billing_required'::text; return; end if;
  v_remaining:=greatest(a.credits_total-a.credits_used-a.credits_reserved,0);
  if a.stripe_trial_claimed_at is not null and a.stripe_trial_end>now()
    and a.stripe_subscription_status in ('trialing','canceled') then v_source:='trial'; v_active:=true;
  elsif a.stripe_paid_through>now() and a.stripe_first_paid_at is not null
    and a.stripe_subscription_status in ('active','past_due','canceled','unpaid') then v_source:='paid'; v_active:=true;
  elsif a.billing_generation='legacy' and a.stripe_subscription_id is null
    and (v_remaining>0 or a.plan_id in ('enterprise','enterprise_legacy','enterprise_flex')) then v_source:='legacy'; v_active:=true;
  elsif a.legacy_credit_balance>0 and v_remaining>0 then v_source:='legacy'; v_active:=true;
  end if;
  return query select v_active and (v_remaining>0 or a.plan_id='enterprise_flex'),
    v_active and not a.is_anonymous,v_source,
    case when not v_active then 'billing_required' when v_remaining=0 and a.plan_id<>'enterprise_flex' then 'insufficient_credits' else 'ok' end;
end; $$;

create function public.prepare_recruiting_checkout(p_user_id uuid,p_plan_id text)
returns setof public.recruiting_checkout_attempts
language plpgsql security definer set search_path = '' as $$
declare a public.user_ai_credit_accounts%rowtype; u auth.users%rowtype; v_trial boolean; v_hash text; v_expires timestamptz;
begin
  if p_plan_id not in ('basic','pro','business') then raise exception 'invalid_plan'; end if;
  select x.* into u from auth.users x where x.id=p_user_id;
  if not found or coalesce(u.is_anonymous,false) or u.email_confirmed_at is null or u.email is null then raise exception 'email_not_verified'; end if;
  perform * from public.get_ai_credit_snapshot(p_user_id,false,0);
  select x.* into a from public.user_ai_credit_accounts x where x.user_id=p_user_id for update;
  if a.stripe_subscription_id is not null and coalesce(a.stripe_subscription_status,'pending') not in ('canceled','incomplete_expired') then raise exception 'subscription_exists'; end if;
  if a.billing_generation='legacy' and a.plan_id in ('enterprise','enterprise_legacy','enterprise_flex') then raise exception 'subscription_exists'; end if;
  if exists(select 1 from public.recruiting_checkout_attempts c where c.user_id=p_user_id and c.expires_at>now() and c.completed_at is null) then
    return query select c.* from public.recruiting_checkout_attempts c where c.user_id=p_user_id; return;
  end if;
  v_hash:=encode(extensions.digest(lower(trim(u.email)),'sha256'),'hex');
  v_expires:=date_trunc('second',now())+interval '24 hours';
  insert into private.recruiting_trial_identities(email_hash,reserved_by,reserved_until)
    values(v_hash,p_user_id,v_expires) on conflict(email_hash) do update
    set reserved_by=excluded.reserved_by,reserved_until=excluded.reserved_until
    where private.recruiting_trial_identities.claimed_at is null and (private.recruiting_trial_identities.reserved_until<=now() or private.recruiting_trial_identities.reserved_by=p_user_id);
  v_trial:=a.stripe_trial_claimed_at is null and a.stripe_subscription_id is null and not exists(
    select 1 from private.recruiting_trial_identities t where t.email_hash=v_hash and (t.claimed_at is not null or t.reserved_by<>p_user_id)
  );
  insert into public.recruiting_checkout_attempts(user_id,plan_id,customer_id,trial_eligible,expires_at)
    values(p_user_id,p_plan_id,a.stripe_customer_id,v_trial,v_expires)
    on conflict(user_id) do update set request_key=gen_random_uuid(),plan_id=excluded.plan_id,
      session_id=null,session_url=null,customer_id=excluded.customer_id,trial_eligible=excluded.trial_eligible,expires_at=excluded.expires_at,completed_at=null;
  return query select c.* from public.recruiting_checkout_attempts c where c.user_id=p_user_id;
end; $$;

create function public.save_recruiting_checkout_customer(p_user_id uuid,p_request_key uuid,p_customer_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_customer_id!~'^cus_[A-Za-z0-9]+$' then raise exception 'invalid_customer'; end if;
  update public.recruiting_checkout_attempts c set customer_id=p_customer_id where c.user_id=p_user_id and c.request_key=p_request_key;
  if not found then raise exception 'checkout_conflict'; end if;
  update public.user_ai_credit_accounts a set stripe_customer_id=p_customer_id where a.user_id=p_user_id;
end; $$;
create function public.save_recruiting_checkout_session(p_user_id uuid,p_request_key uuid,p_session_id text,p_session_url text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_session_id!~'^cs_[A-Za-z0-9]+$' or p_session_url not like 'https://checkout.stripe.com/%' then raise exception 'invalid_session'; end if;
  update public.recruiting_checkout_attempts c set session_id=p_session_id,session_url=p_session_url
    where c.user_id=p_user_id and c.request_key=p_request_key and (c.session_id is null or c.session_id=p_session_id);
  if not found then raise exception 'checkout_conflict'; end if;
end; $$;

create function public.sync_recruiting_subscription(
  p_user_id uuid,p_event_id text,p_event_type text,p_subscription_id text,p_customer_id text,p_plan_id text,p_status text,
  p_cancel_at_period_end boolean,p_trial_start timestamptz,p_trial_end timestamptz,p_card_collected boolean,p_checkout_verified boolean,
  p_checkout_session_id text,p_checkout_key uuid,p_trial_credits bigint,p_invoice_id text,p_invoice_status text,p_amount_paid bigint,
  p_paid_period_start timestamptz,p_paid_period_end timestamptz
)
returns table(trial_activated boolean,paid_activated boolean,first_payment boolean,cancelled boolean,access_until timestamptz)
language plpgsql security definer set search_path = '' as $$
declare a public.user_ai_credit_accounts%rowtype; c public.recruiting_checkout_attempts%rowtype;
  v_inserted integer; v_trial boolean:=false; v_paid boolean:=false; v_first boolean:=false; v_cancel boolean:=false; v_legacy bigint; v_allowance bigint;
begin
  if p_user_id is null or p_event_id is null or p_subscription_id!~'^sub_[A-Za-z0-9]+$' or p_customer_id!~'^cus_[A-Za-z0-9]+$'
    or p_plan_id not in ('basic','pro','business') or p_status not in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
    or p_trial_credits<1 or p_trial_credits>10000 then raise exception 'invalid_subscription_input'; end if;
  select x.* into a from public.user_ai_credit_accounts x where x.user_id=p_user_id for update;
  if not found or a.is_anonymous then raise exception 'invalid_account'; end if;
  select x.* into c from public.recruiting_checkout_attempts x where x.user_id=p_user_id;
  if a.stripe_subscription_id is distinct from p_subscription_id then
    if not p_checkout_verified or c.session_id is distinct from p_checkout_session_id or c.request_key is distinct from p_checkout_key
      or c.customer_id is distinct from p_customer_id or c.plan_id is distinct from p_plan_id
      or (a.stripe_subscription_id is not null and a.stripe_subscription_status not in ('canceled','incomplete_expired')) then raise exception 'unverified_checkout'; end if;
  elsif a.stripe_customer_id is distinct from p_customer_id then raise exception 'customer_mismatch'; end if;
  insert into public.stripe_webhook_events(event_id,event_type,user_id) values(p_event_id,p_event_type,p_user_id) on conflict(event_id) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then return query select false,false,false,false,coalesce(a.stripe_paid_through,a.stripe_trial_end); return; end if;

  -- A canceled renewal is latched. A late event can never switch it back on.
  v_cancel:=(p_cancel_at_period_end or p_status='canceled') and a.stripe_cancel_requested_at is null;
  update public.user_ai_credit_accounts x set stripe_subscription_id=p_subscription_id,stripe_customer_id=p_customer_id,
    stripe_plan_id=p_plan_id,stripe_subscription_status=p_status,
    stripe_cancel_at_period_end=x.stripe_cancel_at_period_end or p_cancel_at_period_end or p_status='canceled',
    stripe_cancel_requested_at=case when p_cancel_at_period_end or p_status='canceled' then coalesce(x.stripe_cancel_requested_at,now()) else x.stripe_cancel_requested_at end,
    stripe_trial_started_at=coalesce(x.stripe_trial_started_at,p_trial_start),stripe_trial_end=coalesce(x.stripe_trial_end,p_trial_end),
    stripe_latest_invoice_id=coalesce(p_invoice_id,x.stripe_latest_invoice_id),stripe_latest_invoice_status=coalesce(p_invoice_status,x.stripe_latest_invoice_status),
    stripe_synced_at=now(),stripe_checkout_completed_at=case when p_checkout_verified then coalesce(x.stripe_checkout_completed_at,now()) else x.stripe_checkout_completed_at end
    where x.user_id=p_user_id;

  if a.stripe_trial_claimed_at is null and c.trial_eligible and p_checkout_verified and p_card_collected
    and p_status='trialing' and p_trial_end>now() and p_trial_start is not null then
    update private.recruiting_trial_identities t set claimed_at=now() where t.reserved_by=p_user_id and t.claimed_at is null;
    if not found then raise exception 'trial_already_claimed'; end if;
    v_legacy:=greatest(a.credits_total-a.credits_used,0);
    update public.user_ai_credit_accounts x set plan_id=p_plan_id,credits_total=v_legacy+p_trial_credits,credits_used=0,
      legacy_credit_balance=v_legacy,billing_grant_credits=p_trial_credits,stripe_trial_claimed_at=now(),
      period_start=p_trial_start,period_end=p_trial_end where x.user_id=p_user_id;
    v_trial:=true;
  end if;
  -- A zero invoice is never a paid grant. Only an actual positive payment for
  -- a complete non-proration period grants the monthly allowance once.
  if p_amount_paid>0 and p_invoice_status='paid' and p_invoice_id is not null
    and p_paid_period_start is not null and p_paid_period_end>p_paid_period_start and p_status in ('active','past_due','canceled','unpaid') then
    insert into public.recruiting_billing_grants(subscription_id,period_start,period_end,invoice_id,user_id,amount_paid)
      values(p_subscription_id,p_paid_period_start,p_paid_period_end,p_invoice_id,p_user_id,p_amount_paid)
      on conflict do nothing;
    get diagnostics v_inserted=row_count;
    if v_inserted>0 and (a.stripe_paid_through is null or p_paid_period_end>a.stripe_paid_through) then
      v_first:=a.stripe_first_paid_at is null;
      v_allowance:=private.credit_plan_monthly_allowance(p_plan_id);
      v_legacy:=greatest(a.legacy_credit_balance-greatest(a.credits_used-a.billing_grant_credits,0),0);
      update public.user_ai_credit_accounts x set plan_id=p_plan_id,credits_total=v_legacy+least(v_allowance,coalesce(x.credits_self_limit,v_allowance)),
        legacy_credit_balance=v_legacy,billing_grant_credits=least(v_allowance,coalesce(x.credits_self_limit,v_allowance)),credits_used=0,
        period_start=p_paid_period_start,period_end=p_paid_period_end,stripe_paid_through=p_paid_period_end,stripe_first_paid_at=coalesce(x.stripe_first_paid_at,now())
        where x.user_id=p_user_id;
      v_paid:=true;
    end if;
  end if;
  if p_checkout_verified then update public.recruiting_checkout_attempts x set completed_at=coalesce(x.completed_at,now()) where x.user_id=p_user_id; end if;
  return query select v_trial,v_paid,v_first,v_cancel,coalesce(x.stripe_paid_through,x.stripe_trial_end) from public.user_ai_credit_accounts x where x.user_id=p_user_id;
end; $$;

-- Enforce eligibility inside the same quota transaction as reservations.
-- Preserve the proven reservation implementation behind a service-only wrapper.
alter function public.consume_ai_quota_v2(text,text,text,boolean,integer,bigint,bigint,bigint,bigint,uuid,uuid,uuid,text,text,bigint,bigint,bigint,text,text)
  rename to consume_ai_quota_v2_before_recruiting;
create function public.consume_ai_quota_v2(
  p_request_key text,p_user_hash text,p_ip_hash text,p_is_anonymous boolean,p_request_limit integer,p_daily_token_limit bigint,
  p_monthly_budget_cents bigint,p_estimated_tokens bigint,p_estimated_cost_cents bigint,p_user_id uuid,p_actor_user_id uuid,p_interaction_id uuid,
  p_requested_model text,p_purpose text,p_estimated_credits bigint,p_initial_credit_total bigint,p_estimated_cost_nano_usd bigint,p_pricing_version text,p_credit_policy_version text
)
returns table(allowed boolean,reason text,retry_after timestamptz,reservation_id uuid,credits_total bigint,credits_used bigint,credits_reserved bigint,credits_remaining bigint)
language plpgsql security definer set search_path = '' as $$
begin
  perform * from public.get_ai_credit_snapshot(p_user_id,p_is_anonymous,0);
  -- Account lock keeps grant/expiry/reservation decisions serialized.
  perform 1 from public.user_ai_credit_accounts a where a.user_id=p_user_id for update;
  if not exists(select 1 from public.get_recruiting_entitlement(p_user_id) e where e.can_run_ai) then
    return query select false,'billing_required'::text,null::timestamptz,null::uuid,
      a.credits_total,a.credits_used,a.credits_reserved,greatest(a.credits_total-a.credits_used-a.credits_reserved,0)
      from public.user_ai_credit_accounts a where a.user_id=p_user_id; return;
  end if;
  return query select * from public.consume_ai_quota_v2_before_recruiting(p_request_key,p_user_hash,p_ip_hash,p_is_anonymous,p_request_limit,
    p_daily_token_limit,p_monthly_budget_cents,p_estimated_tokens,p_estimated_cost_cents,p_user_id,p_actor_user_id,p_interaction_id,
    p_requested_model,p_purpose,p_estimated_credits,0,p_estimated_cost_nano_usd,p_pricing_version,p_credit_policy_version);
end; $$;

-- Every new privileged RPC is service-only; browser authorization stays in
-- authenticated routes, never user-editable metadata or client price values.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('get_recruiting_entitlement','prepare_recruiting_checkout','save_recruiting_checkout_customer',
      'save_recruiting_checkout_session','sync_recruiting_subscription','consume_ai_quota_v2','consume_ai_quota_v2_before_recruiting') loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
