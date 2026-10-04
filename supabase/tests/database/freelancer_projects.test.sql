-- Referenzprojekte: Grenzen, atomarer Austausch, nur der Dienst kommt heran.
-- Alles im Test wird zurückgerollt.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.freelancer_profiles (id, slug, display_name, role_title, skill_tags, languages, experience_summary)
values (
  'fb000000-0000-4000-8000-000000000001',
  'projects-database-test-profile',
  'Projects Test Profile',
  'Test Consultant',
  array['testing'],
  array['de'],
  'Database fixture used only inside this rolled-back pgTAP test.'
);

select is(
  public.replace_freelancer_projects(
    'fb000000-0000-4000-8000-000000000001',
    '[{"title":"Agent für Schadenmeldungen","industry":"Versicherungen","started_on":"2025-03-01","ongoing":true,
       "technologies":["LangChain","Python"],"source":"operator"},
      {"title":"Wissenssuche","source":"research","source_url":"https://example.com/projekt","is_public":false}]'::jsonb
  ),
  2,
  'zwei Projekte angelegt'
);
select is(
  (select array_agg(title order by position) from public.freelancer_projects where profile_id = 'fb000000-0000-4000-8000-000000000001'),
  array['Agent für Schadenmeldungen', 'Wissenssuche'],
  'Reihenfolge der Liste ist die Position'
);
select is(
  (select technologies from public.freelancer_projects where profile_id = 'fb000000-0000-4000-8000-000000000001' and position = 1),
  array['LangChain', 'Python'],
  'Technologien als Liste'
);

select throws_ok(
  $$select public.replace_freelancer_projects(
      'fb000000-0000-4000-8000-000000000001',
      '[{"title":"Gültig","source":"operator"},{"title":"Zeitraum verkehrt","started_on":"2025-05-01","ended_on":"2024-01-01","source":"operator"}]'::jsonb)$$,
  '23514',
  null,
  'ein ungültiger Eintrag scheitert'
);
select is(
  (select count(*)::int from public.freelancer_projects where profile_id = 'fb000000-0000-4000-8000-000000000001'),
  2,
  'nach dem Fehler bleibt die alte Liste'
);
select throws_ok(
  $$select public.replace_freelancer_projects('fb000000-0000-4000-8000-000000000001',
      (select jsonb_agg(jsonb_build_object('title', 'Projekt ' || n, 'source', 'operator')) from generate_series(1, 9) n))$$,
  '22023',
  null,
  'höchstens acht Projekte'
);
select throws_ok(
  $$insert into public.freelancer_projects (profile_id, position, title, source)
    values ('fb000000-0000-4000-8000-000000000001', 3, 'Ohne Quelle', 'research')$$,
  '23514',
  null,
  'recherchierte Einträge brauchen eine Quelle'
);
select throws_ok(
  $$insert into public.freelancer_projects (profile_id, position, title, source, link_url)
    values ('fb000000-0000-4000-8000-000000000001', 3, 'Unsicherer Link', 'operator', 'http://example.com')$$,
  '23514',
  null,
  'Links nur über https'
);

select throws_ok(
  $$update public.freelancer_profiles set profile_links = (select jsonb_agg(jsonb_build_object('kind', 'website', 'url', 'https://example.com/' || n)) from generate_series(1, 7) n)
    where id = 'fb000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'höchstens sechs Links'
);

select ok(
  not has_table_privilege('anon', 'public.freelancer_projects', 'select')
  and not has_table_privilege('authenticated', 'public.freelancer_projects', 'select')
  and has_table_privilege('service_role', 'public.freelancer_projects', 'insert'),
  'nur der Dienst liest und schreibt'
);
select ok(
  not has_function_privilege('authenticated', 'public.replace_freelancer_projects(uuid, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.replace_freelancer_projects(uuid, jsonb)', 'execute'),
  'nur der Dienst ersetzt Listen'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.freelancer_projects'::regclass),
  'RLS erzwungen'
);

delete from public.freelancer_profiles where id = 'fb000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.freelancer_projects where profile_id = 'fb000000-0000-4000-8000-000000000001'),
  0,
  'Projekte gehen mit dem Profil'
);

select * from finish();
rollback;
