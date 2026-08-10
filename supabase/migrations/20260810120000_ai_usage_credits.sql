-- Turn the existing quota reservation into the canonical per-request usage
-- ledger and add an internal XPORTAL-credit account. The older RPC overloads
-- remain available during the application rollout; new callers must use the
-- extended overloads below so token limits, provider budget and credits are
-- reserved and settled in one database transaction.

begin;

create table public.user_ai_credit_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_anonymous boolean not null,
  credits_total bigint not null,
  credits_used bigint not null default 0,
  credits_reserved bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_ai_credit_accounts_nonnegative_check
    check (
      credits_total >= 0
      and credits_used >= 0
      and credits_reserved >= 0
    )
);

alter table public.user_ai_credit_accounts enable row level security;
alter table public.user_ai_credit_accounts force row level security;

-- There are deliberately no browser policies. Credit balances are read and
-- changed only by service-role server routes and the service-only RPCs below.
revoke all on public.user_ai_credit_accounts from public, anon, authenticated;
grant select, insert, update, delete on public.user_ai_credit_accounts to service_role;

create trigger user_ai_credit_accounts_set_updated_at
  before update on public.user_ai_credit_accounts
  for each row execute function private.set_updated_at();

alter table public.ai_usage_reservations
  add column user_id uuid
    references auth.users (id) on delete set null,
  add column interaction_id uuid,
  add column requested_model text,
  add column actual_model text,
  add column purpose text,
  add column provider_response_id text,
  add column actual_cached_input_tokens bigint,
  add column actual_total_tokens bigint,
  add column estimated_credits bigint,
  add column actual_credits bigint,
  add column estimated_cost_nano_usd bigint,
  add column actual_cost_nano_usd bigint,
  add column pricing_version text,
  add column credit_policy_version text;

-- A provider call can finish without returning trustworthy usage metadata
-- (for example after a timeout). Such reservations remain fail-closed until
-- the reconciliation job charges their conservative preflight estimate.
alter table public.ai_usage_reservations
  drop constraint ai_usage_reservations_outcome_check,
  add constraint ai_usage_reservations_outcome_check
    check (
      outcome in (
        'reserved', 'succeeded', 'provider_error', 'timeout', 'cancelled',
        'reconciled_estimate'
      )
    );

alter table public.ai_usage_reservations
  add constraint ai_usage_reservations_models_check
    check (
      (requested_model is null or char_length(btrim(requested_model)) between 1 and 120)
      and (actual_model is null or char_length(btrim(actual_model)) between 1 and 120)
    ),
  add constraint ai_usage_reservations_purpose_check
    check (purpose is null or purpose ~ '^[a-z][a-z0-9_]{1,63}$'),
  add constraint ai_usage_reservations_provider_response_id_check
    check (
      provider_response_id is null
      or char_length(btrim(provider_response_id)) between 3 and 255
    ),
  add constraint ai_usage_reservations_token_details_check
    check (
      (actual_cached_input_tokens is null or actual_cached_input_tokens >= 0)
      and (actual_total_tokens is null or actual_total_tokens >= 0)
      and (
        actual_cached_input_tokens is null
        or actual_input_tokens is null
        or actual_cached_input_tokens <= actual_input_tokens
      )
      and (
        actual_total_tokens is null
        or actual_input_tokens is null
        or actual_output_tokens is null
        or actual_total_tokens = actual_input_tokens + actual_output_tokens
      )
    ),
  add constraint ai_usage_reservations_credits_check
    check (
      (estimated_credits is null or estimated_credits >= 0)
      and (actual_credits is null or actual_credits >= 0)
    ),
  add constraint ai_usage_reservations_precise_cost_check
    check (
      (estimated_cost_nano_usd is null or estimated_cost_nano_usd >= 0)
      and (actual_cost_nano_usd is null or actual_cost_nano_usd >= 0)
    ),
  add constraint ai_usage_reservations_versions_check
    check (
      (pricing_version is null or char_length(btrim(pricing_version)) between 1 and 80)
      and (
        credit_policy_version is null
        or char_length(btrim(credit_policy_version)) between 1 and 80
      )
    ),
  add constraint ai_usage_reservations_credit_metadata_check
    check (
      (
        interaction_id is null
        and requested_model is null
        and purpose is null
        and estimated_credits is null
        and credit_policy_version is null
      )
      or (
        requested_model is not null
        and purpose is not null
        and estimated_credits is not null
        and credit_policy_version is not null
      )
    ),
  add constraint ai_usage_reservations_settled_details_check
    check (
      settled_at is null
      or user_id is null
      or (
        actual_cached_input_tokens is not null
        and actual_total_tokens is not null
        and actual_credits is not null
      )
    );

create index ai_usage_reservations_user_reserved_idx
  on public.ai_usage_reservations (user_id, reserved_at desc)
  where user_id is not null;
create index ai_usage_reservations_interaction_idx
  on public.ai_usage_reservations (interaction_id, reserved_at)
  where interaction_id is not null;
create index ai_usage_reservations_model_settled_idx
  on public.ai_usage_reservations (actual_model, settled_at desc)
  where settled_at is not null;
create index ai_usage_reservations_purpose_settled_idx
  on public.ai_usage_reservations (purpose, settled_at desc)
  where settled_at is not null;
create index ai_usage_reservations_open_reserved_idx
  on public.ai_usage_reservations (reserved_at, id)
  where settled_at is null and user_id is not null;
create index ai_usage_reservations_settled_id_idx
  on public.ai_usage_reservations (settled_at desc, id desc)
  where settled_at is not null;
create index ai_usage_reservations_user_settled_id_idx
  on public.ai_usage_reservations (user_id, settled_at desc, id desc)
  where settled_at is not null and user_id is not null;
create index user_ai_credit_accounts_kind_updated_idx
  on public.user_ai_credit_accounts (is_anonymous, updated_at desc);

create or replace function private.guard_settled_ai_usage_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Privacy unlinking is allowed for both settled and in-flight rows. A direct
  -- auth.admin.deleteUser() invokes ON DELETE SET NULL without calling the
  -- preparation RPC, so the FK update itself must remove HMAC/request links.
  if old.user_id is not null and new.user_id is null then
    if to_jsonb(new) - array['user_id']::text[]
         = to_jsonb(old) - array['user_id']::text[] then
      new.user_hash := 'deleted:' || replace(gen_random_uuid()::text, '-', '');
      new.ip_hash := 'deleted:' || replace(gen_random_uuid()::text, '-', '');
      new.request_key := 'deleted:' || replace(gen_random_uuid()::text, '-', '');
      new.interaction_id := null;
      new.provider_response_id := null;
      if old.settled_at is null then
        -- The regular deletion path reconciles buckets through
        -- prepare_user_deletion. For an unexpected direct auth deletion, keep
        -- the already-reserved conservative bucket values and close the
        -- orphaned ledger with the same estimates. Never turn a potentially
        -- completed provider call into zero usage during identity deletion.
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
         'user_id', 'user_hash', 'ip_hash', 'request_key',
         'interaction_id', 'provider_response_id'
       ]::text[]
         = to_jsonb(old) - array[
           'user_id', 'user_hash', 'ip_hash', 'request_key',
           'interaction_id', 'provider_response_id'
         ]::text[] then
      return new;
    end if;
  end if;

  if old.settled_at is not null and new is distinct from old then
    raise exception 'settled AI usage records are immutable'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger ai_usage_reservations_guard_settled_update
  before update on public.ai_usage_reservations
  for each row execute function private.guard_settled_ai_usage_update();

-- This is a view, not a second ledger. Security-invoker plus explicit grants
-- retain the underlying table's service-only access boundary.
create view public.ai_usage_events
with (security_invoker = true)
as
select
  id,
  user_id,
  interaction_id,
  request_key,
  provider_response_id,
  requested_model,
  actual_model,
  purpose,
  actual_input_tokens as input_tokens,
  actual_cached_input_tokens as cached_input_tokens,
  actual_output_tokens as output_tokens,
  actual_total_tokens as total_tokens,
  estimated_cost_nano_usd,
  actual_cost_nano_usd,
  actual_credits as credits_consumed,
  pricing_version,
  credit_policy_version,
  outcome,
  reserved_at,
  settled_at
from public.ai_usage_reservations
where settled_at is not null;

revoke all on public.ai_usage_events from public, anon, authenticated;
grant select on public.ai_usage_events to service_role;

-- Creates the account on first server-side access. The caller supplies the
-- guest/account allocation from environment configuration; SQL contains no
-- product allocation value. When an anonymous identity is upgraded in place,
-- its total becomes the account allocation rather than adding both grants.
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
security invoker
set search_path = ''
as $$
begin
  if p_user_id is null
     or p_is_anonymous is null
     or p_initial_credit_total is null
     or p_initial_credit_total < 0
     or not exists (
       select 1
       from auth.users u
       where u.id = p_user_id
         and coalesce(u.is_anonymous, false) = p_is_anonymous
     ) then
    raise exception 'invalid AI credit account input'
      using errcode = '22023';
  end if;

  insert into public.user_ai_credit_accounts (
    user_id, is_anonymous, credits_total
  ) values (
    p_user_id, p_is_anonymous, p_initial_credit_total
  )
  on conflict on constraint user_ai_credit_accounts_pkey do update
    set is_anonymous = excluded.is_anonymous,
        credits_total = case
          when public.user_ai_credit_accounts.is_anonymous
               and not excluded.is_anonymous
            then greatest(
              public.user_ai_credit_accounts.credits_used
                + public.user_ai_credit_accounts.credits_reserved,
              excluded.credits_total
            )
          else public.user_ai_credit_accounts.credits_total
        end;

  return query
  select
    a.user_id,
    a.is_anonymous,
    a.credits_total,
    a.credits_used,
    a.credits_reserved,
    greatest(a.credits_total - a.credits_used - a.credits_reserved, 0::bigint)
  from public.user_ai_credit_accounts a
  where a.user_id = p_user_id;
end;
$$;

-- Extended preflight. The legacy nine-argument overload remains intact for a
-- short rolling deployment window; all new provider calls use this overload.
create or replace function public.consume_ai_quota(
  p_request_key text,
  p_user_hash text,
  p_ip_hash text,
  p_is_anonymous boolean,
  p_request_limit integer,
  p_daily_token_limit bigint,
  p_monthly_budget_cents bigint,
  p_estimated_tokens bigint,
  p_estimated_cost_cents bigint,
  p_user_id uuid,
  p_interaction_id uuid,
  p_requested_model text,
  p_purpose text,
  p_estimated_credits bigint,
  p_initial_credit_total bigint,
  p_estimated_cost_nano_usd bigint,
  p_pricing_version text,
  p_credit_policy_version text
)
returns table (
  allowed boolean,
  reason text,
  retry_after timestamptz,
  reservation_id uuid,
  credits_total bigint,
  credits_used bigint,
  credits_reserved bigint,
  credits_remaining bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quota record;
  v_existing public.ai_usage_reservations%rowtype;
  v_account public.user_ai_credit_accounts%rowtype;
begin
  if p_user_id is null
     or p_interaction_id is null
     or p_requested_model is null
     or char_length(btrim(p_requested_model)) not between 1 and 120
     or p_purpose is null
     or p_purpose !~ '^[a-z][a-z0-9_]{1,63}$'
     or p_estimated_credits is null or p_estimated_credits < 0
     or p_initial_credit_total is null or p_initial_credit_total < 0
     or (p_estimated_cost_nano_usd is not null and p_estimated_cost_nano_usd < 0)
     or (
       p_pricing_version is not null
       and char_length(btrim(p_pricing_version)) not between 1 and 80
     )
     or p_credit_policy_version is null
     or char_length(btrim(p_credit_policy_version)) not between 1 and 80
     or p_is_anonymous is null
     or not exists (
       select 1
       from auth.users u
       where u.id = p_user_id
         and coalesce(u.is_anonymous, false) = p_is_anonymous
     ) then
    allowed := false;
    reason := 'invalid_input';
    retry_after := null;
    reservation_id := null;
    credits_total := null;
    credits_used := null;
    credits_reserved := null;
    credits_remaining := null;
    return next;
    return;
  end if;

  select r.* into v_existing
  from public.ai_usage_reservations r
  where r.request_key = p_request_key;

  if found then
    if v_existing.user_id is distinct from p_user_id
       or v_existing.user_hash is distinct from p_user_hash
       or v_existing.is_anonymous is distinct from p_is_anonymous
       or v_existing.interaction_id is distinct from p_interaction_id
       or v_existing.requested_model is distinct from btrim(p_requested_model)
       or v_existing.purpose is distinct from p_purpose
       or v_existing.estimated_tokens is distinct from p_estimated_tokens
       or v_existing.estimated_cost_cents is distinct from p_estimated_cost_cents
       or v_existing.estimated_credits is distinct from p_estimated_credits
       or v_existing.estimated_cost_nano_usd is distinct from p_estimated_cost_nano_usd
       or v_existing.pricing_version is distinct from nullif(btrim(p_pricing_version), '')
       or v_existing.credit_policy_version is distinct from btrim(p_credit_policy_version) then
      allowed := false;
      reason := 'request_key_conflict';
      retry_after := null;
      reservation_id := null;
      credits_total := null;
      credits_used := null;
      credits_reserved := null;
      credits_remaining := null;
      return next;
      return;
    end if;

    select a.* into v_account
    from public.user_ai_credit_accounts a
    where a.user_id = v_existing.user_id;

    allowed := false;
    reason := 'already_reserved';
    retry_after := null;
    reservation_id := v_existing.id;
    credits_total := v_account.credits_total;
    credits_used := v_account.credits_used;
    credits_reserved := v_account.credits_reserved;
    credits_remaining := greatest(
      v_account.credits_total - v_account.credits_used - v_account.credits_reserved,
      0::bigint
    );
    return next;
    return;
  end if;

  perform *
  from public.get_ai_credit_snapshot(
    p_user_id, p_is_anonymous, p_initial_credit_total
  );

  -- The conditional update is the concurrency boundary: PostgreSQL serializes
  -- updates to this account row and rechecks the predicate after every wait.
  update public.user_ai_credit_accounts a
    set credits_reserved = a.credits_reserved + p_estimated_credits
    where a.user_id = p_user_id
      and a.credits_total - a.credits_used - a.credits_reserved
          >= p_estimated_credits
  returning a.* into v_account;

  if not found then
    select a.* into v_account
    from public.user_ai_credit_accounts a
    where a.user_id = p_user_id;

    allowed := false;
    reason := 'insufficient_credits';
    retry_after := null;
    reservation_id := null;
    credits_total := v_account.credits_total;
    credits_used := v_account.credits_used;
    credits_reserved := v_account.credits_reserved;
    credits_remaining := greatest(
      v_account.credits_total - v_account.credits_used - v_account.credits_reserved,
      0::bigint
    );
    return next;
    return;
  end if;

  select q.* into v_quota
  from public.consume_ai_quota(
    p_request_key,
    p_user_hash,
    p_ip_hash,
    p_is_anonymous,
    p_request_limit,
    p_daily_token_limit,
    p_monthly_budget_cents,
    p_estimated_tokens,
    p_estimated_cost_cents
  ) q;

  if not v_quota.allowed then
    update public.user_ai_credit_accounts a
      set credits_reserved = greatest(
        a.credits_reserved - p_estimated_credits,
        0::bigint
      )
      where a.user_id = p_user_id
    returning a.* into v_account;

    if v_quota.reason = 'already_reserved' then
      select r.* into v_existing
      from public.ai_usage_reservations r
      where r.request_key = p_request_key;

      if not found
         or v_existing.user_id is distinct from p_user_id
         or v_existing.user_hash is distinct from p_user_hash
         or v_existing.is_anonymous is distinct from p_is_anonymous
         or v_existing.interaction_id is distinct from p_interaction_id
         or v_existing.requested_model is distinct from btrim(p_requested_model)
         or v_existing.purpose is distinct from p_purpose
         or v_existing.estimated_tokens is distinct from p_estimated_tokens
         or v_existing.estimated_cost_cents is distinct from p_estimated_cost_cents
         or v_existing.estimated_credits is distinct from p_estimated_credits
         or v_existing.estimated_cost_nano_usd is distinct from p_estimated_cost_nano_usd
         or v_existing.pricing_version is distinct from nullif(btrim(p_pricing_version), '')
         or v_existing.credit_policy_version is distinct from btrim(p_credit_policy_version) then
        allowed := false;
        reason := 'request_key_conflict';
        retry_after := null;
        reservation_id := null;
        credits_total := null;
        credits_used := null;
        credits_reserved := null;
        credits_remaining := null;
        return next;
        return;
      end if;
    end if;

    allowed := false;
    reason := v_quota.reason;
    retry_after := v_quota.retry_after;
    reservation_id := v_quota.reservation_id;
    credits_total := v_account.credits_total;
    credits_used := v_account.credits_used;
    credits_reserved := v_account.credits_reserved;
    credits_remaining := greatest(
      v_account.credits_total - v_account.credits_used - v_account.credits_reserved,
      0::bigint
    );
    return next;
    return;
  end if;

  update public.ai_usage_reservations r
    set user_id = p_user_id,
        interaction_id = p_interaction_id,
        requested_model = btrim(p_requested_model),
        purpose = p_purpose,
        estimated_credits = p_estimated_credits,
        estimated_cost_nano_usd = p_estimated_cost_nano_usd,
        pricing_version = nullif(btrim(p_pricing_version), ''),
        credit_policy_version = btrim(p_credit_policy_version)
    where r.id = v_quota.reservation_id;

  select a.* into v_account
  from public.user_ai_credit_accounts a
  where a.user_id = p_user_id;

  allowed := true;
  reason := 'reserved';
  retry_after := null;
  reservation_id := v_quota.reservation_id;
  credits_total := v_account.credits_total;
  credits_used := v_account.credits_used;
  credits_reserved := v_account.credits_reserved;
  credits_remaining := greatest(
    v_account.credits_total - v_account.credits_used - v_account.credits_reserved,
    0::bigint
  );
  return next;
end;
$$;

-- Extended settlement records provider usage and reconciles both quota buckets
-- and XPORTAL credits. A null actual cost means the model price was unknown;
-- the conservative preflight estimate remains in the provider budget bucket.
create or replace function public.record_ai_usage(
  p_request_key text,
  p_actual_input_tokens bigint,
  p_actual_cached_input_tokens bigint,
  p_actual_output_tokens bigint,
  p_actual_total_tokens bigint,
  p_actual_cost_cents bigint,
  p_actual_cost_nano_usd bigint,
  p_actual_credits bigint,
  p_outcome text,
  p_actual_model text,
  p_provider_response_id text,
  p_pricing_version text,
  p_credit_policy_version text
)
returns table (
  recorded boolean,
  reason text,
  credits_total bigint,
  credits_used bigint,
  credits_reserved bigint,
  credits_remaining bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reservation public.ai_usage_reservations%rowtype;
  v_account public.user_ai_credit_accounts%rowtype;
  v_provider_hash constant text := 'provider:openai';
  v_effective_cost_cents bigint;
begin
  if p_request_key is null
     or char_length(btrim(p_request_key)) not between 8 and 160
     or p_actual_input_tokens is null or p_actual_input_tokens < 0
     or p_actual_cached_input_tokens is null or p_actual_cached_input_tokens < 0
     or p_actual_cached_input_tokens > p_actual_input_tokens
     or p_actual_output_tokens is null or p_actual_output_tokens < 0
     or p_actual_total_tokens is null or p_actual_total_tokens < 0
     or p_actual_total_tokens <> p_actual_input_tokens + p_actual_output_tokens
     or (p_actual_cost_cents is not null and p_actual_cost_cents < 0)
     or (p_actual_cost_nano_usd is not null and p_actual_cost_nano_usd < 0)
     or p_actual_credits is null or p_actual_credits < 0
     or p_outcome is null
     or p_outcome not in (
       'succeeded', 'provider_error', 'timeout', 'cancelled',
       'reconciled_estimate'
     )
     or (p_actual_model is not null and char_length(btrim(p_actual_model)) not between 1 and 120)
     or (
       p_provider_response_id is not null
       and char_length(btrim(p_provider_response_id)) not between 3 and 255
     )
     or (
       p_pricing_version is not null
       and char_length(btrim(p_pricing_version)) not between 1 and 80
     )
     or p_credit_policy_version is null
     or char_length(btrim(p_credit_policy_version)) not between 1 and 80 then
    recorded := false;
    reason := 'invalid_input';
    credits_total := null;
    credits_used := null;
    credits_reserved := null;
    credits_remaining := null;
    return next;
    return;
  end if;

  select r.* into v_reservation
  from public.ai_usage_reservations r
  where r.request_key = p_request_key;

  if not found or v_reservation.user_id is null then
    recorded := false;
    reason := 'unknown_request';
    credits_total := null;
    credits_used := null;
    credits_reserved := null;
    credits_remaining := null;
    return next;
    return;
  end if;

  -- Credit-account lock first keeps reservation and settlement lock ordering
  -- consistent with concurrent preflights for the same identity.
  select a.* into v_account
  from public.user_ai_credit_accounts a
  where a.user_id = v_reservation.user_id
  for update;

  if not found then
    recorded := false;
    reason := 'credit_account_missing';
    credits_total := null;
    credits_used := null;
    credits_reserved := null;
    credits_remaining := null;
    return next;
    return;
  end if;

  select r.* into v_reservation
  from public.ai_usage_reservations r
  where r.request_key = p_request_key
  for update;

  if v_reservation.settled_at is not null then
    recorded := true;
    reason := 'already_recorded';
    credits_total := v_account.credits_total;
    credits_used := v_account.credits_used;
    credits_reserved := v_account.credits_reserved;
    credits_remaining := greatest(
      v_account.credits_total - v_account.credits_used - v_account.credits_reserved,
      0::bigint
    );
    return next;
    return;
  end if;

  if p_credit_policy_version <> v_reservation.credit_policy_version then
    recorded := false;
    reason := 'credit_policy_version_mismatch';
    credits_total := v_account.credits_total;
    credits_used := v_account.credits_used;
    credits_reserved := v_account.credits_reserved;
    credits_remaining := greatest(
      v_account.credits_total - v_account.credits_used - v_account.credits_reserved,
      0::bigint
    );
    return next;
    return;
  end if;

  perform b.id
  from public.ai_usage_buckets b
  where (b.subject_type = 'user' and b.subject_hash = v_reservation.user_hash
         and b.bucket_kind = 'day' and b.bucket_start = v_reservation.day_bucket_start)
     or (v_reservation.is_anonymous and b.subject_type = 'ip'
         and b.subject_hash = v_reservation.ip_hash
         and b.bucket_kind = 'day' and b.bucket_start = v_reservation.day_bucket_start)
     or (b.subject_type = 'provider' and b.subject_hash = v_provider_hash
         and b.bucket_kind = 'month' and b.bucket_start = v_reservation.month_bucket_start)
  order by b.subject_type, b.subject_hash, b.bucket_kind, b.bucket_start
  for update;

  v_effective_cost_cents := coalesce(
    p_actual_cost_cents,
    v_reservation.estimated_cost_cents
  );

  update public.ai_usage_buckets b
    set input_tokens = greatest(b.input_tokens - v_reservation.estimated_tokens, 0::bigint)
                       + p_actual_input_tokens,
        output_tokens = b.output_tokens + p_actual_output_tokens,
        estimated_cost_cents = greatest(
          b.estimated_cost_cents - v_reservation.estimated_cost_cents,
          0::bigint
        ) + v_effective_cost_cents
    where b.subject_type = 'user'
      and b.subject_hash = v_reservation.user_hash
      and b.bucket_kind = 'day'
      and b.bucket_start = v_reservation.day_bucket_start;

  if v_reservation.is_anonymous then
    update public.ai_usage_buckets b
      set input_tokens = greatest(b.input_tokens - v_reservation.estimated_tokens, 0::bigint)
                         + p_actual_input_tokens,
          output_tokens = b.output_tokens + p_actual_output_tokens,
          estimated_cost_cents = greatest(
            b.estimated_cost_cents - v_reservation.estimated_cost_cents,
            0::bigint
          ) + v_effective_cost_cents
      where b.subject_type = 'ip'
        and b.subject_hash = v_reservation.ip_hash
        and b.bucket_kind = 'day'
        and b.bucket_start = v_reservation.day_bucket_start;
  end if;

  update public.ai_usage_buckets b
    set input_tokens = greatest(b.input_tokens - v_reservation.estimated_tokens, 0::bigint)
                       + p_actual_input_tokens,
        output_tokens = b.output_tokens + p_actual_output_tokens,
        estimated_cost_cents = greatest(
          b.estimated_cost_cents - v_reservation.estimated_cost_cents,
          0::bigint
        ) + v_effective_cost_cents
    where b.subject_type = 'provider'
      and b.subject_hash = v_provider_hash
      and b.bucket_kind = 'month'
      and b.bucket_start = v_reservation.month_bucket_start;

  update public.user_ai_credit_accounts a
    set credits_reserved = greatest(
          a.credits_reserved - v_reservation.estimated_credits,
          0::bigint
        ),
        credits_used = a.credits_used + p_actual_credits
    where a.user_id = v_reservation.user_id
  returning a.* into v_account;

  update public.ai_usage_reservations r
    set actual_input_tokens = p_actual_input_tokens,
        actual_cached_input_tokens = p_actual_cached_input_tokens,
        actual_output_tokens = p_actual_output_tokens,
        actual_total_tokens = p_actual_total_tokens,
        actual_cost_cents = p_actual_cost_cents,
        actual_cost_nano_usd = p_actual_cost_nano_usd,
        actual_credits = p_actual_credits,
        actual_model = nullif(btrim(p_actual_model), ''),
        provider_response_id = nullif(btrim(p_provider_response_id), ''),
        pricing_version = nullif(btrim(p_pricing_version), ''),
        credit_policy_version = btrim(p_credit_policy_version),
        outcome = p_outcome,
        settled_at = now()
    where r.id = v_reservation.id;

  recorded := true;
  reason := 'recorded';
  credits_total := v_account.credits_total;
  credits_used := v_account.credits_used;
  credits_reserved := v_account.credits_reserved;
  credits_remaining := greatest(
    v_account.credits_total - v_account.credits_used - v_account.credits_reserved,
    0::bigint
  );
  return next;
end;
$$;

-- Fail-closed recovery for provider calls whose final usage metadata never
-- reached the application. The estimate was already reserved in every quota
-- bucket, so settling with that exact estimate preserves the budget boundary
-- while moving held credits into used credits. Concurrent runs are safe:
-- record_ai_usage locks and settles each ledger row idempotently.
create or replace function public.reconcile_stale_ai_usage(
  p_older_than interval default interval '15 minutes',
  p_limit integer default 500
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usage record;
  v_settlement record;
  v_reconciled integer := 0;
begin
  if p_older_than is null
     or p_older_than < interval '2 minutes'
     or p_older_than > interval '1 day'
     or p_limit is null
     or p_limit < 1
     or p_limit > 5000 then
    raise exception 'invalid stale AI usage reconciliation input'
      using errcode = '22023';
  end if;

  for v_usage in
    select
      r.request_key,
      r.estimated_tokens,
      r.estimated_cost_cents,
      r.estimated_cost_nano_usd,
      r.estimated_credits,
      r.pricing_version,
      r.credit_policy_version
    from public.ai_usage_reservations r
    where r.settled_at is null
      and r.user_id is not null
      and r.reserved_at < now() - p_older_than
      and r.estimated_credits is not null
      and r.credit_policy_version is not null
    order by r.reserved_at, r.id
    limit p_limit
  loop
    select s.* into v_settlement
    from public.record_ai_usage(
      v_usage.request_key,
      v_usage.estimated_tokens,
      0,
      0,
      v_usage.estimated_tokens,
      v_usage.estimated_cost_cents,
      v_usage.estimated_cost_nano_usd,
      v_usage.estimated_credits,
      'reconciled_estimate',
      null,
      null,
      v_usage.pricing_version,
      v_usage.credit_policy_version
    ) s;

    if coalesce(v_settlement.recorded, false)
       and v_settlement.reason = 'recorded' then
      v_reconciled := v_reconciled + 1;
    end if;
  end loop;

  if v_reconciled > 0 then
    insert into public.audit_events (
      actor_tombstone,
      action,
      target_type,
      outcome,
      metadata
    ) values (
      'system:ai-usage-reconciliation',
      'ai_usage_stale_reconciled',
      'ai_usage_reservations',
      'success',
      jsonb_build_object(
        'reconciled_count', v_reconciled,
        'older_than_seconds', extract(epoch from p_older_than)::bigint
      )
    );
  end if;

  return v_reconciled;
end;
$$;

-- Extend the existing deletion preparation so the service route can export
-- first, then sever every direct or derived AI-usage association before it
-- deletes auth.users. Aggregate provider/IP buckets remain non-identifying.
create or replace function public.prepare_user_deletion(p_user_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tombstone text;
  v_usage record;
  v_settlement record;
  v_user_hashes text[];
begin
  if p_user_id is null then
    raise exception 'user id is required'
      using errcode = '22023';
  end if;

  v_tombstone := 'deleted:' || replace(gen_random_uuid()::text, '-', '');

  perform a.user_id
  from public.user_ai_credit_accounts a
  where a.user_id = p_user_id
  for update;

  -- Conservatively settle every outstanding provider reservation before
  -- unlinking the identity. The provider may have completed even when its
  -- response never reached the app, so deletion must not rewrite that work as
  -- free. A concurrent settlement serializes on the credit account and
  -- reservation row; its second attempt is idempotent.
  for v_usage in
    select
      r.request_key,
      r.estimated_tokens,
      r.estimated_cost_cents,
      r.estimated_cost_nano_usd,
      r.estimated_credits,
      r.pricing_version,
      r.credit_policy_version
    from public.ai_usage_reservations r
    where r.user_id = p_user_id
      and r.settled_at is null
    order by r.reserved_at, r.id
  loop
    select s.* into v_settlement
    from public.record_ai_usage(
      v_usage.request_key,
      v_usage.estimated_tokens,
      0,
      0,
      v_usage.estimated_tokens,
      v_usage.estimated_cost_cents,
      v_usage.estimated_cost_nano_usd,
      v_usage.estimated_credits,
      'reconciled_estimate',
      null,
      null,
      v_usage.pricing_version,
      v_usage.credit_policy_version
    ) s;

    if not coalesce(v_settlement.recorded, false) then
      raise exception 'failed to reconcile AI reservation during deletion: %',
        coalesce(v_settlement.reason, 'unknown')
        using errcode = '55000';
    end if;
  end loop;

  update public.user_ai_credit_accounts a
    set credits_total = a.credits_used,
        credits_reserved = 0
    where a.user_id = p_user_id;

  select array_agg(distinct r.user_hash) into v_user_hashes
  from public.ai_usage_reservations r
  where r.user_id = p_user_id;

  update public.ai_usage_reservations r
    set user_id = null,
        user_hash = 'deleted:' || replace(gen_random_uuid()::text, '-', ''),
        ip_hash = 'deleted:' || replace(gen_random_uuid()::text, '-', ''),
        request_key = 'deleted:' || replace(gen_random_uuid()::text, '-', ''),
        interaction_id = null,
        provider_response_id = null
    where r.user_id = p_user_id;

  if v_user_hashes is not null then
    delete from public.ai_usage_buckets b
    where b.subject_type = 'user'
      and b.subject_hash = any(v_user_hashes);
  end if;

  update public.audit_events
    set actor_user_id = null,
        actor_tombstone = coalesce(actor_tombstone, v_tombstone)
    where actor_user_id = p_user_id;

  insert into public.audit_events (
    actor_user_id,
    actor_tombstone,
    action,
    target_type,
    target_id,
    outcome,
    metadata
  ) values (
    null,
    v_tombstone,
    'user_deletion_prepared',
    'user',
    null,
    'success',
    '{}'::jsonb
  );

  return v_tombstone;
end;
$$;

revoke all on function public.get_ai_credit_snapshot(uuid, boolean, bigint)
  from public, anon, authenticated;
revoke all on function public.consume_ai_quota(
  text, text, text, boolean, integer, bigint, bigint, bigint, bigint,
  uuid, uuid, text, text, bigint, bigint, bigint, text, text
) from public, anon, authenticated;
revoke all on function public.record_ai_usage(
  text, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
  text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.reconcile_stale_ai_usage(interval, integer)
  from public, anon, authenticated;

grant execute on function public.get_ai_credit_snapshot(uuid, boolean, bigint)
  to service_role;
grant execute on function public.consume_ai_quota(
  text, text, text, boolean, integer, bigint, bigint, bigint, bigint,
  uuid, uuid, text, text, bigint, bigint, bigint, text, text
) to service_role;
grant execute on function public.record_ai_usage(
  text, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
  text, text, text, text, text
) to service_role;
grant execute on function public.reconcile_stale_ai_usage(interval, integer)
  to service_role;

-- Reconcile abandoned reservations promptly enough to release held credits
-- without guessing that a timed-out provider call was free. Re-applying a
-- repaired migration cannot create duplicate jobs.
create extension if not exists pg_cron;
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'xportal-ai-usage-reconcile'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;
select cron.schedule(
  'xportal-ai-usage-reconcile',
  '*/5 * * * *',
  'select public.reconcile_stale_ai_usage(interval ''15 minutes'', 500);'
);

commit;
