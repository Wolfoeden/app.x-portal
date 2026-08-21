-- Monthly period for the customer-facing AI credit balance.
--
-- user_ai_credit_accounts was built as a lifetime allocation: credits_total is
-- set once and credits_used only ever grows. That was harmless while the
-- balance could not gate anything, because the flat 10/100 monthly counter in
-- ai_free_usage_accounts was the real entitlement.
--
-- The balance now gates requests, so it needs the same UTC calendar-month
-- period the counter it replaces already had. Without this, an exhausted
-- account would be locked out permanently rather than until the first of the
-- next month.
--
-- Purchased credits are deliberately not part of this migration. They arrive
-- with the payment provider as a separate persistent column; the reset below
-- only zeroes usage within the free monthly allowance and therefore keeps
-- working unchanged once that column exists.

alter table public.user_ai_credit_accounts
  add column period_start timestamptz,
  add column period_end timestamptz;

-- Current UTC calendar month, matching get_monthly_ai_usage_snapshot.
create or replace function private.current_ai_credit_period_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', (now() at time zone 'utc')) at time zone 'utc';
$$;

-- Existing accounts join the current period with their usage intact. Their
-- allowance was a lifetime figure, so carrying used/reserved over means the
-- first period is at most as generous as before, never more.
update public.user_ai_credit_accounts
  set period_start = private.current_ai_credit_period_start(),
      period_end = private.current_ai_credit_period_start() + interval '1 month'
  where period_start is null or period_end is null;

alter table public.user_ai_credit_accounts
  alter column period_start set not null,
  alter column period_end set not null,
  alter column period_start set default private.current_ai_credit_period_start(),
  alter column period_end
    set default private.current_ai_credit_period_start() + interval '1 month',
  add constraint user_ai_credit_accounts_period_check
    check (period_end > period_start);

-- Idempotent period roll.
--
-- The predicate makes a second concurrent call a no-op, so this is safe to run
-- as its own statement ahead of a reservation rather than inside
-- consume_ai_quota. Callers must treat it as advisory: it never fails a
-- request, it only refills an expired period.
--
-- credits_reserved is cleared alongside credits_used. A reservation open
-- across a month boundary would otherwise consume the new period's allowance
-- forever. record_ai_usage floors the reservation release at zero, so an
-- in-flight request still settles correctly against the new period.
-- The output names deliberately avoid period_start/period_end: RETURNS TABLE
-- parameters become plpgsql variables and would shadow the identically named
-- columns of the table this function updates.
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
  v_rolled boolean := false;
begin
  if p_user_id is null then
    raise exception 'invalid AI credit period input' using errcode = '22023';
  end if;

  update public.user_ai_credit_accounts a
    set period_start = private.current_ai_credit_period_start(),
        period_end =
          private.current_ai_credit_period_start() + interval '1 month',
        credits_used = 0,
        credits_reserved = 0
  where a.user_id = p_user_id
    and now() >= a.period_end;

  v_rolled := found;

  return query
  select
    v_rolled,
    a.period_start,
    a.period_end
  from public.user_ai_credit_accounts a
  where a.user_id = p_user_id;
end;
$$;

-- Same contract as before, with the expired period refilled before the
-- balance is read. The return signature is intentionally unchanged so every
-- existing caller keeps working.
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

  -- Before the upsert: the guest-to-account branch below reads credits_used,
  -- which must not be a previous period's figure. PERFORM needs the FROM form
  -- here because the function returns a set.
  perform * from public.roll_ai_credit_period(p_user_id);

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
          when public.user_ai_credit_accounts.is_anonymous
               and excluded.is_anonymous
            then greatest(
              public.user_ai_credit_accounts.credits_total,
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

revoke all on function private.current_ai_credit_period_start()
  from public, anon, authenticated;

revoke all on function public.roll_ai_credit_period(uuid)
  from public, anon, authenticated;
grant execute on function public.roll_ai_credit_period(uuid)
  to service_role;

revoke all on function public.get_ai_credit_snapshot(uuid, boolean, bigint)
  from public, anon, authenticated;
grant execute on function public.get_ai_credit_snapshot(uuid, boolean, bigint)
  to service_role;
