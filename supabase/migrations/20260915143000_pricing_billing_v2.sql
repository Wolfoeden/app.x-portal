-- XPORTAL pricing and billing v2.
--
-- Commercial source in application code: lib/billing/plans.ts.
-- Values repeated here are an immutable migration snapshot and database
-- integrity boundary, not a second UI/configuration source.

begin;

-- ------------------------------------------------------------------ plans

alter table public.user_ai_credit_accounts
  add column if not exists trial_granted_at timestamptz;

-- The historic constraint does not know the new ids, so it must be removed
-- before existing rows are migrated to them.
alter table public.user_ai_credit_accounts
  drop constraint if exists user_ai_credit_accounts_plan_check;

-- Never reinterpret the historic 50 EUR / 3,000-credit plan as metered.
update public.user_ai_credit_accounts
   set plan_id = 'enterprise_legacy'
 where plan_id = 'enterprise';

-- Existing free accounts keep exactly their current balance and are marked as
-- already granted. The migration never adds another 300 credits.
update public.user_ai_credit_accounts
   set plan_id = 'trial',
       trial_granted_at = coalesce(trial_granted_at, created_at)
 where plan_id = 'free';

update public.user_ai_credit_accounts
   set trial_granted_at = coalesce(trial_granted_at, created_at)
 where plan_id = 'guest';

alter table public.user_ai_credit_accounts
  alter column plan_id set default 'trial';

alter table public.user_ai_credit_accounts
  add constraint user_ai_credit_accounts_plan_check check (
    plan_id in (
      'guest', 'trial', 'free', 'basic', 'pro', 'business',
      'enterprise_legacy', 'enterprise', 'enterprise_flex'
    )
  );

create or replace function private.normalize_credit_account_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_anonymous then
    new.plan_id := 'guest';
    new.trial_granted_at := coalesce(new.trial_granted_at, now());
  elsif new.plan_id = 'guest' then
    new.plan_id := 'trial';
    new.trial_granted_at := coalesce(new.trial_granted_at, now());
  elsif new.plan_id in ('trial', 'free') then
    new.trial_granted_at := coalesce(new.trial_granted_at, now());
  end if;
  return new;
end;
$$;

-- Returns the exact refill for fixed subscriptions; NULL means no refill.
create or replace function private.credit_plan_monthly_allowance(p_plan_id text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case p_plan_id
    when 'basic' then 500::bigint
    when 'pro' then 1250::bigint
    when 'business' then 4000::bigint
    when 'enterprise_legacy' then 3000::bigint
    when 'enterprise' then 3000::bigint
    else null::bigint
  end;
$$;

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

  select private.credit_plan_monthly_allowance(a.plan_id)
    into v_allowance
    from public.user_ai_credit_accounts a
   where a.user_id = p_user_id;

  update public.user_ai_credit_accounts a
     set period_start = private.current_ai_credit_period_start(),
         period_end = private.current_ai_credit_period_start() + interval '1 month',
         -- One-time trials advance their reporting window but never refill.
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
     and now() >= a.period_end;

  rolled := found;
  return query
  select rolled, a.period_start, a.period_end
    from public.user_ai_credit_accounts a
   where a.user_id = p_user_id;
end;
$$;

create or replace function public.get_ai_credit_snapshot(
  p_user_id uuid,
  p_is_anonymous boolean,
  p_initial_credit_total bigint
)
returns table (
  user_id uuid,
  is_anonymous boolean,
  credits_total bigint,
  credits_used bigint,
  credits_reserved bigint,
  credits_remaining bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was_anonymous boolean;
begin
  if p_user_id is null
     or p_is_anonymous is null
     or p_initial_credit_total is null
     or p_initial_credit_total < 0
     or not exists (
       select 1 from auth.users u
        where u.id = p_user_id
          and coalesce(u.is_anonymous, false) = p_is_anonymous
     ) then
    raise exception 'invalid AI credit account input' using errcode = '22023';
  end if;

  perform r.rolled from public.roll_ai_credit_period(p_user_id) r;
  select a.is_anonymous into v_was_anonymous
    from public.user_ai_credit_accounts a where a.user_id = p_user_id;

  insert into public.user_ai_credit_accounts (
    user_id, is_anonymous, credits_total, plan_id, trial_granted_at
  ) values (
    p_user_id, p_is_anonymous, p_initial_credit_total,
    case when p_is_anonymous then 'guest' else 'trial' end,
    now()
  )
  on conflict on constraint user_ai_credit_accounts_pkey do update
    set is_anonymous = excluded.is_anonymous,
        -- Converting the technical guest session creates the one and only
        -- account trial. Every later login preserves the existing balance.
        credits_total = case
          when v_was_anonymous and not excluded.is_anonymous
            then excluded.credits_total
          else public.user_ai_credit_accounts.credits_total
        end,
        credits_used = case
          when v_was_anonymous and not excluded.is_anonymous then 0
          else public.user_ai_credit_accounts.credits_used
        end,
        credits_reserved = case
          when v_was_anonymous and not excluded.is_anonymous then 0
          else public.user_ai_credit_accounts.credits_reserved
        end,
        trial_granted_at = coalesce(
          public.user_ai_credit_accounts.trial_granted_at,
          excluded.trial_granted_at
        );

  return query
  select a.user_id, a.is_anonymous, a.credits_total, a.credits_used,
         a.credits_reserved,
         greatest(a.credits_total - a.credits_used - a.credits_reserved, 0::bigint)
    from public.user_ai_credit_accounts a
   where a.user_id = p_user_id;
end;
$$;

-- New Stripe products activate only exact fixed-plan/allowance pairs.
create or replace function public.activate_paid_plan(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_plan_id text,
  p_plan_allowance bigint
)
returns table (activated boolean, credits_total bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
  v_expected bigint;
begin
  v_expected := private.credit_plan_monthly_allowance(p_plan_id);
  if p_event_id is null or p_event_type is null or p_user_id is null
     or v_expected is null or p_plan_allowance is distinct from v_expected
     or p_plan_id not in ('basic', 'pro', 'business', 'enterprise_legacy')
     or not exists (
       select 1 from auth.users u where u.id = p_user_id
         and coalesce(u.is_anonymous, false) = false
     ) then
    raise exception 'invalid plan activation input' using errcode = '22023';
  end if;

  insert into public.stripe_webhook_events (event_id, event_type, user_id)
  values (p_event_id, p_event_type, p_user_id)
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return query select false, a.credits_total
      from public.user_ai_credit_accounts a where a.user_id = p_user_id;
    return;
  end if;

  insert into public.user_ai_credit_accounts (
    user_id, is_anonymous, credits_total, plan_id
  ) values (p_user_id, false, v_expected, p_plan_id)
  on conflict on constraint user_ai_credit_accounts_pkey do update
    set plan_id = excluded.plan_id,
        credits_total = least(
          excluded.credits_total,
          coalesce(public.user_ai_credit_accounts.credits_self_limit, excluded.credits_total)
        ),
        credits_used = 0,
        credits_reserved = 0,
        period_start = private.current_ai_credit_period_start(),
        period_end = private.current_ai_credit_period_start() + interval '1 month',
        updated_at = now();

  return query select true, a.credits_total
    from public.user_ai_credit_accounts a where a.user_id = p_user_id;
end;
$$;

-- ----------------------------------------------------------- usage ledger

alter table public.ai_usage_reservations
  add column if not exists actor_user_id uuid references auth.users (id) on delete set null,
  add column if not exists billing_model_at_reservation text,
  add column if not exists euro_cents_per_credit bigint,
  add column if not exists billing_period_start timestamptz,
  add column if not exists billing_period_end timestamptz,
  add column if not exists enterprise_billable boolean not null default false,
  add column if not exists enterprise_invoice_id uuid;

alter table public.ai_usage_reservations
  add constraint ai_usage_reservations_billing_model_check
    check (billing_model_at_reservation is null or billing_model_at_reservation in ('one_time', 'fixed_monthly', 'metered')),
  add constraint ai_usage_reservations_meter_rate_check
    check (euro_cents_per_credit is null or euro_cents_per_credit > 0),
  add constraint ai_usage_reservations_billing_period_check
    check ((billing_period_start is null and billing_period_end is null) or billing_period_end > billing_period_start);

create index if not exists ai_usage_reservations_actor_idx
  on public.ai_usage_reservations (actor_user_id, reserved_at desc)
  where actor_user_id is not null;
create index if not exists ai_usage_reservations_enterprise_unbilled_idx
  on public.ai_usage_reservations (user_id, billing_period_start, settled_at)
  where enterprise_billable and enterprise_invoice_id is null;

-- Wrapper around the proven quota RPC. Fixed plans retain prepaid reservation;
-- metered accounts use the same request-key/provider-quota ledger without an
-- artificial credit ceiling.
create or replace function public.consume_ai_quota_v2(
  p_request_key text, p_user_hash text, p_ip_hash text,
  p_is_anonymous boolean, p_request_limit integer,
  p_daily_token_limit bigint, p_monthly_budget_cents bigint,
  p_estimated_tokens bigint, p_estimated_cost_cents bigint,
  p_user_id uuid, p_actor_user_id uuid, p_interaction_id uuid,
  p_requested_model text, p_purpose text, p_estimated_credits bigint,
  p_initial_credit_total bigint, p_estimated_cost_nano_usd bigint,
  p_pricing_version text, p_credit_policy_version text
)
returns table (
  allowed boolean, reason text, retry_after timestamptz, reservation_id uuid,
  credits_total bigint, credits_used bigint, credits_reserved bigint,
  credits_remaining bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_quota record;
  v_existing public.ai_usage_reservations%rowtype;
  v_account public.user_ai_credit_accounts%rowtype;
begin
  if p_actor_user_id is null or not exists (
    select 1 from auth.users u where u.id = p_actor_user_id
  ) then
    return query select false, 'invalid_input'::text, null::timestamptz,
      null::uuid, null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  perform * from public.get_ai_credit_snapshot(
    p_user_id, p_is_anonymous, p_initial_credit_total
  );
  select a.plan_id into v_plan from public.user_ai_credit_accounts a
   where a.user_id = p_user_id;

  select r.* into v_existing from public.ai_usage_reservations r
   where r.request_key = p_request_key;
  if found and (
       v_existing.user_id is distinct from p_user_id
       or v_existing.actor_user_id is distinct from p_actor_user_id
       or v_existing.user_hash is distinct from p_user_hash
       or v_existing.ip_hash is distinct from p_ip_hash
       or v_existing.is_anonymous is distinct from p_is_anonymous
       or v_existing.interaction_id is distinct from p_interaction_id
       or v_existing.requested_model is distinct from btrim(p_requested_model)
       or v_existing.purpose is distinct from p_purpose
       or v_existing.estimated_tokens is distinct from p_estimated_tokens
       or v_existing.estimated_cost_cents is distinct from p_estimated_cost_cents
       or v_existing.estimated_credits is distinct from p_estimated_credits
       or v_existing.estimated_cost_nano_usd is distinct from p_estimated_cost_nano_usd
       or v_existing.pricing_version is distinct from nullif(btrim(p_pricing_version), '')
       or v_existing.credit_policy_version is distinct from btrim(p_credit_policy_version)
     ) then
    return query select false, 'request_key_conflict'::text, null::timestamptz,
      null::uuid, null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  if v_plan <> 'enterprise_flex' then
    select q.* into v_quota from public.consume_ai_quota(
      p_request_key, p_user_hash, p_ip_hash, p_is_anonymous,
      p_request_limit, p_daily_token_limit, p_monthly_budget_cents,
      p_estimated_tokens, p_estimated_cost_cents, p_user_id,
      p_interaction_id, p_requested_model, p_purpose, p_estimated_credits,
      p_initial_credit_total, p_estimated_cost_nano_usd,
      p_pricing_version, p_credit_policy_version
    ) q;
  else
    if found then
      select a.* into v_account from public.user_ai_credit_accounts a
       where a.user_id = p_user_id;
      return query select false, 'already_reserved'::text, null::timestamptz,
        v_existing.id, v_account.credits_total, v_account.credits_used,
        v_account.credits_reserved, 0::bigint;
      return;
    end if;

    select q.* into v_quota from public.consume_ai_quota(
      p_request_key, p_user_hash, p_ip_hash, p_is_anonymous,
      p_request_limit, p_daily_token_limit, p_monthly_budget_cents,
      p_estimated_tokens, p_estimated_cost_cents
    ) q;
    if v_quota.allowed then
      update public.ai_usage_reservations r set
        user_id = p_user_id,
        interaction_id = p_interaction_id,
        requested_model = btrim(p_requested_model),
        purpose = p_purpose,
        estimated_credits = p_estimated_credits,
        estimated_cost_nano_usd = p_estimated_cost_nano_usd,
        pricing_version = nullif(btrim(p_pricing_version), ''),
        credit_policy_version = btrim(p_credit_policy_version)
      where r.id = v_quota.reservation_id;
    end if;
  end if;

  if v_quota.reservation_id is not null then
    update public.ai_usage_reservations r set
      actor_user_id = p_actor_user_id,
      billing_model_at_reservation = case when v_plan = 'enterprise_flex' then 'metered' when v_plan in ('guest','trial','free') then 'one_time' else 'fixed_monthly' end,
      euro_cents_per_credit = case when v_plan = 'enterprise_flex' then 2 else null end,
      billing_period_start = private.current_ai_credit_period_start(),
      billing_period_end = private.current_ai_credit_period_start() + interval '1 month'
    where r.id = v_quota.reservation_id and r.actor_user_id is null;
  end if;

  select a.* into v_account from public.user_ai_credit_accounts a
   where a.user_id = p_user_id;
  return query select v_quota.allowed, v_quota.reason, v_quota.retry_after,
    v_quota.reservation_id, v_account.credits_total, v_account.credits_used,
    v_account.credits_reserved,
    case when v_plan = 'enterprise_flex' then 0::bigint else greatest(v_account.credits_total - v_account.credits_used - v_account.credits_reserved, 0::bigint) end;
end;
$$;

create or replace function public.record_ai_usage_v2(
  p_request_key text, p_actual_input_tokens bigint,
  p_actual_cached_input_tokens bigint, p_actual_output_tokens bigint,
  p_actual_total_tokens bigint, p_actual_cost_cents bigint,
  p_actual_cost_nano_usd bigint, p_actual_credits bigint, p_outcome text,
  p_actual_model text, p_provider_response_id text, p_pricing_version text,
  p_credit_policy_version text
)
returns table (
  recorded boolean, reason text, credits_total bigint, credits_used bigint,
  credits_reserved bigint, credits_remaining bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_result record;
begin
  select r.* into v_result from public.record_ai_usage(
    p_request_key, p_actual_input_tokens, p_actual_cached_input_tokens,
    p_actual_output_tokens, p_actual_total_tokens, p_actual_cost_cents,
    p_actual_cost_nano_usd, p_actual_credits, p_outcome, p_actual_model,
    p_provider_response_id, p_pricing_version, p_credit_policy_version
  ) r;

  return query select v_result.recorded, v_result.reason,
    v_result.credits_total, v_result.credits_used,
    v_result.credits_reserved, v_result.credits_remaining;
end;
$$;

-- Preserve settled-ledger immutability while allowing an executing team
-- member to be unlinked on account deletion. The billing owner and invoice
-- evidence remain unchanged.
create or replace function private.guard_settled_ai_usage_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.settled_at is null and new.settled_at is not null then
    new.enterprise_billable := (
      new.billing_model_at_reservation = 'metered'
      and coalesce(new.actual_credits, 0) > 0
      and new.outcome in ('succeeded', 'reconciled_estimate')
    );
  end if;

  if old.actor_user_id is not null and new.actor_user_id is null
     and to_jsonb(new) - array['actor_user_id']::text[]
       = to_jsonb(old) - array['actor_user_id']::text[] then
    return new;
  end if;

  if old.user_id is not null and new.user_id is null then
    if to_jsonb(new) - array['user_id','actor_user_id']::text[]
         = to_jsonb(old) - array['user_id','actor_user_id']::text[] then
      new.user_hash := 'deleted:' || replace(gen_random_uuid()::text, '-', '');
      new.ip_hash := 'deleted:' || replace(gen_random_uuid()::text, '-', '');
      new.request_key := 'deleted:' || replace(gen_random_uuid()::text, '-', '');
      new.interaction_id := null;
      new.provider_response_id := null;
      if old.settled_at is null then
        new.actual_input_tokens := old.estimated_tokens;
        new.actual_cached_input_tokens := 0;
        new.actual_output_tokens := 0;
        new.actual_total_tokens := old.estimated_tokens;
        new.actual_cost_cents := old.estimated_cost_cents;
        new.actual_cost_nano_usd := old.estimated_cost_nano_usd;
        new.actual_credits := old.estimated_credits;
        new.outcome := 'reconciled_estimate';
        new.settled_at := now();
      end if;
      return new;
    end if;

    if new.user_hash like 'deleted:%'
       and new.ip_hash like 'deleted:%'
       and new.request_key like 'deleted:%'
       and new.interaction_id is null
       and new.provider_response_id is null
       and to_jsonb(new) - array[
         'user_id', 'actor_user_id', 'user_hash', 'ip_hash', 'request_key',
         'interaction_id', 'provider_response_id'
       ]::text[]
         = to_jsonb(old) - array[
           'user_id', 'actor_user_id', 'user_hash', 'ip_hash', 'request_key',
           'interaction_id', 'provider_response_id'
         ]::text[] then
      return new;
    end if;
  end if;

  if old.settled_at is not null
     and old.enterprise_invoice_id is null
     and new.enterprise_invoice_id is not null
     and to_jsonb(new) - array['enterprise_invoice_id']::text[]
       = to_jsonb(old) - array['enterprise_invoice_id']::text[] then
    return new;
  end if;

  if old.settled_at is not null and new is distinct from old then
    raise exception 'settled AI usage records are immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

-- --------------------------------------------------------------- invoices

create table public.enterprise_usage_invoices (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete restrict,
  period_start timestamptz not null,
  period_end timestamptz not null,
  consumed_credits bigint not null check (consumed_credits >= 0),
  net_amount_cents bigint not null check (net_amount_cents >= 0),
  status text not null default 'prepared' check (status in ('prepared','invoiced','void')),
  external_invoice_reference text unique,
  prepared_at timestamptz not null default now(),
  invoiced_at timestamptz,
  constraint enterprise_usage_invoices_period_check check (period_end > period_start),
  constraint enterprise_usage_invoices_owner_period_key unique (owner_user_id, period_start, period_end)
);

alter table public.ai_usage_reservations
  add constraint ai_usage_reservations_enterprise_invoice_fk
  foreign key (enterprise_invoice_id) references public.enterprise_usage_invoices (id) on delete restrict;

alter table public.enterprise_usage_invoices enable row level security;
alter table public.enterprise_usage_invoices force row level security;
revoke all on public.enterprise_usage_invoices from public, anon, authenticated;
grant select, insert, update on public.enterprise_usage_invoices to service_role;

create or replace function public.prepare_enterprise_usage_invoice(
  p_owner_user_id uuid, p_period_start timestamptz, p_period_end timestamptz
)
returns table (invoice_id uuid, consumed_credits bigint, net_amount_cents bigint, repeated boolean)
language plpgsql security definer set search_path = ''
as $$
declare v_invoice public.enterprise_usage_invoices%rowtype; v_credits bigint;
begin
  if p_owner_user_id is null or p_period_start is null or p_period_end is null
     or p_period_end <= p_period_start or p_period_end > now() then
    raise exception 'invalid enterprise invoice period' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_user_id::text || p_period_start::text, 1515));
  select i.* into v_invoice from public.enterprise_usage_invoices i
   where i.owner_user_id = p_owner_user_id and i.period_start = p_period_start and i.period_end = p_period_end;
  if found then
    return query select v_invoice.id, v_invoice.consumed_credits, v_invoice.net_amount_cents, true;
    return;
  end if;
  if exists (
    select 1 from public.ai_usage_reservations r
     where r.user_id = p_owner_user_id and r.billing_model_at_reservation = 'metered'
       and r.billing_period_start = p_period_start and r.billing_period_end = p_period_end
       and r.settled_at is null
  ) then
    raise exception 'enterprise usage period has unsettled requests' using errcode = '55000';
  end if;
  select coalesce(sum(r.actual_credits), 0)::bigint into v_credits
    from public.ai_usage_reservations r
   where r.user_id = p_owner_user_id and r.enterprise_billable
     and r.billing_period_start = p_period_start and r.billing_period_end = p_period_end
     and r.enterprise_invoice_id is null;
  insert into public.enterprise_usage_invoices (owner_user_id, period_start, period_end, consumed_credits, net_amount_cents)
  values (p_owner_user_id, p_period_start, p_period_end, v_credits, v_credits * 2)
  returning * into v_invoice;
  update public.ai_usage_reservations r set enterprise_invoice_id = v_invoice.id
   where r.user_id = p_owner_user_id and r.enterprise_billable
     and r.billing_period_start = p_period_start and r.billing_period_end = p_period_end
     and r.enterprise_invoice_id is null;
  return query select v_invoice.id, v_invoice.consumed_credits, v_invoice.net_amount_cents, false;
end;
$$;

revoke all on function public.consume_ai_quota_v2(text,text,text,boolean,integer,bigint,bigint,bigint,bigint,uuid,uuid,uuid,text,text,bigint,bigint,bigint,text,text) from public, anon, authenticated;
grant execute on function public.consume_ai_quota_v2(text,text,text,boolean,integer,bigint,bigint,bigint,bigint,uuid,uuid,uuid,text,text,bigint,bigint,bigint,text,text) to service_role;
revoke all on function public.record_ai_usage_v2(text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.record_ai_usage_v2(text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,text,text,text,text,text) to service_role;
revoke all on function public.prepare_enterprise_usage_invoice(uuid,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.prepare_enterprise_usage_invoice(uuid,timestamptz,timestamptz) to service_role;
revoke all on function private.credit_plan_monthly_allowance(text) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
