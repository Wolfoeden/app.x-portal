-- Das Nachfassen nach einer Vorstellung läuft jetzt von selbst.
--
-- Bisher verschickte der Betreiber die fälligen Nachfragen per Knopf im
-- Admin. Seit die Frage in „Gespräche“ steht, geht per Mail nur noch ein
-- kurzer Hinweis mit Link dorthin; den verschickt dieser Zeitplan einmal am
-- Tag. Der Knopf im Admin bleibt für den Fall, dass es schneller gehen soll.
--
-- Derselbe Weg wie beim Leadgen-Lauf: `pg_cron` ruft eine Funktion, die das
-- Geheimnis aus dem Supabase-Vault holt (`placement_run_token`, Adresse aus
-- `leadgen_run_origin`) und per `pg_net` die Route aufruft. Das Geheimnis
-- steht in Netlify als `PLACEMENT_RUN_SECRET`.
--
-- 06:52 UTC, also vor neun Uhr deutscher Zeit, an allen Tagen: Die Hinweise
-- hängen an Tagen nach der Vorstellung, nicht an Werktagen.

begin;

create or replace function public.trigger_placement_follow_ups()
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
   where name = 'placement_run_token';

  select decrypted_secret into v_origin
    from vault.decrypted_secrets
   where name = 'leadgen_run_origin';

  if v_token is null or v_origin is null then
    raise warning 'placement follow-ups skipped: vault secrets placement_run_token/leadgen_run_origin missing';
    return;
  end if;

  perform net.http_post(
    url := v_origin || '/api/admin/introductions/follow-ups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-placement-run-token', v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.trigger_placement_follow_ups()
  from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'xportal-placement-follow-ups'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'xportal-placement-follow-ups',
  '52 6 * * *',
  $job$select public.trigger_placement_follow_ups();$job$
);

commit;
