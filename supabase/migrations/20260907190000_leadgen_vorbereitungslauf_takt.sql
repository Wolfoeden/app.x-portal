-- Zwei Zeitgeber statt einem.
--
-- Seit Abgleich und Versand getrennt sind, brauchen sie verschiedene Takte.
-- Der Versand bleibt im Fenster 8 bis 12 Uhr Ortszeit; er verlaesst das Haus
-- und richtet sich nach der Uhrzeit des Empfaengers. Der Abgleich tut das
-- nicht: Er liest die Warteschlange, rechnet gegen den Katalog und legt
-- Entwuerfe an. Ihn an eine Bueroeit zu binden waere Aberglaube.
--
-- Der Abgleich laeuft deshalb frueh und stuendlich: einmal um 3 Uhr UTC gegen
-- den ueber Nacht importierten Bestand, danach stuendlich weiter, damit ein
-- Import am Vormittag nicht bis zum naechsten Morgen liegen bleibt. Wenn
-- nichts abzugleichen ist, kostet ein Aufruf eine Abfrage.
--
-- Reihenfolge: Der Abgleich um 3 Uhr UTC (5 Uhr Ortszeit im Sommer) ist
-- fertig, lange bevor der erste Versandaufruf um 6 Uhr UTC kommt. Der Versand
-- findet also vor, was er zustellen soll.

begin;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
      from cron.job
     where jobname in ('xportal-leadgen-prepare', 'xportal-leadgen-window')
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

-- Die Weckfunktion sagt jetzt, was gemeint ist. Ohne Angabe bleibt es beim
-- Versand: Das ist, was ein Aufrufer aus der Zeit davor erwartet haette.
create or replace function public.trigger_leadgen_run(
  p_mode text default 'send'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_origin text;
  v_mode text;
begin
  v_mode := case when p_mode = 'prepare' then 'prepare' else 'send' end;

  select decrypted_secret into v_token
    from vault.decrypted_secrets
   where name = 'leadgen_run_token';

  select decrypted_secret into v_origin
    from vault.decrypted_secrets
   where name = 'leadgen_run_origin';

  if v_token is null or v_origin is null then
    raise warning 'leadgen run skipped: vault secrets leadgen_run_token/leadgen_run_origin missing';
    return;
  end if;

  perform net.http_post(
    url := v_origin || '/api/leadgen/run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-leadgen-run-token', v_token
    ),
    body := jsonb_build_object('mode', v_mode),
    -- Die Route arbeitet den Stapel ab und antwortet erst danach. Der Job
    -- wartet nicht darauf; die Zeitgrenze verhindert nur, dass eine haengende
    -- Verbindung im Netz stehen bleibt.
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.trigger_leadgen_run(text)
  from public, anon, authenticated;

comment on function public.trigger_leadgen_run(text) is
  'Weckt POST /api/leadgen/run. prepare gleicht ab, send stellt zu. Die '
  'Entscheidung ueber jeden Lead faellt dort, nicht hier.';

-- Die parameterlose Fassung faellt weg, damit kein Aufrufer versehentlich
-- den alten Weg nimmt, der beides in einem Durchgang meinte.
drop function if exists public.trigger_leadgen_run();

-- Der Abgleich. Stuendlich von 3 bis 14 Uhr UTC, an allen Wochentagen: Eine
-- Ausschreibung, die am Samstag erscheint, soll am Montag nicht erst noch
-- abgeglichen werden muessen.
select cron.schedule(
  'xportal-leadgen-prepare',
  '5 3-14 * * *',
  $job$select public.trigger_leadgen_run('prepare');$job$
);

-- Der Versand. Unveraendert im Fenster, das die Anwendung auf 8 bis 12 Uhr
-- Ortszeit zuschneidet.
select cron.schedule(
  'xportal-leadgen-window',
  '*/10 6-11 * * 1-5',
  $job$select public.trigger_leadgen_run('send');$job$
);

commit;
