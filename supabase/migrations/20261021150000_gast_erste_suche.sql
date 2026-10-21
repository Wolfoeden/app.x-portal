-- Die erste Suche ohne Konto (21.10.2026).
--
-- Seit 20261010121500 bekamen Gäste kein Guthaben: Wer auf /chat ein Projekt
-- beschrieb, sah vor dem ersten Ergebnis den Registrierungsdialog. Von 109
-- Gastzugängen hat keiner je eine Analyse gesehen. Jetzt bekommt ein Gast
-- einmalig das Guthaben für eine Projektanalyse (3 Credits); für die zweite
-- braucht es ein Konto. Kontaktfreigaben und Lebensläufe bleiben Konten mit
-- Trial oder Tarif vorbehalten (`can_use_recruiting` ist für Gäste nie wahr).
--
-- Missbrauch begrenzen weiter die Tageslimits je Gast und je IP in
-- consume_ai_quota_v2_before_recruiting; eine Analyse kostet Bruchteile eines
-- Cents.
--
-- Wer sich danach registriert, behält die drei Starter-Analysen: Die
-- verbrauchte Gastanalyse wird nicht vom Starter-Guthaben abgezogen.
begin;

create or replace function public.get_ai_credit_snapshot(p_user_id uuid,p_is_anonymous boolean,p_initial_credit_total bigint)
returns table (user_id uuid,is_anonymous boolean,credits_total bigint,credits_used bigint,credits_reserved bigint,credits_remaining bigint)
language plpgsql security definer set search_path = '' as $$
declare v_was_anonymous boolean; v_generation text;
begin
  if p_user_id is null or p_is_anonymous is null or not exists (
    select 1 from auth.users u where u.id=p_user_id and coalesce(u.is_anonymous,false)=p_is_anonymous
  ) then raise exception 'invalid AI credit account input' using errcode='22023'; end if;
  select a.is_anonymous,a.billing_generation into v_was_anonymous,v_generation
    from public.user_ai_credit_accounts a where a.user_id=p_user_id;
  insert into public.user_ai_credit_accounts(user_id,is_anonymous,credits_total,plan_id,billing_generation,billing_grant_credits)
    values(p_user_id,p_is_anonymous,case when p_is_anonymous then 3 else 9 end,
      case when p_is_anonymous then 'guest' else 'starter' end,
      case when p_is_anonymous then 'guest_v1' else 'starter_v1' end,
      case when p_is_anonymous then 3 else 9 end)
    on conflict on constraint user_ai_credit_accounts_pkey do update set
      is_anonymous=excluded.is_anonymous,
      plan_id=case
        when v_was_anonymous and not excluded.is_anonymous then 'starter'
        else public.user_ai_credit_accounts.plan_id
      end,
      credits_total=case
        when v_was_anonymous and not excluded.is_anonymous and v_generation='guest_v1'
          then greatest(public.user_ai_credit_accounts.credits_total,public.user_ai_credit_accounts.credits_used+9)
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
  elsif a.billing_generation='guest_v1' and a.plan_id='guest' and a.is_anonymous then v_source:='guest'; v_active:=true;
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

-- Gäste, die unter der alten Regel nie etwas bekamen und nichts verbraucht
-- haben, erhalten dieselbe eine Analyse wie neue Gäste.
update public.user_ai_credit_accounts
   set credits_total = 3, billing_grant_credits = 3, billing_generation = 'guest_v1'
 where is_anonymous and plan_id = 'guest' and billing_generation = 'recruiting_v1'
   and credits_total = 0 and credits_used = 0 and credits_reserved = 0;

notify pgrst, 'reload schema';
commit;
