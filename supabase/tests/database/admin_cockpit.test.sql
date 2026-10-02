-- Das Cockpit im Adminbereich: Lead-Automatik, Kontakte, Systemstatus.
-- Alles im Test wird zurückgerollt.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Der Versand beginnt auf „manuell“: Wer automatisch verschickt, soll es
-- bewusst eingeschaltet haben.
select is(
  (select send_mode from public.leadgen_automation where id),
  'manual',
  'Versand startet manuell'
);
select is(
  (select prepare_mode from public.leadgen_automation where id),
  'scheduled',
  'Abgleich startet nach Zeitplan'
);
select throws_ok(
  $$insert into public.leadgen_automation (id) values (false)$$,
  '23514',
  null,
  'Die Einstellung hat genau eine Zeile'
);
select throws_ok(
  $$update public.leadgen_automation set send_mode = 'on_arrival' where id$$,
  '23514',
  null,
  'Versand kennt kein „sofort bei Eingang“'
);

select has_function('public', 'trigger_leadgen_run', array['text', 'text'], 'Zeitgeber mit Herkunft');
select hasnt_function('public', 'trigger_leadgen_run', array['text'], 'keine mehrdeutige alte Fassung');
select has_trigger('public', 'leadgen_queue', 'leadgen_queue_arrival', 'Eingangs-Trigger vorhanden');

-- Kontakte: Stufen und Adressen werden geprüft.
select lives_ok(
  $$insert into public.crm_contacts (dedupe_key, company, contact_name, email, email_kind, source)
    values ('test|person|person@example.invalid', 'Test GmbH', 'Test Person', 'person@example.invalid', 'personal', 'test')$$,
  'Kontakt lässt sich anlegen'
);
select throws_ok(
  $$insert into public.crm_contacts (dedupe_key, company, email) values ('x', 'X', 'keine-adresse')$$,
  '23514',
  null,
  'ungültige Adresse wird abgelehnt'
);
select throws_ok(
  $$update public.crm_contacts set stage = 'spam' where dedupe_key = 'test|person|person@example.invalid'$$,
  '23514',
  null,
  'unbekannte Stufe wird abgelehnt'
);
select throws_ok(
  $$insert into public.crm_contacts (dedupe_key, company) values ('test|person|person@example.invalid', 'Doppelt')$$,
  '23505',
  null,
  'derselbe Kontakt kommt nur einmal vor'
);
select lives_ok(
  $$insert into public.crm_contact_events (contact_id, kind, body)
    select id, 'note', 'Erste Notiz' from public.crm_contacts where dedupe_key = 'test|person|person@example.invalid'$$,
  'Verlauf lässt sich schreiben'
);
with geloescht as (
  delete from public.crm_contacts
   where dedupe_key = 'test|person|person@example.invalid'
  returning 1
)
select is((select count(*)::int from geloescht), 1, 'Kontakt lässt sich löschen');
select is(
  (select count(*)::int from public.crm_contact_events where body = 'Erste Notiz'),
  0,
  'Verlauf geht mit dem Kontakt'
);

-- Nur der Dienst kommt heran.
select ok(
  not has_table_privilege('anon', 'public.crm_contacts', 'select')
  and not has_table_privilege('authenticated', 'public.crm_contacts', 'select')
  and not has_table_privilege('anon', 'public.crm_contact_events', 'select')
  and not has_table_privilege('authenticated', 'public.crm_contact_events', 'select')
  and not has_table_privilege('anon', 'public.leadgen_automation', 'select')
  and not has_table_privilege('authenticated', 'public.leadgen_automation', 'select'),
  'anon und authenticated lesen nichts'
);
select ok(
  not has_function_privilege('anon', 'public.admin_system_health()', 'execute')
  and not has_function_privilege('authenticated', 'public.admin_system_health()', 'execute')
  and has_function_privilege('service_role', 'public.admin_system_health()', 'execute'),
  'Systemstatus nur für den Dienst'
);
select ok(
  not has_function_privilege('anon', 'public.trigger_leadgen_run(text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.trigger_leadgen_run(text, text)', 'execute'),
  'Zeitgeber nicht von außen aufrufbar'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.crm_contacts'::regclass)
  and (select relforcerowsecurity from pg_class where oid = 'public.crm_contact_events'::regclass)
  and (select relforcerowsecurity from pg_class where oid = 'public.leadgen_automation'::regclass),
  'RLS erzwungen'
);

select ok(
  public.admin_system_health() ? 'jobs' and public.admin_system_health() ? 'http',
  'Systemstatus liefert Zeitgeber und HTTP-Antworten'
);

select * from finish();
rollback;
