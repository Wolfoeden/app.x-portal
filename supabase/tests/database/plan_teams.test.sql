-- Acceptance tests for plan tiers and plan teams. Alle Fixtures rollen zurueck.
--
-- Geprueft werden genau die Zusagen, die die Oberflaeche macht: eine
-- Gastsitzung traegt keinen gekauften Plan, ein Konto gehoert zu hoechstens
-- einem Team, und es entsteht keine Kette, an deren Ende nicht mehr
-- feststeht, wer zahlt.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, is_anonymous,
  email_confirmed_at, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'b2000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'team-owner@example.invalid', '', false,
    now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b2000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'team-member@example.invalid', '', false,
    now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b2000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'team-other@example.invalid', '', false,
    now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b2000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', null, '', true,
    now(), now(), now()
  );

-- ---------------------------------------------------------------- Stufen ---

-- Genau der Fall, der die erste Fassung brach: get_ai_credit_snapshot legt
-- ein Konto ohne plan_id an. Der Spalten-Default ist 'free', der Constraint
-- verlangt bei einer Gastsitzung 'guest'. Ohne den normalisierenden Trigger
-- bekam damit keine neue Gastsitzung mehr ein Guthabenkonto.
select lives_ok(
  $$insert into public.user_ai_credit_accounts (
      user_id, is_anonymous, credits_total, credits_used, credits_reserved
    ) values ('b2000000-0000-4000-8000-000000000004', true, 100, 0, 0)$$,
  'ein neues Gastkonto entsteht ohne ausdrueckliche Stufe'
);

select is(
  (select plan_id from public.user_ai_credit_accounts
    where user_id = 'b2000000-0000-4000-8000-000000000004'),
  'guest',
  'die Gaststufe folgt aus der Anonymitaet, nicht aus dem Default'
);

insert into public.user_ai_credit_accounts (
  user_id, is_anonymous, credits_total, credits_used, credits_reserved
) values
  ('b2000000-0000-4000-8000-000000000001', false, 1500, 0, 0);

select is(
  (select plan_id from public.user_ai_credit_accounts
    where user_id = 'b2000000-0000-4000-8000-000000000001'),
  'free',
  'ein neues Konto steht auf der Gratisstufe'
);

select lives_ok(
  $$update public.user_ai_credit_accounts set plan_id = 'enterprise'
     where user_id = 'b2000000-0000-4000-8000-000000000001'$$,
  'ein Konto darf die gekaufte Stufe tragen'
);

select throws_ok(
  $$update public.user_ai_credit_accounts set plan_id = 'starter'
     where user_id = 'b2000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'eine unbekannte Stufe wird abgelehnt'
);

-- Der Trigger normalisiert, statt die Zeile abzulehnen: eine Gastsitzung
-- bleibt auf der Gaststufe, egal was geschrieben wird.
select lives_ok(
  $$update public.user_ai_credit_accounts set plan_id = 'enterprise'
     where user_id = 'b2000000-0000-4000-8000-000000000004'$$,
  'ein Schreibversuch auf eine Gastsitzung laeuft nicht in einen Fehler'
);

select is(
  (select plan_id from public.user_ai_credit_accounts
    where user_id = 'b2000000-0000-4000-8000-000000000004'),
  'guest',
  'eine Gastsitzung traegt danach trotzdem keinen gekauften Plan'
);

-- ------------------------------------------------------------------ Team ---

select lives_ok(
  $$insert into public.plan_team_members (owner_user_id, member_user_id)
    values ('b2000000-0000-4000-8000-000000000001',
            'b2000000-0000-4000-8000-000000000002')$$,
  'ein angemeldetes Konto laesst sich aufnehmen'
);

select throws_ok(
  $$insert into public.plan_team_members (owner_user_id, member_user_id)
    values ('b2000000-0000-4000-8000-000000000001',
            'b2000000-0000-4000-8000-000000000004')$$,
  '42501',
  null,
  'eine Gastsitzung kann kein Teammitglied sein'
);

select throws_ok(
  $$insert into public.plan_team_members (owner_user_id, member_user_id)
    values ('b2000000-0000-4000-8000-000000000003',
            'b2000000-0000-4000-8000-000000000002')$$,
  '23505',
  null,
  'ein Konto gehoert zu hoechstens einem Team'
);

select throws_ok(
  $$insert into public.plan_team_members (owner_user_id, member_user_id)
    values ('b2000000-0000-4000-8000-000000000002',
            'b2000000-0000-4000-8000-000000000003')$$,
  '42501',
  null,
  'ein Mitglied kann nicht selbst Inhaber werden'
);

select throws_ok(
  $$insert into public.plan_team_members (owner_user_id, member_user_id)
    values ('b2000000-0000-4000-8000-000000000001',
            'b2000000-0000-4000-8000-000000000001')$$,
  '23514',
  null,
  'niemand laedt sich selbst ein'
);

-- ------------------------------------------------------------------- RLS ---

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"b2000000-0000-4000-8000-000000000003","role":"authenticated"}';

select is(
  (select count(*)::int from public.plan_team_members),
  0,
  'ein fremdes Konto sieht keine Mitgliedschaft'
);

set local request.jwt.claims to
  '{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.plan_team_members),
  1,
  'der Inhaber sieht sein Team'
);

set local request.jwt.claims to
  '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from public.plan_team_members),
  1,
  'das Mitglied sieht seine eigene Zugehoerigkeit'
);

select throws_ok(
  $$delete from public.plan_team_members$$,
  '42501',
  null,
  'ein Mitglied kann sich nicht selbst aus der Tabelle loeschen'
);

reset role;
select * from finish();
rollback;
