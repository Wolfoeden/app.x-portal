-- Ein Limit, das der Kunde sich selbst setzt.
--
-- Enterprise wird nach Verbrauch abgerechnet. Wer das bucht, will vorher
-- wissen, wie hoch die Rechnung höchstens ausfällt — und zwar so, dass er es
-- selbst in der Hand hat und nicht anrufen muss.
--
-- Durchgesetzt wird nicht an einer neuen Stelle, sondern über `credits_total`
-- selbst: das Limit senkt das Kontingent der laufenden Periode. Damit greift
-- jede bestehende Prüfung unverändert weiter — `consume_ai_quota` und die
-- Momentaufnahme rechnen ohnehin gegen `credits_total`. Eine zweite
-- Durchsetzungsstelle wäre eine zweite Stelle, an der man sie vergessen kann.
--
-- `credits_self_limit` merkt sich den Wunsch über den Monatswechsel hinweg:
-- `credits_total` wird beim Rollen neu gesetzt und hätte das Limit sonst
-- jeden Monat vergessen.

alter table public.user_ai_credit_accounts
  add column if not exists credits_self_limit bigint;

alter table public.user_ai_credit_accounts
  drop constraint if exists user_ai_credit_accounts_self_limit_check;

alter table public.user_ai_credit_accounts
  add constraint user_ai_credit_accounts_self_limit_check
    check (credits_self_limit is null or credits_self_limit >= 0);

comment on column public.user_ai_credit_accounts.credits_self_limit is
  'Vom Kunden gesetzte Obergrenze für die Monatsperiode. NULL heißt: volles Kontingent der Stufe.';

-- Beim Monatswechsel gilt wieder das Kontingent der Stufe — aber gedeckelt
-- durch das, was der Kunde eingestellt hat.
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
  v_rolled boolean;
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

  select r.rolled into v_rolled
  from public.roll_ai_credit_period(p_user_id) r;
  v_rolled := coalesce(v_rolled, false);

  insert into public.user_ai_credit_accounts (
    user_id, is_anonymous, credits_total
  ) values (
    p_user_id, p_is_anonymous, p_initial_credit_total
  )
  on conflict on constraint user_ai_credit_accounts_pkey do update
    set is_anonymous = excluded.is_anonymous,
        credits_total = case
          -- Neue Periode: das konfigurierte Kontingent, aber nie mehr als der
          -- Kunde sich selbst zugestanden hat.
          when v_rolled then least(
            excluded.credits_total,
            coalesce(
              public.user_ai_credit_accounts.credits_self_limit,
              excluded.credits_total
            )
          )
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

-- Das Limit setzen. Die Stufengrenze kommt aus der Anwendung, weil dort die
-- Preisliste steht; die Funktion sorgt nur dafür, dass niemand sie überschreitet.
create or replace function public.set_ai_credit_self_limit(
  p_user_id uuid,
  p_limit bigint,
  p_plan_allowance bigint
)
returns table (
  credits_total bigint,
  credits_self_limit bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit bigint;
begin
  if p_user_id is null
     or p_plan_allowance is null
     or p_plan_allowance < 0
     or (p_limit is not null and p_limit < 0)
     -- Ein Gastzugang hat nichts einzustellen: er zahlt nicht.
     or not exists (
       select 1
       from auth.users u
       where u.id = p_user_id
         and coalesce(u.is_anonymous, false) = false
     ) then
    raise exception 'invalid AI credit limit input'
      using errcode = '22023';
  end if;

  -- Über die Stufengrenze hinaus lässt sich nichts einstellen; wer sie
  -- ausschöpfen will, setzt das Limit auf NULL statt auf eine Fantasiezahl.
  v_limit := case
    when p_limit is null then null
    else least(p_limit, p_plan_allowance)
  end;

  update public.user_ai_credit_accounts a
  set credits_self_limit = v_limit,
      -- Sofort wirksam, nicht erst zum Monatswechsel: wer die Grenze senkt,
      -- will sie jetzt gesenkt haben.
      credits_total = least(p_plan_allowance, coalesce(v_limit, p_plan_allowance)),
      updated_at = now()
  where a.user_id = p_user_id;

  return query
  select a.credits_total, a.credits_self_limit
  from public.user_ai_credit_accounts a
  where a.user_id = p_user_id;
end;
$$;

revoke all on function public.set_ai_credit_self_limit(uuid, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.set_ai_credit_self_limit(uuid, bigint, bigint)
  to service_role;

-- Nur lesen. Bewusst eine eigene Funktion statt eines zusätzlichen Feldes in
-- `get_ai_credit_snapshot`: deren Rückgabetyp ließe sich nicht ersetzen,
-- sondern nur löschen und neu anlegen — und daran hängt `consume_ai_quota`.
create or replace function public.get_ai_credit_self_limit(p_user_id uuid)
returns bigint
language sql
security definer
set search_path = ''
stable
as $$
  select a.credits_self_limit
  from public.user_ai_credit_accounts a
  where a.user_id = p_user_id;
$$;

revoke all on function public.get_ai_credit_self_limit(uuid)
  from public, anon, authenticated;
grant execute on function public.get_ai_credit_self_limit(uuid)
  to service_role;
