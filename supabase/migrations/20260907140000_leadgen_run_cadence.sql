-- Der Takt des Lead-Abgleichs.
--
-- Der erste Entwurf sah einen Lauf am Morgen vor, der die Warteschlange in
-- einem Rutsch abarbeitet. Beim ersten Probelauf gegen die Produktion brach
-- er nach dreißig Sekunden mit einem Gateway-Zeitfehler ab: 247 offene Leads,
-- und ein Versand kostet zusätzlich eine SMTP-Runde. Eine synchrone Antwort
-- steht so lange nicht zur Verfügung.
--
-- Der Durchgang arbeitet deshalb ein Stück ab und sagt, was liegen blieb. Der
-- Zeitgeber ruft dafür mehrmals: alle zehn Minuten zwischen 6:40 und 8:30 an
-- Werktagen. Das Tageslimit hängt nicht an diesen Aufrufen, sondern am Tag —
-- gezählt wird, was seit Mitternacht tatsächlich zugestellt wurde. Mehr
-- Aufrufe erhöhen also nicht die Menge, sondern nur die Wahrscheinlichkeit,
-- dass die Tagesmenge auch erreicht wird.
--
-- Ein Aufruf ohne offene Leads kostet eine Abfrage. Das ist der Preis dafür,
-- dass kein Lauf mehr an einer Zeitgrenze scheitert.

begin;

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
  'xportal-leadgen-morning',
  '40,50 6 * * 1-5',
  'select public.trigger_leadgen_run();'
);

select cron.schedule(
  'xportal-leadgen-morning-2',
  '0,10,20,30,40,50 7 * * 1-5',
  'select public.trigger_leadgen_run();'
);

select cron.schedule(
  'xportal-leadgen-morning-3',
  '0,10,20,30 8 * * 1-5',
  'select public.trigger_leadgen_run();'
);

commit;
