-- Das Versandfenster: 8 bis 12 Uhr Ortszeit, Montag bis Freitag.
--
-- Der Takt aus 20260907140000 lag am fruehen Morgen und war in UTC
-- geschrieben. Beides wird hier ersetzt, und zwar aus einem Grund, der
-- groesser ist als die neue Uhrzeit: `cron.timezone` steht auf GMT, der
-- Zeitplan gilt also in UTC. Deutschland wechselt zweimal im Jahr den
-- Abstand dorthin. Ein fester Ausdruck wie '40 6 * * 1-5' meint im Sommer
-- 8:40 und im Winter 7:40 — die Uhrzeit im Zeitplan waere damit eine
-- Zusage, die der Zeitplan nicht halten kann.
--
-- Deshalb weckt der Zeitgeber die Route grosszuegiger, als das Fenster ist:
-- 6 bis 11 Uhr UTC deckt 8 bis 12 Uhr Ortszeit in beiden Jahreshaelften ab.
-- Die Entscheidung faellt danach in der Anwendung, wo Europe/Berlin bekannt
-- ist (`isWithinLeadSendWindow()` in lib/leadgen/limits.ts). Ein Aufruf
-- ausserhalb des Fensters kehrt sofort zurueck, ohne die Datenbank
-- anzufassen.
--
-- Alle zehn Minuten, weil ein Durchgang nach zwanzig Sekunden aufhoert und
-- sagt, was liegen blieb. Das Tageslimit haengt nicht an der Zahl der
-- Aufrufe, sondern am Tag: gezaehlt wird, was seit Mitternacht Ortszeit
-- tatsaechlich zugestellt wurde.

begin;

-- Alle bisherigen Namen, damit kein Zeitgeber aus einer frueheren Fassung
-- stehen bleibt und daneben mitlaeuft.
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
      from cron.job
     where jobname in (
       'xportal-leadgen-daily',
       'xportal-leadgen-morning',
       'xportal-leadgen-morning-2',
       'xportal-leadgen-morning-3',
       'xportal-leadgen-window'
     )
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'xportal-leadgen-window',
  '*/10 6-11 * * 1-5',
  'select public.trigger_leadgen_run();'
);

commit;
