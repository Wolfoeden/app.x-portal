-- Ein gemeinsamer Zähler für die Ratenbegrenzung.
--
-- Bisher lag der Zähler in einer Map am globalThis der Node-Instanz. Auf
-- Netlify läuft jede Route in mehreren, kurzlebigen Funktionsinstanzen:
-- aufeinanderfolgende Anfragen desselben Absenders landen regelmäßig in
-- verschiedenen Prozessen, und nach einem Kaltstart ist der Zähler leer. Das
-- Limit war damit in der Produktion praktisch wirkungslos — betroffen sind
-- auch die beiden Routen, die kostenpflichtige OpenAI-Aufrufe auslösen.
--
-- Der Zähler gehört deshalb dorthin, wo alle Instanzen denselben sehen. Die
-- Erhöhung ist ein einziges `insert … on conflict do update`: PostgreSQL
-- sperrt die Zeile für die Dauer des Updates, zwei gleichzeitige Anfragen
-- können sich also nicht gegenseitig überschreiben.
--
-- Was hier gespeichert wird, ist bewusst wenig: ein Schlüssel, ein Zeitfenster
-- und eine Zahl. Der Schlüssel enthält bei IP-basierten Limits ausschließlich
-- die HMAC-Ableitung aus pseudonymizeIp() — eine Roh-IP erreicht diese Tabelle
-- nicht. Damit stimmt auch wieder, was Abschnitt 2 der Datenschutzerklärung
-- über die Ratenbegrenzung sagt.

begin;

-- 1. Der Zähler --------------------------------------------------------------

create table if not exists public.rate_limit_counters (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  window_ends_at timestamptz not null,
  request_count integer not null default 0,
  constraint rate_limit_counters_key_check
    check (char_length(bucket_key) between 1 and 200),
  constraint rate_limit_counters_count_check
    check (request_count >= 0),
  constraint rate_limit_counters_window_check
    check (window_ends_at > window_started_at)
);

comment on table public.rate_limit_counters is
  'Gemeinsames Fixed-Window-Zählwerk für alle Funktionsinstanzen. Enthält '
  'keine Roh-IP-Adressen: IP-basierte Schlüssel tragen die HMAC-Ableitung aus '
  'pseudonymizeIp(). Zeilen sind flüchtig und werden täglich aufgeräumt.';

-- Der Aufräum-Job liest genau diese Spalte.
create index if not exists rate_limit_counters_window_ends_idx
  on public.rate_limit_counters (window_ends_at);

alter table public.rate_limit_counters enable row level security;
alter table public.rate_limit_counters force row level security;

-- Keine Policy. Die Tabelle ist ausschließlich für die Server-Rolle da; ein
-- Client hat hier auch lesend nichts zu suchen, weil die Schlüssel verraten,
-- wer wie oft angefragt hat.
revoke all on table public.rate_limit_counters from public, anon, authenticated;
grant select, insert, update, delete on table public.rate_limit_counters
  to service_role;

-- 2. Die atomare Erhöhung ----------------------------------------------------

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_count integer;
  v_ends timestamptz;
begin
  if p_key is null or char_length(p_key) = 0 or char_length(p_key) > 200 then
    raise exception 'invalid_rate_limit_key';
  end if;

  if p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1
     or p_window_seconds > 86400 then
    raise exception 'invalid_rate_limit_window';
  end if;

  -- Ein abgelaufenes Fenster wird nicht gelöscht und neu angelegt, sondern in
  -- derselben Anweisung zurückgesetzt. Sonst entstünde zwischen Löschen und
  -- Einfügen genau die Lücke, die der ganze Umbau schließen soll.
  insert into public.rate_limit_counters as c (
    bucket_key, window_started_at, window_ends_at, request_count
  ) values (
    p_key,
    v_now,
    v_now + make_interval(secs => p_window_seconds),
    1
  )
  on conflict (bucket_key) do update
    set request_count = case
          when c.window_ends_at <= v_now then 1
          else c.request_count + 1
        end,
        window_started_at = case
          when c.window_ends_at <= v_now then v_now
          else c.window_started_at
        end,
        window_ends_at = case
          when c.window_ends_at <= v_now
            then v_now + make_interval(secs => p_window_seconds)
          else c.window_ends_at
        end
  returning c.request_count, c.window_ends_at
  into v_count, v_ends;

  if v_count > p_limit then
    return query select
      false,
      0,
      greatest(1, ceil(extract(epoch from (v_ends - v_now)))::integer);
    return;
  end if;

  return query select true, p_limit - v_count, 0;
end;
$$;

comment on function public.consume_rate_limit(text, integer, integer) is
  'Erhöht den Zähler für einen Schlüssel und entscheidet in derselben '
  'Anweisung, ob die Anfrage im Fenster noch zulässig ist.';

revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer)
  to service_role;

-- 3. Aufräumen ---------------------------------------------------------------

-- Das längste Fenster in der Anwendung ist eine Stunde. Ein Tag Karenz reicht
-- also weit und hält die Tabelle klein, ohne ein laufendes Fenster zu treffen.
create or replace function public.run_rate_limit_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.rate_limit_counters
   where window_ends_at < now() - interval '1 day';
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('rate_limit_counters', v_deleted);
end;
$$;

revoke all on function public.run_rate_limit_cleanup()
  from public, anon, authenticated;
grant execute on function public.run_rate_limit_cleanup() to service_role;

create extension if not exists pg_cron;
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'xportal-rate-limit-cleanup-daily'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;
select cron.schedule(
  'xportal-rate-limit-cleanup-daily',
  '20 3 * * *',
  'select public.run_rate_limit_cleanup();'
);

notify pgrst, 'reload schema';

commit;
