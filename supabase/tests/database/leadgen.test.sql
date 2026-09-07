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
      'Kubernetes (Remote)', null, null, 'open', null, 50, 0
    )
    where id = 9000001
  ),
  1,
  'ein Suchbegriff mit Komma und Klammern findet die Zeile, statt zu zerbrechen'
);

select is(
  (
    select count(*)::int
    from public.admin_list_leadgen_queue(null, null, null, 'open', null, 50, 0)
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
      'e1111111-1111-4111-8111-111111111111',
      'https://x-portal.eu/chat?q=Kubernetes', 'admin'
    )
  ),
  true,
  'der erste Lauf bekommt den Anspruch'
);

select is(
  (
    select reason
    from public.claim_leadgen_outreach(
      9000001, 'Betreff', 'Rumpf', null, null, null, null, null
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
    from public.admin_list_leadgen_queue(null, null, null, 'open', null, 50, 0)
    where id = 9000001
  ),
  0,
  'ein angeschriebener Lead taucht in der offenen Ansicht nicht mehr auf'
);

select is(
  (
    select count(*)::int
    from public.admin_list_leadgen_queue(null, null, null, 'archived', null, 50, 0)
    where id = 9000001
  ),
  1,
  'im Archiv ist er dafür zu finden'
);

select is(
  (
    select reason
    from public.claim_leadgen_outreach(
      9000001, 'Zweiter Betreff', 'Zweiter Rumpf', null, null, null, null, null
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

-- Der Beleg zur Nachricht ist vollstaendig: Portal-Link und Herkunft
-- stehen in derselben Zeile wie der Wortlaut.
select is(
  (
    select cta_url
      from public.leadgen_outreach
     where lead_id = 9000001
  ),
  'https://x-portal.eu/chat?q=Kubernetes',
  'der Portal-Link aus der Mail steht im Beleg'
);

select is(
  (
    select origin
      from public.leadgen_outreach
     where lead_id = 9000001
  ),
  'admin',
  'und wer den Versand angestossen hat'
);

select throws_ok(
  $$update public.leadgen_outreach
       set origin = 'irgendwer'
     where lead_id = 9000001$$,
  '23514',
  null,
  'eine erfundene Herkunft verletzt leadgen_outreach_origin_check'
);

-- ---------------------------------------------------------------------
-- Das Protokoll der Laeufe gehoert dem Dienst, nicht dem Browser.
-- ---------------------------------------------------------------------
select ok(
  (
    select relrowsecurity and relforcerowsecurity
      from pg_catalog.pg_class
     where oid = 'public.leadgen_run'::regclass
  ),
  'leadgen_run steht unter Row Level Security, auch fuer den Eigentuemer'
);

select is(
  (
    select count(*)::int
      from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name = 'leadgen_run'
       and grantee in ('anon', 'authenticated')
  ),
  0,
  'weder anon noch authenticated duerfen die Laeufe lesen'
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
-- Vorbereiten und Versenden sind zwei Vorgaenge.
-- ---------------------------------------------------------------------
insert into public.leadgen_queue (id, recipient_email, stellenanzeige, status)
overriding system value
values (9000003, 'vorbereitet@example.invalid', 'React Engineer gesucht', 'new');

-- Ein Entwurf, wie ihn der Abgleich hinterlaesst: mit Portal-Link, dem
-- angebotenen Profil und dem Zeitpunkt, an dem er entstand.
insert into public.leadgen_outreach (
  lead_id, state, subject, body, cta_url, origin,
  prepared_profile_id, prepared_at
)
values (
  9000003, 'draft', 'Vorbereitet', 'Rumpf des Entwurfs',
  'https://x-portal.eu/chat?q=React', 'scheduler',
  '22222222-2222-4222-8222-222222222222', now() - interval '1 hour'
);

select is(
  (
    select count(*)::int
      from public.list_leadgen_prepared_drafts(50)
     where lead_id = 9000003
  ),
  1,
  'ein vorbereiteter Entwurf steht in der Liste fuer den Versand'
);

-- Ein von Hand erzeugter Entwurf wartet auf den Betreiber, nicht auf den
-- Zeitgeber. Er darf nicht im Stapel des Tageslaufs auftauchen.
select is(
  (
    select count(*)::int
      from public.list_leadgen_prepared_drafts(50)
     where lead_id = 9000002
  ),
  0,
  'ein Entwurf ohne Herkunft scheduler bleibt dem Tageslauf verborgen'
);

select is(
  (
    select claimed
      from public.claim_leadgen_draft(
        (select id from public.leadgen_outreach where lead_id = 9000003)
      )
  ),
  true,
  'der Versand beansprucht den Entwurf und macht daraus sending'
);

select is(
  (select state from public.leadgen_outreach where lead_id = 9000003),
  'sending',
  'und der Zustand steht danach auf sending'
);

select is(
  (
    select count(*)::int
      from public.list_leadgen_prepared_drafts(50)
     where lead_id = 9000003
  ),
  0,
  'ein beanspruchter Entwurf wird kein zweites Mal ausgegeben'
);

-- ---------------------------------------------------------------------
-- Ein Entwurf, der nicht mehr traegt, gibt den Lead zurueck.
-- ---------------------------------------------------------------------
insert into public.leadgen_queue (id, recipient_email, stellenanzeige, status)
overriding system value
values (9000004, 'verworfen@example.invalid', 'Verfallener Entwurf', 'new');

insert into public.leadgen_outreach (
  lead_id, state, subject, body, origin, prepared_at
)
values (
  9000004, 'draft', 'Zu alt', 'Rumpf', 'scheduler',
  now() - interval '30 days'
);

select is(
  (
    select public.discard_leadgen_draft(
      (select id from public.leadgen_outreach where lead_id = 9000004),
      'draft_expired'
    )
  ),
  true,
  'ein verfallener Entwurf laesst sich verwerfen'
);

select is(
  (select count(*)::int from public.leadgen_outreach where lead_id = 9000004),
  0,
  'und hinterlaesst keine Zeile'
);

select is(
  (
    select status || ':' || coalesce(archived_at::text, 'offen')
      from public.leadgen_queue
     where id = 9000004
  ),
  'new:offen',
  'der Lead steht danach wieder offen in der Warteschlange'
);

-- ---------------------------------------------------------------------
-- Der Trichter zaehlt das Vorbereitete getrennt.
-- ---------------------------------------------------------------------
select ok(
  (public.admin_leadgen_pipeline_summary() ? 'vorbereitet'),
  'der Trichter nennt die vorbereiteten Entwuerfe'
);

-- ---------------------------------------------------------------------
-- Das Laufprotokoll unterscheidet Abgleich und Versand.
-- ---------------------------------------------------------------------
select throws_ok(
  $$insert into public.leadgen_run (
      started_at, trigger, kind, stopped_by
    ) values (now(), 'scheduler', 'irgendwas', 'time')$$,
  '23514',
  null,
  'eine erfundene Art des Durchgangs verletzt leadgen_run_kind_check'
);

select lives_ok(
  $$insert into public.leadgen_run (
      started_at, trigger, kind, stopped_by
    ) values (now(), 'scheduler', 'prepare', 'nothing_prepared')$$,
  'prepare und nothing_prepared sind zulaessige Werte'
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

-- ---------------------------------------------------------------------
-- Eine Suche ohne Konto: die Zeile, die aus einem Lead entsteht.
-- ---------------------------------------------------------------------
-- Diese Faelle waren offen, als der Abgleich zum ersten Mal wirklich schrieb.
-- Ein Probelauf legt keine Zeilen an und hat sie deshalb nicht gefunden.
insert into public.leadgen_queue (id, recipient_email, stellenanzeige, status)
overriding system value
values (9000005, 'nachfrage@example.invalid', 'Rolle ohne Konto', 'new');

select lives_ok(
  $$insert into public.shortlists (
      source, lead_id, project_id, owner_user_id, demand_actor,
      matching_rule_version, brief_snapshot, result_count,
      profile_catalog_version, result_status, decision_snapshot
    ) values (
      'lead', 9000005, null, null, 'pseudonym-fuer-den-test',
      'freelancer-match-v14', '{"rolle": "Test"}'::jsonb, 1,
      'katalog-abc', 'ranked', '{"schemaVersion": 2}'::jsonb
    )$$,
  'eine Shortlist aus einem Lead laesst sich anlegen, obwohl sie kein Konto hat'
);

-- Der Audit-Trigger haengt daran: Ohne Konto braucht das Ereignis einen
-- Grabstein, sonst schlaegt audit_events_actor_check zu und nimmt den
-- ganzen Insert mit.
select is(
  (
    select actor_tombstone
      from public.audit_events
     where action = 'shortlist_created'
       and target_id = (
         select id from public.shortlists where lead_id = 9000005
       )
  ),
  'system:leadgen-match',
  'das Protokoll nennt den Vorgang, statt ein Konto zu erfinden'
);

select is(
  (
    select metadata ->> 'source'
      from public.audit_events
     where action = 'shortlist_created'
       and target_id = (
         select id from public.shortlists where lead_id = 9000005
       )
  ),
  'lead',
  'und haelt die Herkunft fest'
);

-- Der Lead muss loeschbar bleiben. `run_leadgen_cleanup()` raeumt die
-- Warteschlange nach Ablauf der Aufbewahrungsfrist; ein Formcheck, der das
-- verhindert, haelt die naechtliche Routine an.
select lives_ok(
  $$delete from public.leadgen_queue where id = 9000005$$,
  'ein Lead mit Nachfragezeile laesst sich loeschen'
);

select is(
  (
    select lead_id is null
      from public.shortlists
     where demand_actor = 'pseudonym-fuer-den-test'
  ),
  true,
  'die Nachfrage bleibt stehen, die Lead-Kennung faellt weg'
);

-- Streng bleibt sie trotzdem: Konto und Projekt gehoeren nicht in eine
-- Zeile aus der Akquise.
select throws_ok(
  $$insert into public.shortlists (
      source, lead_id, project_id, owner_user_id, demand_actor,
      matching_rule_version, brief_snapshot, result_count,
      profile_catalog_version, result_status, decision_snapshot
    ) values (
      'lead', null, null, 'e1111111-1111-4111-8111-111111111111',
      'pseudonym-zwei', 'freelancer-match-v14', '{}'::jsonb, 0,
      'katalog-abc', 'no_reliable_match', '{"schemaVersion": 2}'::jsonb
    )$$,
  '23514',
  null,
  'eine Lead-Zeile mit Konto verletzt shortlists_source_shape_check'
);

select finish();
rollback;
