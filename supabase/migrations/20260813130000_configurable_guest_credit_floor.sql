-- Raising AI_CREDITS_GUEST_TOTAL must also raise an existing anonymous
-- account's lifetime allocation. It must never reset usage or refill on every
-- request: the total only moves to the higher operator-configured floor.

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

revoke all on function public.get_ai_credit_snapshot(uuid, boolean, bigint)
  from public, anon, authenticated;
grant execute on function public.get_ai_credit_snapshot(uuid, boolean, bigint)
  to service_role;
