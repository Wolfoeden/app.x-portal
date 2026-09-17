-- The canonical /preise page starts checkout for an authenticated account.
-- Stripe itself collects the terms acceptance, so checkout linking no longer
-- depends on the removed, duplicate pricing dialog's local B2B checkbox.

begin;

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

  update public.user_ai_credit_accounts a
     set stripe_plan_id = p_plan_id,
         stripe_customer_id = p_stripe_customer_id,
         stripe_subscription_id = p_stripe_subscription_id,
         stripe_subscription_status = 'pending',
         stripe_cancel_at_period_end = false,
         stripe_checkout_completed_at = now(),
         updated_at = now()
   where a.user_id = p_user_id;

  return query select true, p_user_id, p_plan_id;
end;
$$;

revoke all on function public.link_stripe_subscription_checkout(text,text,uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.link_stripe_subscription_checkout(text,text,uuid,text,text,text,text)
  to service_role;

notify pgrst, 'reload schema';

commit;
