-- Die Freischaltung nach einer Stripe-Zahlung.
--
-- Bisher wurde ein bezahlter Plan von Hand gebucht. Das skaliert nicht und
-- vergisst sich: wer abends zahlt, wartet bis zum nächsten Werktag.
--
-- Zwei Dinge braucht es dafür. Erstens eine Gedächtnisstütze, welche Ereignisse
-- schon verarbeitet sind — Stripe stellt bei jedem Zweifel erneut zu, und ohne
-- diese Tabelle bekäme ein Konto bei jedem Zustellversuch erneut sein
-- Kontingent. Zweitens eine Funktion, die Stufe und Kontingent in einem Schritt
-- setzt, damit kein Konto mit halber Freischaltung zurückbleibt.

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  user_id uuid references auth.users (id) on delete set null,
  received_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
alter table public.stripe_webhook_events force row level security;

-- Wie bei den Guthabenkonten: keine Browser-Richtlinien. Gelesen und
-- geschrieben wird ausschließlich von der Serverroute mit der Service-Rolle.
revoke all on public.stripe_webhook_events from public, anon, authenticated;
grant select, insert on public.stripe_webhook_events to service_role;

-- Ein Konto auf die bezahlte Stufe heben.
--
-- Gibt `activated = false` zurück, wenn das Ereignis schon verarbeitet war.
-- Die Route antwortet in beiden Fällen mit 200: für Stripe ist ein doppelt
-- zugestelltes Ereignis erledigt, sobald wir es einmal kennen.
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
begin
  if p_event_id is null
     or p_event_type is null
     or p_user_id is null
     or p_plan_allowance is null
     or p_plan_allowance < 0
     or p_plan_id not in ('free', 'enterprise')
     -- Ein Gastzugang kann nichts kaufen; er hat keine bestätigte Identität.
     or not exists (
       select 1
       from auth.users u
       where u.id = p_user_id
         and coalesce(u.is_anonymous, false) = false
     ) then
    raise exception 'invalid plan activation input'
      using errcode = '22023';
  end if;

  -- Der Primärschlüssel entscheidet, ob dies der erste Zustellversuch ist.
  -- Die Prüfung und der Eintrag sind damit ein einziger Schritt; ein
  -- getrenntes "erst nachsehen, dann schreiben" hätte zwischen beiden ein
  -- Fenster für die zweite Zustellung.
  insert into public.stripe_webhook_events (event_id, event_type, user_id)
  values (p_event_id, p_event_type, p_user_id)
  on conflict (event_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return query
    select false, a.credits_total
    from public.user_ai_credit_accounts a
    where a.user_id = p_user_id;
    return;
  end if;

  -- Das Konto kann fehlen, wenn jemand bezahlt, bevor er das erste Mal
  -- gesucht hat. Dann entsteht es hier.
  insert into public.user_ai_credit_accounts (
    user_id, is_anonymous, credits_total, plan_id
  ) values (
    p_user_id, false, p_plan_allowance, p_plan_id
  )
  on conflict on constraint user_ai_credit_accounts_pkey do update
    set plan_id = excluded.plan_id,
        -- Ein bereits gesetztes eigenes Limit bleibt in Kraft: es ist der
        -- ausdrückliche Wunsch des Kunden und keine Altlast.
        credits_total = least(
          excluded.credits_total,
          coalesce(
            public.user_ai_credit_accounts.credits_self_limit,
            excluded.credits_total
          )
        ),
        updated_at = now();

  return query
  select true, a.credits_total
  from public.user_ai_credit_accounts a
  where a.user_id = p_user_id;
end;
$$;

revoke all on function public.activate_paid_plan(text, text, uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.activate_paid_plan(text, text, uuid, text, bigint)
  to service_role;
