-- Stripe Checkout Session IDs include the mode segment, for example
-- cs_live_... and cs_test_.... Keep the existing service-only RPC and allow
-- internal underscore-separated ID segments without allowing empty segments.
begin;

create or replace function public.save_recruiting_checkout_session(
  p_user_id uuid,
  p_request_key uuid,
  p_session_id text,
  p_session_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_session_id !~ '^cs_[A-Za-z0-9]+(_[A-Za-z0-9]+)*$'
    or p_session_url not like 'https://checkout.stripe.com/%'
  then
    raise exception 'invalid_session';
  end if;

  update public.recruiting_checkout_attempts c
     set session_id = p_session_id,
         session_url = p_session_url
   where c.user_id = p_user_id
     and c.request_key = p_request_key
     and (c.session_id is null or c.session_id = p_session_id);

  if not found then
    raise exception 'checkout_conflict';
  end if;
end;
$$;

revoke all on function public.save_recruiting_checkout_session(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.save_recruiting_checkout_session(uuid,uuid,text,text)
  to service_role;

notify pgrst, 'reload schema';
commit;
