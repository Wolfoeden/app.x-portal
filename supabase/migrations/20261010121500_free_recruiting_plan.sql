-- One cardless starter allowance: three project analyses at three credits each.
begin;

alter table public.user_ai_credit_accounts
  drop constraint if exists user_ai_credit_accounts_plan_check;
alter table public.user_ai_credit_accounts
  add constraint user_ai_credit_accounts_plan_check check (
    plan_id in ('guest','starter','trial','free','basic','pro','business','enterprise_legacy','enterprise','enterprise_flex')
  );

create or replace function public.get_ai_credit_snapshot(p_user_id uuid,p_is_anonymous boolean,p_initial_credit_total bigint)
returns table (user_id uuid,is_anonymous boolean,credits_total bigint,credits_used bigint,credits_reserved bigint,credits_remaining bigint)
language plpgsql security definer set search_path = '' as $$
declare v_was_anonymous boolean;
begin
  if p_user_id is null or p_is_anonymous is null or not exists (
    select 1 from auth.users u where u.id=p_user_id and coalesce(u.is_anonymous,false)=p_is_anonymous
  ) then raise exception 'invalid AI credit account input' using errcode='22023'; end if;
  select a.is_anonymous into v_was_anonymous
    from public.user_ai_credit_accounts a where a.user_id=p_user_id;
  insert into public.user_ai_credit_accounts(user_id,is_anonymous,credits_total,plan_id,billing_generation,billing_grant_credits)
    values(p_user_id,p_is_anonymous,case when p_is_anonymous then 0 else 9 end,
      case when p_is_anonymous then 'guest' else 'starter' end,
      case when p_is_anonymous then 'recruiting_v1' else 'starter_v1' end,
      case when p_is_anonymous then 0 else 9 end)
    on conflict on constraint user_ai_credit_accounts_pkey do update set
      is_anonymous=excluded.is_anonymous,
      plan_id=case
        when v_was_anonymous and not excluded.is_anonymous then 'starter'
        else public.user_ai_credit_accounts.plan_id
      end,
      credits_total=case
        when v_was_anonymous and not excluded.is_anonymous
          then greatest(public.user_ai_credit_accounts.credits_total,9)
        else public.user_ai_credit_accounts.credits_total
      end,
      billing_generation=case
        when v_was_anonymous and not excluded.is_anonymous then 'starter_v1'
        else public.user_ai_credit_accounts.billing_generation
      end,
      billing_grant_credits=case
        when v_was_anonymous and not excluded.is_anonymous then 9
        else public.user_ai_credit_accounts.billing_grant_credits
      end;
  perform * from public.roll_ai_credit_period(p_user_id);
  return query select a.user_id,a.is_anonymous,a.credits_total,a.credits_used,a.credits_reserved,
    greatest(a.credits_total-a.credits_used-a.credits_reserved,0::bigint)
    from public.user_ai_credit_accounts a where a.user_id=p_user_id;
end; $$;

create or replace function public.get_recruiting_entitlement(p_user_id uuid)
returns table(can_run_ai boolean,can_use_recruiting boolean,source text,reason text)
language plpgsql security definer set search_path = '' as $$
declare a public.user_ai_credit_accounts%rowtype; v_source text:='none'; v_active boolean:=false; v_remaining bigint;
begin
  perform * from public.roll_ai_credit_period(p_user_id);
  select c.* into a from public.user_ai_credit_accounts c where c.user_id=p_user_id;
  if not found then return query select false,false,'none'::text,'billing_required'::text; return; end if;
  v_remaining:=greatest(a.credits_total-a.credits_used-a.credits_reserved,0);
  if a.billing_generation='starter_v1' and a.plan_id='starter' then v_source:='starter'; v_active:=true;
  elsif a.voucher_trial_redeemed_at is not null and a.voucher_trial_end>now() then v_source:='trial'; v_active:=true;
  elsif a.stripe_trial_claimed_at is not null and a.stripe_trial_end>now() and a.stripe_subscription_status in ('trialing','canceled') then v_source:='trial'; v_active:=true;
  elsif a.stripe_paid_through>now() and a.stripe_first_paid_at is not null and a.stripe_subscription_status in ('active','past_due','canceled','unpaid') then v_source:='paid'; v_active:=true;
  elsif a.billing_generation='legacy' and a.stripe_subscription_id is null and (v_remaining>0 or a.plan_id in ('enterprise','enterprise_legacy','enterprise_flex')) then v_source:='legacy'; v_active:=true;
  elsif a.legacy_credit_balance>0 and v_remaining>0 then v_source:='legacy'; v_active:=true;
  end if;
  return query select v_active and (v_remaining>0 or a.plan_id='enterprise_flex'),
    v_active and not a.is_anonymous,v_source,
    case when not v_active then 'billing_required' when v_remaining=0 and a.plan_id<>'enterprise_flex' then 'insufficient_credits' else 'ok' end;
end; $$;

revoke all on function public.get_ai_credit_snapshot(uuid,boolean,bigint) from public,anon,authenticated;
grant execute on function public.get_ai_credit_snapshot(uuid,boolean,bigint) to service_role;
revoke all on function public.get_recruiting_entitlement(uuid) from public,anon,authenticated;
grant execute on function public.get_recruiting_entitlement(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
