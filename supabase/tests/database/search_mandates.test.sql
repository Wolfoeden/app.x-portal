-- Suchaufträge: Stati, ein offener Auftrag je Projekt, nur der Dienst kommt heran.
-- Alles im Test wird zurückgerollt.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '33333333-3333-4333-8333-333333333333',
  'authenticated', 'authenticated', 'mandate-guest@example.invalid', '',
  now(), now(), now()
);

insert into public.projects (id, owner_user_id, original_request)
values (
  '33333333-0000-4000-8000-000000000001',
  '33333333-3333-4333-8333-333333333333',
  'Suchauftrag-Fixture'
);

select lives_ok(
  $$insert into public.search_mandates (project_id, owner_user_id, contact_email, contact_company, terms_version)
    values ('33333333-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333',
            'kunde@example.invalid', 'Beispiel GmbH', 'vermittlung-2026-09-1')$$,
  'Auftrag lässt sich anlegen'
);
select is(
  (select status from public.search_mandates where project_id = '33333333-0000-4000-8000-000000000001'),
  'open',
  'neuer Auftrag ist offen'
);
select throws_ok(
  $$insert into public.search_mandates (project_id, owner_user_id, contact_email, terms_version)
    values ('33333333-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333',
            'kunde@example.invalid', 'vermittlung-2026-09-1')$$,
  '23505',
  null,
  'höchstens ein offener Auftrag je Projekt'
);
select throws_ok(
  $$update public.search_mandates set status = 'bezahlt' where project_id = '33333333-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'unbekannter Stand wird abgelehnt'
);
select throws_ok(
  $$insert into public.search_mandates (project_id, owner_user_id, contact_email, terms_version)
    values ('33333333-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'keine-adresse', 'v')$$,
  '23514',
  null,
  'ungültige Adresse wird abgelehnt'
);
select lives_ok(
  $$update public.search_mandates set status = 'closed' where project_id = '33333333-0000-4000-8000-000000000001';
    insert into public.search_mandates (project_id, owner_user_id, contact_email, terms_version)
    values ('33333333-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333',
            'kunde@example.invalid', 'vermittlung-2026-09-1')$$,
  'nach dem Abschluss ist ein neuer Auftrag möglich'
);

select ok(
  not has_table_privilege('anon', 'public.search_mandates', 'select')
  and not has_table_privilege('authenticated', 'public.search_mandates', 'select')
  and not has_table_privilege('authenticated', 'public.search_mandates', 'insert')
  and has_table_privilege('service_role', 'public.search_mandates', 'insert'),
  'nur der Dienst liest und schreibt'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.search_mandates'::regclass),
  'RLS erzwungen'
);

delete from public.projects where id = '33333333-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.search_mandates where project_id = '33333333-0000-4000-8000-000000000001'),
  0,
  'Aufträge gehen mit dem Projekt'
);

select * from finish();
rollback;
