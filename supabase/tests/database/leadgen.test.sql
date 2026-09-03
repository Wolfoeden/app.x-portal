-- Die Zusagen der Lead-Arbeitsfläche. Läuft in einer eigenen Transaktion und
-- lässt weder Leads noch Identitäten zurück.
--
-- Geprüft wird, was nicht im Anwendungscode stehen darf: dass niemand ohne
-- Service-Role an die Tabellen kommt, dass derselbe Lead nicht zweimal
-- angeschrieben werden kann, dass ein unbearbeiteter Lead nicht im Archiv
-- landet, und dass ein Suchbegriff mit Sonderzeichen die Liste nicht zerlegt.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, is_anonymous,
  email_confirmed_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'e1111111-1111-4111-8111-111111111111',
  'authenticated', 'authenticated', 'leadgen-admin@example.invalid', '', false,
  now(), now(), now()
);

-- `id` ist `generated always as identity`; feste Kennungen brauchen deshalb
-- die ausdrückliche Übersteuerung. Sie sind hier praktisch, weil die
-- Zusicherungen weiter unten auf dieselben Zeilen zeigen müssen.
insert into public.leadgen_queue (
  id, recipient_email, recipient_name, company, stellenanzeige, status
) overriding system value values (
  9000001,
  'kontakt@example.invalid',
  'Test Person',
  'Testfirma GmbH',
  'Senior DevOps Engineer, Kubernetes (Remote) — Baut CI/CD auf. — https://example.invalid/p/1',
  'new'
), (
  9000002,
  'zweite@example.invalid',
  null,
  'Andere GmbH',
  'Projektmanager SAP — Migration — https://example.invalid/p/2',
  'new'
);

-- ---------------------------------------------------------------------
-- Niemand außer der Service-Rolle sieht diese Tabellen.
-- ---------------------------------------------------------------------
select ok(
  not has_table_privilege('anon', 'public.leadgen_queue', 'select'),
  'anon darf leadgen_queue nicht lesen'
);
select ok(
  not has_table_privilege('authenticated', 'public.leadgen_queue', 'select'),
  'ein angemeldetes Konto darf leadgen_queue nicht lesen'
);
select ok(
  not has_table_privilege('anon', 'public.leadgen_outreach', 'select'),
  'anon darf leadgen_outreach nicht lesen'
);
select ok(
  not has_table_privilege('authenticated', 'public.leadgen_outreach', 'insert'),
  'ein angemeldetes Konto darf nicht ins Versandprotokoll schreiben'
);
select ok(
  has_table_privilege('service_role', 'public.leadgen_outreach', 'insert'),
  'die Service-Rolle darf ins Versandprotokoll schreiben'
);

-- ---------------------------------------------------------------------
-- Ein Suchbegriff ist ein Parameter, kein Teil der Abfrage.
-- ---------------------------------------------------------------------
select is(
  (
    select count(*)::int
    from public.admin_list_leadgen_queue(
      'Kubernetes (Remote)', null, null, 'open', 50, 0
    )
    where id = 9000001
  ),
  1,
  'ein Suchbegriff mit Komma und Klammern findet die Zeile, statt zu zerbrechen'
);

select is(
  (
    select count(*)::int
    from public.admin_list_leadgen_queue(null, null, null, 'open', 50, 0)
    where id in (9000001, 9000002)
  ),
  2,
  'ohne Filter stehen beide offenen Leads in der Liste'
);

-- ---------------------------------------------------------------------
-- Ein unbearbeiteter Lead darf nicht archiviert werden.
-- ---------------------------------------------------------------------
select throws_ok(
  $$update public.leadgen_queue
       set archived_at = now()
     where id = 9000002$$,
  '23514',
  null,
  'archived_at bei status new verletzt leadgen_queue_archive_shape_check'
);

-- ---------------------------------------------------------------------
-- Der Versand protokolliert, archiviert und lässt sich nicht wiederholen.
-- ---------------------------------------------------------------------
-- Erst beanspruchen, dann abschließen: die Sperre liegt vor dem Versand,
-- nicht danach.
select is(
  (
    select claimed
    from public.claim_leadgen_outreach(
      9000001, 'Betreff', 'Rumpf', 'gpt-5.4-nano', 2,
      'e1111111-1111-4111-8111-111111111111'
    )
  ),
  true,
  'der erste Lauf bekommt den Anspruch'
);

select is(
  (
    select reason
    from public.claim_leadgen_outreach(
      9000001, 'Betreff', 'Rumpf', null, null, null
    )
  ),
  'already_sent',
  'ein zweiter Lauf bekommt ihn nicht und stellt deshalb nie zu'
);

select is(
  (select status from public.leadgen_queue where id = 9000001),
  'new',
  'vor dem Abschluss gilt der Lead noch nicht als angeschrieben'
);

select is(
  (
    select recorded
    from public.record_leadgen_outreach_sent(
      (select id from public.leadgen_outreach
        where lead_id = 9000001 and state = 'sending')
    )
  ),
  true,
  'der Abschluss protokolliert den Versand'
);

select is(
  (select status from public.leadgen_queue where id = 9000001),
  'contacted',
  'der Lead steht danach auf contacted'
);

select isnt(
  (select archived_at from public.leadgen_queue where id = 9000001),
  null,
  'der Lead ist danach archiviert und aus der offenen Liste verschwunden'
);

select is(
  (
    select count(*)::int
    from public.admin_list_leadgen_queue(null, null, null, 'open', 50, 0)
    where id = 9000001
  ),
  0,
  'ein angeschriebener Lead taucht in der offenen Ansicht nicht mehr auf'
);

select is(
  (
    select count(*)::int
    from public.admin_list_leadgen_queue(null, null, null, 'archived', 50, 0)
    where id = 9000001
  ),
  1,
  'im Archiv ist er dafür zu finden'
);

select is(
  (
    select reason
    from public.claim_leadgen_outreach(
      9000001, 'Zweiter Betreff', 'Zweiter Rumpf', null, null, null
    )
  ),
  'already_sent',
  'ein zweiter Versand an denselben Lead wird abgewiesen'
);

select is(
  (select count(*)::int from public.leadgen_outreach where lead_id = 9000001),
  1,
  'und hinterlässt keine zweite Zeile im Protokoll'
);

-- Auch am Index vorbei geht es nicht.
select throws_ok(
  $$insert into public.leadgen_outreach (lead_id, state, subject, body, sent_at)
    values (9000001, 'sent', 'Direkt', 'Am RPC vorbei', now())$$,
  '23505',
  null,
  'leadgen_outreach_one_active_idx verhindert einen zweiten Versandeintrag'
);

-- ---------------------------------------------------------------------
-- Höchstens ein Entwurf je Lead.
-- ---------------------------------------------------------------------
insert into public.leadgen_outreach (lead_id, state, subject, body)
values (9000002, 'draft', 'Entwurf eins', 'Erster Entwurf');

select throws_ok(
  $$insert into public.leadgen_outreach (lead_id, state, subject, body)
    values (9000002, 'draft', 'Entwurf zwei', 'Zweiter Entwurf')$$,
  '23505',
  null,
  'ein zweiter Entwurf ersetzt den ersten, statt danebenzuliegen'
);

-- ---------------------------------------------------------------------
-- Die Löschregeln stehen in der Datenbank, nicht nur in der Mail.
-- ---------------------------------------------------------------------
select is(
  (
    select retention_days
    from public.retention_policies
    where record_type = 'leadgen_unhandled'
  ),
  90,
  'unbearbeitete Leads verfallen nach 90 Tagen — dieselbe Frist nennt die Mail'
);

select is(
  (
    select retention_days
    from public.retention_policies
    where record_type = 'leadgen_contacted'
  ),
  365,
  'angeschriebene Leads bleiben ein Jahr als Nachweis'
);

select finish();
rollback;
