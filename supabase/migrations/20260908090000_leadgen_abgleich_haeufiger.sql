-- Der Abgleich braucht mehr Anlaeufe, seit ein Modell mitliest.
--
-- Bisher lief er stuendlich. Das reichte, solange die Ausschreibung
-- deterministisch gelesen wurde: rund 360 Millisekunden je Lead, also etwa
-- fuenfzig in einem Durchgang von zwanzig Sekunden.
--
-- Seit die Ausschreibung durch dasselbe Modell geht, das auch eine Anfrage im
-- Chat liest, dauert ein Lead ein bis drei Sekunden. Ein Durchgang schafft
-- damit noch acht bis zwoelf, und zwoelf Aufrufe am Tag kaemen auf gut
-- hundert Leads -- bei zweihundertfuenfzig offenen zu wenig.
--
-- Also alle zehn Minuten statt stuendlich. Ein Aufruf ohne offene Leads
-- kostet eine Abfrage und kehrt zurueck; das ist der Preis dafuer, dass ein
-- Import am Vormittag nicht bis zum naechsten Morgen liegen bleibt.
--
-- Das Zeitfenster bleibt grosszuegig, weil der Abgleich nichts verschickt: Er
-- laeuft an allen Wochentagen, auch am Samstag, an dem Ausschreibungen
-- erscheinen.

begin;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'xportal-leadgen-prepare'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'xportal-leadgen-prepare',
  '*/10 3-14 * * *',
  $job$select public.trigger_leadgen_run('prepare');$job$
);

commit;
