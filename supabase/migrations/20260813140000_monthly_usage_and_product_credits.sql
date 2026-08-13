-- Separate the free monthly Nano-analysis allowance from purchased product
-- credits. The existing user_ai_credit_accounts table remains untouched as a
-- historical provider/token-control ledger and is deliberately not converted.

begin;

create table public.ai_free_usage_accounts (
  user_id uuid not null references auth.users (id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  is_anonymous boolean not null,
  usage_limit integer not null,
  used integer not null default 0,
  reserved integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start),
  constraint ai_free_usage_accounts_period_check
    check (period_end = period_start + interval '1 month'),
  constraint ai_free_usage_accounts_limit_check
    check (usage_limit in (10, 100)),
  constraint ai_free_usage_accounts_counts_check
    check (
      used >= 0
      and reserved >= 0
      and used + reserved <= usage_limit
    )
);

create table public.ai_free_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  period_start timestamptz not null,
  request_key text not null unique,
  status text not null default 'reserved',
  result_outcome text,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  foreign key (user_id, period_start)
    references public.ai_free_usage_accounts (user_id, period_start)
    on delete cascade,
  constraint ai_free_usage_reservations_request_key_check
    check (char_length(btrim(request_key)) between 8 and 200),
  constraint ai_free_usage_reservations_status_check
    check (status in ('reserved', 'consumed', 'released')),
  constraint ai_free_usage_reservations_outcome_check
    check (
      result_outcome is null
      or result_outcome in (
        'succeeded', 'provider_error', 'timeout', 'invalid_response',
        'cancelled', 'expired'
      )
    ),
  constraint ai_free_usage_reservations_state_check
    check (
      (status = 'reserved' and result_outcome is null and settled_at is null)
      or (
        status = 'consumed'
        and result_outcome = 'succeeded'
        and settled_at is not null
      )
      or (
        status = 'released'
        and result_outcome in (
          'provider_error', 'timeout', 'invalid_response', 'cancelled', 'expired'
        )
        and settled_at is not null
      )
    )
);

create table public.product_credit_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance bigint not null default 0,
  reserved bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_credit_accounts_amounts_check
    check (balance >= 0 and reserved >= 0 and reserved <= balance)
);

create table public.product_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.product_credit_accounts (user_id)
    on delete cascade,
  request_key text not null unique,
  purpose text not null,
  amount bigint not null,
  status text not null default 'reserved',
  result_outcome text,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint product_credit_reservations_request_key_check
    check (char_length(btrim(request_key)) between 8 and 200),
  constraint product_credit_reservations_purpose_check
    check (
      char_length(purpose) between 3 and 64
      and purpose ~ '^[a-z][a-z0-9_]*$'
    ),
  constraint product_credit_reservations_amount_check check (amount > 0),
  constraint product_credit_reservations_external_search_price_check
    check (purpose <> 'external_freelancer_search' or amount = 30),
  constraint product_credit_reservations_status_check
    check (status in ('reserved', 'charged', 'released')),
  constraint product_credit_reservations_outcome_check
    check (
      result_outcome is null
      or result_outcome in (
        'completed', 'completed_no_result', 'technical_error', 'timeout',
        'invalid_response', 'cancelled', 'expired'
      )
    ),
  constraint product_credit_reservations_state_check
    check (
      (status = 'reserved' and result_outcome is null and settled_at is null)
      or (
        status = 'charged'
        and result_outcome in ('completed', 'completed_no_result')
        and settled_at is not null
      )
      or (
        status = 'released'
        and result_outcome in (
          'technical_error', 'timeout', 'invalid_response', 'cancelled', 'expired'
        )
        and settled_at is not null
      )
    )
);

create table public.product_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users (id) on delete set null,
  idempotency_key text not null unique,
  entry_type text not null,
  amount_delta bigint not null,
  balance_after bigint not null,
  reservation_id uuid references public.product_credit_reservations (id)
    on delete set null,
  reason text not null,
  actor_reference text not null,
  created_at timestamptz not null default now(),
  constraint product_credit_ledger_key_check
    check (char_length(btrim(idempotency_key)) between 8 and 255),
  constraint product_credit_ledger_type_check
    check (entry_type in ('grant', 'debit', 'refund')),
  constraint product_credit_ledger_amount_check
    check (
      amount_delta <> 0
      and balance_after >= 0
      and (
        (entry_type in ('grant', 'refund') and amount_delta > 0)
        or (entry_type = 'debit' and amount_delta < 0)
      )
    ),
  constraint product_credit_ledger_reason_check
    check (char_length(btrim(reason)) between 3 and 200),
  constraint product_credit_ledger_actor_check
    check (char_length(btrim(actor_reference)) between 3 and 200)
);

-- Paid external-search results must survive a lost HTTP response. This is a
-- bounded, user-owned snapshot (never a new freelancer-profile catalogue) so
-- an idempotent retry can return the already-paid result without another
-- provider call or debit.
create table public.external_freelancer_search_results (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  request_key text not null unique,
  credit_reservation_id uuid not null unique
    references public.product_credit_reservations (id) on delete cascade,
  result_count integer not null,
  result_snapshot jsonb not null,
  provider_response_id text,
  actual_model text,
  created_at timestamptz not null default now(),
  constraint external_search_results_request_key_check
    check (char_length(btrim(request_key)) between 8 and 200),
  constraint external_search_results_count_check
    check (result_count between 0 and 3),
  constraint external_search_results_snapshot_check
    check (
      jsonb_typeof(result_snapshot) = 'array'
      and jsonb_array_length(result_snapshot) = result_count
      and octet_length(result_snapshot::text) <= 65536
    ),
  constraint external_search_results_response_check
    check (
      provider_response_id is null
      or char_length(btrim(provider_response_id)) between 3 and 255
    ),
  constraint external_search_results_model_check
    check (
      actual_model is null
      or char_length(btrim(actual_model)) between 1 and 120
    )
);

create index ai_free_usage_accounts_user_period_idx
  on public.ai_free_usage_accounts (user_id, period_start desc);
create index ai_free_usage_reservations_open_idx
  on public.ai_free_usage_reservations (user_id, expires_at)
  where status = 'reserved';
create index product_credit_reservations_open_idx
  on public.product_credit_reservations (user_id, expires_at)
  where status = 'reserved';
create index product_credit_ledger_owner_created_idx
  on public.product_credit_ledger (owner_user_id, created_at desc)
  where owner_user_id is not null;
create index external_search_results_owner_project_created_idx
  on public.external_freelancer_search_results (
    owner_user_id, project_id, created_at desc
  );

alter table public.ai_free_usage_accounts enable row level security;
alter table public.ai_free_usage_accounts force row level security;
alter table public.ai_free_usage_reservations enable row level security;
alter table public.ai_free_usage_reservations force row level security;
alter table public.product_credit_accounts enable row level security;
alter table public.product_credit_accounts force row level security;
alter table public.product_credit_reservations enable row level security;
alter table public.product_credit_reservations force row level security;
alter table public.product_credit_ledger enable row level security;
alter table public.product_credit_ledger force row level security;
alter table public.external_freelancer_search_results enable row level security;
alter table public.external_freelancer_search_results force row level security;

-- Ownership policies are defense in depth if browser read grants are added in
-- a later version. V1 deliberately grants no browser table access.
create policy ai_free_usage_accounts_owner_select
  on public.ai_free_usage_accounts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy ai_free_usage_reservations_owner_select
  on public.ai_free_usage_reservations for select to authenticated
  using ((select auth.uid()) = user_id);
create policy product_credit_accounts_owner_select
  on public.product_credit_accounts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy product_credit_reservations_owner_select
  on public.product_credit_reservations for select to authenticated
  using ((select auth.uid()) = user_id);
create policy product_credit_ledger_owner_select
  on public.product_credit_ledger for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy external_search_results_owner_select
  on public.external_freelancer_search_results for select to authenticated
  using ((select auth.uid()) = owner_user_id);

revoke all on public.ai_free_usage_accounts from public, anon, authenticated;
revoke all on public.ai_free_usage_reservations from public, anon, authenticated;
revoke all on public.product_credit_accounts from public, anon, authenticated;
revoke all on public.product_credit_reservations from public, anon, authenticated;
revoke all on public.product_credit_ledger from public, anon, authenticated;
revoke all on public.external_freelancer_search_results
  from public, anon, authenticated;

-- Server code reads these tables for operations/observability, but every
-- mutation must pass through the audited SECURITY DEFINER RPCs below.
grant select on public.ai_free_usage_accounts to service_role;
grant select on public.ai_free_usage_reservations to service_role;
grant select on public.product_credit_accounts to service_role;
grant select on public.product_credit_reservations to service_role;
grant select on public.product_credit_ledger to service_role;
grant select on public.external_freelancer_search_results to service_role;

create trigger ai_free_usage_accounts_set_updated_at
  before update on public.ai_free_usage_accounts
  for each row execute function private.set_updated_at();
create trigger product_credit_accounts_set_updated_at
  before update on public.product_credit_accounts
  for each row execute function private.set_updated_at();

create or replace function private.guard_product_credit_ledger_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (
       new.owner_user_id is not distinct from old.owner_user_id
       or (old.owner_user_id is not null and new.owner_user_id is null)
     )
     and (
       new.reservation_id is not distinct from old.reservation_id
       or (old.reservation_id is not null and new.reservation_id is null)
     )
     and (
       new.owner_user_id is distinct from old.owner_user_id
       or new.reservation_id is distinct from old.reservation_id
     )
     and to_jsonb(new) - array['owner_user_id', 'reservation_id']::text[]
         = to_jsonb(old) - array['owner_user_id', 'reservation_id']::text[] then
    -- Permit only FK privacy unlinking during identity/reservation deletion.
    -- Amounts, reasons, actors and balances remain immutable.
    return new;
  end if;

  raise exception 'product credit ledger is append-only'
    using errcode = '55000';
end;
$$;

create trigger product_credit_ledger_guard_mutation
  before update or delete on public.product_credit_ledger
  for each row execute function private.guard_product_credit_ledger_mutation();

create or replace function private.release_stale_ai_free_usage(p_user_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  with released as (
    update public.ai_free_usage_reservations r
       set status = 'released',
           result_outcome = 'expired',
           settled_at = now()
     where r.user_id = p_user_id
       and r.status = 'reserved'
       and r.expires_at <= now()
    returning r.user_id, r.period_start
  ), totals as (
    select x.user_id, x.period_start, count(*)::integer as released_count
      from released x
     group by x.user_id, x.period_start
  ), updated as (
    update public.ai_free_usage_accounts a
       set reserved = greatest(a.reserved - t.released_count, 0)
      from totals t
     where a.user_id = t.user_id
       and a.period_start = t.period_start
    returning t.released_count
  )
  select coalesce(sum(u.released_count), 0)::integer
    into v_count
    from updated u;

  return v_count;
end;
$$;

create or replace function private.release_stale_product_credits(p_user_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_amount bigint := 0;
  v_count integer := 0;
begin
  with released as (
    update public.product_credit_reservations r
       set status = 'released',
           result_outcome = 'expired',
           settled_at = now()
     where r.user_id = p_user_id
       and r.status = 'reserved'
       and r.expires_at <= now()
    returning r.amount
  )
  select coalesce(sum(x.amount), 0), count(*)::integer
    into v_amount, v_count
    from released x;

  if v_amount > 0 then
    update public.product_credit_accounts a
       set reserved = greatest(a.reserved - v_amount, 0)
     where a.user_id = p_user_id;
  end if;

  return v_count;
end;
$$;

create or replace function public.get_monthly_ai_usage_snapshot(
  p_user_id uuid,
  p_is_anonymous boolean
)
returns table (
  user_id uuid,
  is_anonymous boolean,
  period_start timestamptz,
  period_end timestamptz,
  usage_limit integer,
  used integer,
  reserved integer,
  remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period_start timestamptz :=
    date_trunc('month', pg_catalog.timezone('UTC', now())) at time zone 'UTC';
  v_is_anonymous boolean;
  v_limit integer;
begin
  select coalesce(u.is_anonymous, false)
    into v_is_anonymous
    from auth.users u
   where u.id = p_user_id;

  if not found
     or p_is_anonymous is null
     or v_is_anonymous is distinct from p_is_anonymous then
    raise exception 'invalid AI free-usage identity'
      using errcode = '22023';
  end if;

  v_limit := case when v_is_anonymous then 10 else 100 end;

  perform private.release_stale_ai_free_usage(p_user_id);

  insert into public.ai_free_usage_accounts (
    user_id, period_start, period_end, is_anonymous, usage_limit
  ) values (
    p_user_id, v_period_start, v_period_start + interval '1 month',
    v_is_anonymous, v_limit
  )
  on conflict on constraint ai_free_usage_accounts_pkey do update
    set is_anonymous = excluded.is_anonymous,
        usage_limit = excluded.usage_limit;

  return query
  select
    a.user_id,
    a.is_anonymous,
    a.period_start,
    a.period_end,
    a.usage_limit,
    a.used,
    a.reserved,
    greatest(a.usage_limit - a.used - a.reserved, 0)
  from public.ai_free_usage_accounts a
  where a.user_id = p_user_id
    and a.period_start = v_period_start;
end;
$$;

create or replace function public.reserve_monthly_ai_usage(
  p_user_id uuid,
  p_is_anonymous boolean,
  p_request_key text
)
returns table (
  allowed boolean,
  reason text,
  reservation_id uuid,
  period_start timestamptz,
  period_end timestamptz,
  usage_limit integer,
  used integer,
  reserved integer,
  remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.ai_free_usage_accounts%rowtype;
  v_existing public.ai_free_usage_reservations%rowtype;
  v_period_start timestamptz :=
    date_trunc('month', pg_catalog.timezone('UTC', now())) at time zone 'UTC';
  v_reservation_id uuid;
begin
  if p_request_key is null
     or char_length(btrim(p_request_key)) not between 8 and 200 then
    allowed := false;
    reason := 'invalid_input';
    reservation_id := null;
    return next;
    return;
  end if;

  -- Serializes both exact replays and the extremely unlikely cross-user key
  -- collision before any account balance is touched.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(btrim(p_request_key), 410413)
  );

  perform * from public.get_monthly_ai_usage_snapshot(
    p_user_id, p_is_anonymous
  );

  select r.* into v_existing
    from public.ai_free_usage_reservations r
   where r.request_key = btrim(p_request_key)
   for update;

  if found then
    select a.* into v_account
      from public.ai_free_usage_accounts a
     where a.user_id = p_user_id
       and a.period_start = v_period_start;

    allowed := false;
    reason := case
      when v_existing.user_id is distinct from p_user_id then 'request_key_conflict'
      when v_existing.status = 'reserved' then 'already_reserved'
      when v_existing.status = 'consumed' then 'already_consumed'
      else 'already_released'
    end;
    reservation_id := case
      when v_existing.user_id = p_user_id then v_existing.id else null
    end;
    period_start := v_account.period_start;
    period_end := v_account.period_end;
    usage_limit := v_account.usage_limit;
    used := v_account.used;
    reserved := v_account.reserved;
    remaining := greatest(
      v_account.usage_limit - v_account.used - v_account.reserved, 0
    );
    return next;
    return;
  end if;

  select a.* into v_account
    from public.ai_free_usage_accounts a
   where a.user_id = p_user_id
     and a.period_start = v_period_start
   for update;

  if v_account.used + v_account.reserved >= v_account.usage_limit then
    allowed := false;
    reason := 'monthly_limit';
    reservation_id := null;
  else
    insert into public.ai_free_usage_reservations (
      user_id, period_start, request_key
    ) values (
      p_user_id, v_period_start, btrim(p_request_key)
    ) returning id into v_reservation_id;

    update public.ai_free_usage_accounts a
       set reserved = a.reserved + 1
     where a.user_id = p_user_id
       and a.period_start = v_period_start
    returning a.* into v_account;

    allowed := true;
    reason := 'reserved';
    reservation_id := v_reservation_id;
  end if;

  period_start := v_account.period_start;
  period_end := v_account.period_end;
  usage_limit := v_account.usage_limit;
  used := v_account.used;
  reserved := v_account.reserved;
  remaining := greatest(
    v_account.usage_limit - v_account.used - v_account.reserved, 0
  );
  return next;
end;
$$;

create or replace function public.settle_monthly_ai_usage(
  p_user_id uuid,
  p_request_key text,
  p_outcome text
)
returns table (
  recorded boolean,
  reason text,
  period_start timestamptz,
  period_end timestamptz,
  usage_limit integer,
  used integer,
  reserved integer,
  remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.ai_free_usage_reservations%rowtype;
  v_account public.ai_free_usage_accounts%rowtype;
begin
  if p_request_key is null
     or char_length(btrim(p_request_key)) not between 8 and 200
     or p_outcome is null
     or p_outcome not in (
       'succeeded', 'provider_error', 'timeout', 'invalid_response', 'cancelled'
     ) then
    recorded := false;
    reason := 'invalid_input';
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(btrim(p_request_key), 410413)
  );

  select r.* into v_reservation
    from public.ai_free_usage_reservations r
   where r.request_key = btrim(p_request_key)
   for update;

  if not found then
    recorded := false;
    reason := 'not_found';
    return next;
    return;
  end if;

  if v_reservation.user_id is distinct from p_user_id then
    recorded := false;
    reason := 'not_found';
    return next;
    return;
  end if;

  perform private.release_stale_ai_free_usage(v_reservation.user_id);

  select r.* into v_reservation
    from public.ai_free_usage_reservations r
   where r.request_key = btrim(p_request_key)
   for update;

  select a.* into v_account
    from public.ai_free_usage_accounts a
   where a.user_id = v_reservation.user_id
     and a.period_start = v_reservation.period_start
   for update;

  if v_reservation.status <> 'reserved' then
    recorded := false;
    reason := case
      when v_reservation.status = 'consumed' then 'already_consumed'
      else 'already_released'
    end;
  elsif p_outcome = 'succeeded' then
    update public.ai_free_usage_reservations r
       set status = 'consumed',
           result_outcome = 'succeeded',
           settled_at = now()
     where r.id = v_reservation.id;

    update public.ai_free_usage_accounts a
       set reserved = a.reserved - 1,
           used = a.used + 1
     where a.user_id = v_reservation.user_id
       and a.period_start = v_reservation.period_start
    returning a.* into v_account;

    recorded := true;
    reason := 'consumed';
  else
    update public.ai_free_usage_reservations r
       set status = 'released',
           result_outcome = p_outcome,
           settled_at = now()
     where r.id = v_reservation.id;

    update public.ai_free_usage_accounts a
       set reserved = a.reserved - 1
     where a.user_id = v_reservation.user_id
       and a.period_start = v_reservation.period_start
    returning a.* into v_account;

    recorded := true;
    reason := 'released';
  end if;

  period_start := v_account.period_start;
  period_end := v_account.period_end;
  usage_limit := v_account.usage_limit;
  used := v_account.used;
  reserved := v_account.reserved;
  remaining := greatest(
    v_account.usage_limit - v_account.used - v_account.reserved, 0
  );
  return next;
end;
$$;

create or replace function public.get_product_credit_snapshot(p_user_id uuid)
returns table (
  user_id uuid,
  balance bigint,
  reserved bigint,
  available bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null
     or not exists (
       select 1 from auth.users u
        where u.id = p_user_id and not coalesce(u.is_anonymous, false)
     ) then
    raise exception 'product credits require an authenticated account'
      using errcode = '22023';
  end if;

  perform private.release_stale_product_credits(p_user_id);

  insert into public.product_credit_accounts (user_id)
  values (p_user_id)
  on conflict on constraint product_credit_accounts_pkey do nothing;

  return query
  select a.user_id, a.balance, a.reserved, a.balance - a.reserved
    from public.product_credit_accounts a
   where a.user_id = p_user_id;
end;
$$;

create or replace function public.grant_product_credits(
  p_user_id uuid,
  p_idempotency_key text,
  p_amount bigint,
  p_reason text,
  p_actor_reference text
)
returns table (
  recorded boolean,
  reason text,
  ledger_entry_id uuid,
  balance bigint,
  reserved bigint,
  available bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.product_credit_ledger%rowtype;
  v_account public.product_credit_accounts%rowtype;
  v_ledger_id uuid;
begin
  if p_idempotency_key is null
     or char_length(btrim(p_idempotency_key)) not between 8 and 255
     or p_amount is null or p_amount <= 0
     or p_reason is null or char_length(btrim(p_reason)) not between 3 and 200
     or p_actor_reference is null
     or char_length(btrim(p_actor_reference)) not between 3 and 200
     or not exists (
       select 1 from auth.users u
        where u.id = p_user_id and not coalesce(u.is_anonymous, false)
     ) then
    recorded := false;
    reason := 'invalid_input';
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(btrim(p_idempotency_key), 827301)
  );

  perform * from public.get_product_credit_snapshot(p_user_id);

  select l.* into v_existing
    from public.product_credit_ledger l
   where l.idempotency_key = btrim(p_idempotency_key)
   for update;

  select a.* into v_account
    from public.product_credit_accounts a
   where a.user_id = p_user_id
   for update;

  if found and v_existing.id is not null then
    recorded := false;
    reason := case
      when v_existing.owner_user_id = p_user_id
       and v_existing.entry_type = 'grant'
       and v_existing.amount_delta = p_amount
       and v_existing.reason = btrim(p_reason)
       and v_existing.actor_reference = btrim(p_actor_reference)
        then 'already_recorded'
      else 'idempotency_conflict'
    end;
    ledger_entry_id := case
      when v_existing.owner_user_id = p_user_id then v_existing.id else null
    end;
  else
    update public.product_credit_accounts a
       set balance = a.balance + p_amount
     where a.user_id = p_user_id
    returning a.* into v_account;

    insert into public.product_credit_ledger (
      owner_user_id, idempotency_key, entry_type, amount_delta,
      balance_after, reason, actor_reference
    ) values (
      p_user_id, btrim(p_idempotency_key), 'grant', p_amount,
      v_account.balance, btrim(p_reason), btrim(p_actor_reference)
    ) returning id into v_ledger_id;

    insert into public.audit_events (
      actor_tombstone, action, target_type, target_id, outcome, metadata
    ) values (
      btrim(p_actor_reference), 'product_credits_granted',
      'product_credit_accounts', p_user_id, 'success',
      jsonb_build_object(
        'amount', p_amount,
        'ledger_entry_id', v_ledger_id,
        'idempotency_key', btrim(p_idempotency_key)
      )
    );

    recorded := true;
    reason := 'granted';
    ledger_entry_id := v_ledger_id;
  end if;

  balance := v_account.balance;
  reserved := v_account.reserved;
  available := v_account.balance - v_account.reserved;
  return next;
end;
$$;

create or replace function public.reserve_product_credits(
  p_user_id uuid,
  p_request_key text,
  p_purpose text,
  p_amount bigint default 30
)
returns table (
  allowed boolean,
  reason text,
  reservation_id uuid,
  balance bigint,
  reserved bigint,
  available bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.product_credit_reservations%rowtype;
  v_account public.product_credit_accounts%rowtype;
  v_reservation_id uuid;
begin
  if p_request_key is null
     or char_length(btrim(p_request_key)) not between 8 and 200
     or p_purpose is null
     or char_length(btrim(p_purpose)) not between 3 and 64
     or p_purpose !~ '^[a-z][a-z0-9_]*$'
     or p_amount is null or p_amount <= 0
     or (p_purpose = 'external_freelancer_search' and p_amount <> 30)
     or not exists (
       select 1 from auth.users u
        where u.id = p_user_id and not coalesce(u.is_anonymous, false)
     ) then
    allowed := false;
    reason := 'invalid_input';
    reservation_id := null;
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(btrim(p_request_key), 903117)
  );

  perform * from public.get_product_credit_snapshot(p_user_id);

  select r.* into v_existing
    from public.product_credit_reservations r
   where r.request_key = btrim(p_request_key)
   for update;

  select a.* into v_account
    from public.product_credit_accounts a
   where a.user_id = p_user_id
   for update;

  if found and v_existing.id is not null then
    allowed := false;
    reason := case
      when v_existing.user_id is distinct from p_user_id
        or v_existing.purpose is distinct from btrim(p_purpose)
        or v_existing.amount is distinct from p_amount then 'request_key_conflict'
      when v_existing.status = 'reserved' then 'already_reserved'
      when v_existing.status = 'charged' then 'already_charged'
      else 'already_released'
    end;
    reservation_id := case
      when v_existing.user_id = p_user_id then v_existing.id else null
    end;
  elsif v_account.balance - v_account.reserved < p_amount then
    allowed := false;
    reason := 'insufficient_credits';
    reservation_id := null;
  else
    insert into public.product_credit_reservations (
      user_id, request_key, purpose, amount
    ) values (
      p_user_id, btrim(p_request_key), btrim(p_purpose), p_amount
    ) returning id into v_reservation_id;

    update public.product_credit_accounts a
       set reserved = a.reserved + p_amount
     where a.user_id = p_user_id
    returning a.* into v_account;

    allowed := true;
    reason := 'reserved';
    reservation_id := v_reservation_id;
  end if;

  balance := v_account.balance;
  reserved := v_account.reserved;
  available := v_account.balance - v_account.reserved;
  return next;
end;
$$;

create or replace function public.get_external_search_result(
  p_user_id uuid,
  p_project_id uuid,
  p_request_key text
)
returns table (
  result_found boolean,
  result_count integer,
  result_snapshot jsonb,
  provider_response_id text,
  actual_model text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null
     or p_project_id is null
     or p_request_key is null
     or char_length(btrim(p_request_key)) not between 8 and 200
     or not exists (
       select 1 from public.projects p
        where p.id = p_project_id and p.owner_user_id = p_user_id
     ) then
    result_found := false;
    return next;
    return;
  end if;

  return query
  select
    true,
    r.result_count,
    r.result_snapshot,
    r.provider_response_id,
    r.actual_model,
    r.created_at
  from public.external_freelancer_search_results r
  where r.owner_user_id = p_user_id
    and r.project_id = p_project_id
    and r.request_key = btrim(p_request_key);

  if not found then
    result_found := false;
    return next;
  end if;
end;
$$;

-- Persists the bounded result and charges its reserved 30 credits in one
-- transaction. The server calls this only after validating/capping the model
-- response to zero through three public external-profile cards.
create or replace function public.complete_external_search(
  p_user_id uuid,
  p_project_id uuid,
  p_request_key text,
  p_result_snapshot jsonb,
  p_provider_response_id text,
  p_actual_model text
)
returns table (
  recorded boolean,
  reason text,
  result_count integer,
  result_snapshot jsonb,
  balance bigint,
  reserved bigint,
  available bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.product_credit_reservations%rowtype;
  v_existing public.external_freelancer_search_results%rowtype;
  v_account public.product_credit_accounts%rowtype;
  v_result_count integer;
  v_result_id uuid;
begin
  if p_user_id is null
     or p_project_id is null
     or p_request_key is null
     or char_length(btrim(p_request_key)) not between 8 and 200
     or p_result_snapshot is null
     or jsonb_typeof(p_result_snapshot) <> 'array'
     or jsonb_array_length(p_result_snapshot) > 3
     or octet_length(p_result_snapshot::text) > 65536
     or p_provider_response_id is null
     or char_length(btrim(p_provider_response_id)) not between 3 and 255
     or p_actual_model is null
     or char_length(btrim(p_actual_model)) not between 1 and 120
     or not exists (
       select 1 from public.projects p
        where p.id = p_project_id and p.owner_user_id = p_user_id
     ) then
    recorded := false;
    reason := 'invalid_input';
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(btrim(p_request_key), 903117)
  );

  select r.* into v_existing
    from public.external_freelancer_search_results r
   where r.request_key = btrim(p_request_key);

  if found then
    select a.* into v_account
      from public.product_credit_accounts a
     where a.user_id = p_user_id;

    if v_existing.owner_user_id = p_user_id
       and v_existing.project_id = p_project_id then
      recorded := false;
      reason := 'already_completed';
      result_count := v_existing.result_count;
      result_snapshot := v_existing.result_snapshot;
      balance := v_account.balance;
      reserved := v_account.reserved;
      available := v_account.balance - v_account.reserved;
      return next;
      return;
    end if;

    recorded := false;
    reason := 'request_key_conflict';
    return next;
    return;
  end if;

  select r.* into v_reservation
    from public.product_credit_reservations r
   where r.request_key = btrim(p_request_key)
   for update;

  if not found
     or v_reservation.user_id is distinct from p_user_id
     or v_reservation.purpose <> 'external_freelancer_search'
     or v_reservation.amount <> 30 then
    recorded := false;
    reason := 'not_found';
    return next;
    return;
  end if;

  if v_reservation.status <> 'reserved' then
    recorded := false;
    reason := case
      when v_reservation.status = 'charged' then 'already_charged_without_result'
      else 'already_released'
    end;
    return next;
    return;
  end if;

  if v_reservation.expires_at <= now() then
    perform private.release_stale_product_credits(p_user_id);
    recorded := false;
    reason := 'already_released';
    return next;
    return;
  end if;

  select a.* into v_account
    from public.product_credit_accounts a
   where a.user_id = p_user_id
   for update;

  v_result_count := jsonb_array_length(p_result_snapshot);

  insert into public.external_freelancer_search_results (
    owner_user_id, project_id, request_key, credit_reservation_id,
    result_count, result_snapshot, provider_response_id, actual_model
  ) values (
    p_user_id, p_project_id, btrim(p_request_key), v_reservation.id,
    v_result_count, p_result_snapshot, btrim(p_provider_response_id),
    btrim(p_actual_model)
  ) returning id into v_result_id;

  update public.product_credit_accounts a
     set balance = a.balance - v_reservation.amount,
         reserved = a.reserved - v_reservation.amount
   where a.user_id = p_user_id
  returning a.* into v_account;

  update public.product_credit_reservations r
     set status = 'charged',
         result_outcome = case
           when v_result_count = 0 then 'completed_no_result'
           else 'completed'
         end,
         settled_at = now()
   where r.id = v_reservation.id;

  insert into public.product_credit_ledger (
    owner_user_id, idempotency_key, entry_type, amount_delta,
    balance_after, reservation_id, reason, actor_reference
  ) values (
    p_user_id, 'charge:' || v_reservation.id::text, 'debit',
    -v_reservation.amount, v_account.balance, v_reservation.id,
    case
      when v_result_count = 0
        then 'External search completed without a valid result'
      else 'External search completed'
    end,
    'system:external-search'
  );

  insert into public.audit_events (
    actor_user_id, action, target_type, target_id, outcome, metadata
  ) values (
    p_user_id, 'external_freelancer_search_completed',
    'external_freelancer_search_results', v_result_id, 'success',
    jsonb_build_object(
      'request_key', btrim(p_request_key),
      'result_count', v_result_count,
      'credits_charged', v_reservation.amount,
      'provider_response_id', btrim(p_provider_response_id),
      'actual_model', btrim(p_actual_model)
    )
  );

  recorded := true;
  reason := 'charged';
  result_count := v_result_count;
  result_snapshot := p_result_snapshot;
  balance := v_account.balance;
  reserved := v_account.reserved;
  available := v_account.balance - v_account.reserved;
  return next;
end;
$$;

create or replace function public.settle_product_credit_reservation(
  p_user_id uuid,
  p_request_key text,
  p_outcome text
)
returns table (
  recorded boolean,
  reason text,
  balance bigint,
  reserved bigint,
  available bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.product_credit_reservations%rowtype;
  v_account public.product_credit_accounts%rowtype;
begin
  if p_request_key is null
     or char_length(btrim(p_request_key)) not between 8 and 200
     or p_outcome is null
     or p_outcome not in (
       'completed', 'completed_no_result', 'technical_error', 'timeout',
       'invalid_response', 'cancelled'
     ) then
    recorded := false;
    reason := 'invalid_input';
    return next;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(btrim(p_request_key), 903117)
  );

  perform private.release_stale_product_credits(p_user_id);

  select r.* into v_reservation
    from public.product_credit_reservations r
   where r.request_key = btrim(p_request_key)
   for update;

  select a.* into v_account
    from public.product_credit_accounts a
   where a.user_id = p_user_id
   for update;

  if not found or v_account.user_id is null then
    recorded := false;
    reason := 'not_found';
    return next;
    return;
  end if;

  if v_reservation.id is null
     or v_reservation.user_id is distinct from p_user_id then
    recorded := false;
    reason := 'not_found';
  elsif v_reservation.status <> 'reserved' then
    recorded := false;
    reason := case
      when v_reservation.status = 'charged' then 'already_charged'
      else 'already_released'
    end;
  elsif p_outcome in ('completed', 'completed_no_result')
        and v_reservation.purpose = 'external_freelancer_search' then
    -- Paid web-search success must use complete_external_search(), which
    -- stores the bounded result and debits credits atomically.
    recorded := false;
    reason := 'result_snapshot_required';
  elsif p_outcome in ('completed', 'completed_no_result') then
    update public.product_credit_accounts a
       set balance = a.balance - v_reservation.amount,
           reserved = a.reserved - v_reservation.amount
     where a.user_id = p_user_id
    returning a.* into v_account;

    update public.product_credit_reservations r
       set status = 'charged',
           result_outcome = p_outcome,
           settled_at = now()
     where r.id = v_reservation.id;

    insert into public.product_credit_ledger (
      owner_user_id, idempotency_key, entry_type, amount_delta,
      balance_after, reservation_id, reason, actor_reference
    ) values (
      p_user_id, 'charge:' || v_reservation.id::text, 'debit',
      -v_reservation.amount, v_account.balance, v_reservation.id,
      case
        when p_outcome = 'completed_no_result'
          then 'External search completed without a valid result'
        else 'External search completed'
      end,
      'system:external-search'
    );

    recorded := true;
    reason := 'charged';
  else
    update public.product_credit_reservations r
       set status = 'released',
           result_outcome = p_outcome,
           settled_at = now()
     where r.id = v_reservation.id;

    update public.product_credit_accounts a
       set reserved = a.reserved - v_reservation.amount
     where a.user_id = p_user_id
    returning a.* into v_account;

    recorded := true;
    reason := 'released';
  end if;

  balance := v_account.balance;
  reserved := v_account.reserved;
  available := v_account.balance - v_account.reserved;
  return next;
end;
$$;

revoke all on function private.guard_product_credit_ledger_mutation()
  from public, anon, authenticated;
revoke all on function private.release_stale_ai_free_usage(uuid)
  from public, anon, authenticated;
revoke all on function private.release_stale_product_credits(uuid)
  from public, anon, authenticated;

revoke all on function public.get_monthly_ai_usage_snapshot(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.reserve_monthly_ai_usage(uuid, boolean, text)
  from public, anon, authenticated;
revoke all on function public.settle_monthly_ai_usage(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.get_product_credit_snapshot(uuid)
  from public, anon, authenticated;
revoke all on function public.grant_product_credits(uuid, text, bigint, text, text)
  from public, anon, authenticated;
revoke all on function public.reserve_product_credits(uuid, text, text, bigint)
  from public, anon, authenticated;
revoke all on function public.get_external_search_result(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.complete_external_search(
  uuid, uuid, text, jsonb, text, text
) from public, anon, authenticated;
revoke all on function public.settle_product_credit_reservation(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.get_monthly_ai_usage_snapshot(uuid, boolean)
  to service_role;
grant execute on function public.reserve_monthly_ai_usage(uuid, boolean, text)
  to service_role;
grant execute on function public.settle_monthly_ai_usage(uuid, text, text)
  to service_role;
grant execute on function public.get_product_credit_snapshot(uuid)
  to service_role;
grant execute on function public.grant_product_credits(uuid, text, bigint, text, text)
  to service_role;
grant execute on function public.reserve_product_credits(uuid, text, text, bigint)
  to service_role;
grant execute on function public.get_external_search_result(uuid, uuid, text)
  to service_role;
grant execute on function public.complete_external_search(
  uuid, uuid, text, jsonb, text, text
) to service_role;
grant execute on function public.settle_product_credit_reservation(uuid, text, text)
  to service_role;

insert into public.retention_policies (
  record_type, retention_days, deletion_mode, is_enabled, notes
) values
  (
    'ai_free_usage', 400, 'hard_delete', true,
    'Delete expired monthly free-use counters after the reporting window.'
  ),
  (
    'external_search_results', 365, 'hard_delete', true,
    'Delete paid external-search result snapshots after the approved reconstruction window or with their project/user.'
  ),
  (
    'product_credit_reservations', 730, 'hard_delete', true,
    'Delete settled reservation state after the dispute window; ledger entries remain the minimal balance trace.'
  ),
  (
    'product_credit_ledger', 2555, 'operator_review', true,
    'Review the minimal purchased-credit ledger against accounting obligations before deletion.'
  )
on conflict (record_type) do nothing;

create or replace function public.run_credit_retention_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_free_usage integer := 0;
  v_external_results integer := 0;
  v_product_reservations integer := 0;
  v_result jsonb;
begin
  select retention_days into v_days
    from public.retention_policies
   where record_type = 'external_search_results'
     and is_enabled and deletion_mode = 'hard_delete';
  if v_days is not null then
    delete from public.external_freelancer_search_results
     where created_at < now() - make_interval(days => v_days);
    get diagnostics v_external_results = row_count;
  end if;

  select retention_days into v_days
    from public.retention_policies
   where record_type = 'product_credit_reservations'
     and is_enabled and deletion_mode = 'hard_delete';
  if v_days is not null then
    delete from public.product_credit_reservations
     where settled_at is not null
       and settled_at < now() - make_interval(days => v_days);
    get diagnostics v_product_reservations = row_count;
  end if;

  select retention_days into v_days
    from public.retention_policies
   where record_type = 'ai_free_usage'
     and is_enabled and deletion_mode = 'hard_delete';
  if v_days is not null then
    delete from public.ai_free_usage_accounts
     where period_end < now() - make_interval(days => v_days);
    get diagnostics v_free_usage = row_count;
  end if;

  v_result := jsonb_build_object(
    'ai_free_usage', v_free_usage,
    'external_search_results', v_external_results,
    'product_credit_reservations', v_product_reservations
  );

  insert into public.audit_events (
    actor_tombstone, action, target_type, outcome, metadata
  ) values (
    'system:credit-retention', 'credit_retention_cleanup',
    'retention_policies', 'success', v_result
  );

  return v_result;
end;
$$;

revoke all on function public.run_credit_retention_cleanup()
  from public, anon, authenticated;
grant execute on function public.run_credit_retention_cleanup()
  to service_role;

create extension if not exists pg_cron;
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'xportal-credit-retention-daily'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;
select cron.schedule(
  'xportal-credit-retention-daily',
  '30 2 * * *',
  'select public.run_credit_retention_cleanup();'
);

commit;
