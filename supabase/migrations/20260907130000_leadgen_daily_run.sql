-- Der tägliche Anstoß für den Lead-Abgleich.
--
-- Die Entscheidung, was mit einem Lead geschieht, fällt in der Anwendung: Sie
-- kennt den Katalog, sie baut die Nachricht, und sie spricht den Mailserver an.
-- `pg_cron` kann keins davon. Es kann aber eine HTTP-Anfrage abschicken, und
-- genau darauf beschränkt sich dieser Job — er weckt die Route und liest nicht
-- einmal die Antwort.
--
-- Warum überhaupt aus der Datenbank und nicht über einen geplanten Lauf bei
-- Netlify: pg_cron läuft hier bereits für die Aufbewahrungsfristen und für die
-- monatlichen Kontingente. Ein zweiter Zeitgeber an anderer Stelle wäre ein
-- zweiter Ort, an dem jemand nachsehen muss, warum etwas nicht lief.
--
-- Das Geheimnis steht im Vault und nicht im Klartext in dieser Datei: Eine
-- Migration liegt im Repository, und ein Token im Repository ist keins.
--
-- Einrichtung vor dem ersten Lauf (einmalig, nicht Teil dieser Migration):
--
--   select vault.create_secret('<zufällige 48 Zeichen>', 'leadgen_run_token');
--   select vault.create_secret('https://x-portal.eu', 'leadgen_run_origin');
--
-- und derselbe Wert als LEADGEN_RUN_SECRET in der Umgebung der Anwendung.
-- Fehlt eins von beidem, hält der Job an und schreibt eine Warnung, statt eine
-- Anfrage ohne Token loszuschicken.

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.trigger_leadgen_run()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_origin text;
begin
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
    body := '{}'::jsonb,
    -- Die Route arbeitet den Stapel ab und antwortet erst danach. Der Job
    -- wartet nicht darauf; die Zeitgrenze verhindert nur, dass eine haengende
    -- Verbindung im Netz stehen bleibt.
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.trigger_leadgen_run() from public, anon, authenticated;

comment on function public.trigger_leadgen_run() is
  'Weckt POST /api/leadgen/run. Die Entscheidung ueber jeden Lead faellt dort, '
  'nicht hier — diese Funktion schickt nur die Anfrage.';

-- Ein Lauf am Morgen. Nicht zur vollen Stunde und nicht zu nachtschlafender
-- Zeit: Die Nachricht soll im Postfach des Empfaengers oben stehen, wenn er
-- den Rechner anschaltet, und nicht unter der Nachtpost begraben sein.
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'xportal-leadgen-daily'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'xportal-leadgen-daily',
  '40 6 * * 1-5',
  'select public.trigger_leadgen_run();'
);

commit;
