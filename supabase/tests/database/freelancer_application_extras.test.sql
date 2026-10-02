-- Bewerbung mit Projekten und Foto: Form der Spalten. Alles wird zurückgerollt.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_column('public', 'freelancer_applications', 'reference_projects', 'Projekte der Bewerbung');
select col_not_null('public', 'freelancer_applications', 'reference_projects', 'Projekte sind nie null');
select has_column('public', 'freelancer_applications', 'photo_storage_path', 'Foto der Bewerbung');

insert into public.freelancer_applications (
  id, full_name, contact_email, role_title, experience_summary, skills, languages, consent_at,
  reference_projects, photo_storage_path
) values (
  'fa000000-0000-4000-8000-000000000001',
  'Extras Test',
  'extras-test@example.com',
  'Test Consultant',
  'Database fixture used only inside this rolled-back pgTAP test.',
  array['testing'],
  array['de'],
  now(),
  '[{"title":"Wissenssuche","technologies":["RAG"],"isPublic":true}]'::jsonb,
  'incoming/0b5c2b9e-3c55-4a43-9a7e-2f1d6c7a8b90/avatar-0123456789abcdef0123456789abcdef.webp'
);

select is(
  (select jsonb_array_length(reference_projects) from public.freelancer_applications where id = 'fa000000-0000-4000-8000-000000000001'),
  1,
  'ein Projekt gespeichert'
);

insert into public.freelancer_applications (
  id, full_name, contact_email, role_title, experience_summary, skills, languages, consent_at
) values (
  'fa000000-0000-4000-8000-000000000002',
  'Extras Default',
  'extras-default@example.com',
  'Test Consultant',
  'Database fixture used only inside this rolled-back pgTAP test.',
  array['testing'],
  array['de'],
  now()
);
select ok(
  (select reference_projects = '[]'::jsonb and photo_storage_path is null
     from public.freelancer_applications where id = 'fa000000-0000-4000-8000-000000000002'),
  'ohne Angaben: leere Liste, kein Foto'
);

select throws_ok(
  $$update public.freelancer_applications
       set reference_projects = (select jsonb_agg(jsonb_build_object('title', 'Projekt ' || n)) from generate_series(1, 9) n)
     where id = 'fa000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'höchstens acht Projekte'
);
select throws_ok(
  $$update public.freelancer_applications set reference_projects = '{"title":"kein Array"}'::jsonb
     where id = 'fa000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'Projekte sind eine Liste'
);
select throws_ok(
  $$update public.freelancer_applications set reference_projects = jsonb_build_array(jsonb_build_object('title', repeat('x', 40001)))
     where id = 'fa000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'die Liste bleibt klein'
);
select throws_ok(
  $$update public.freelancer_applications
       set photo_storage_path = '0b5c2b9e-3c55-4a43-9a7e-2f1d6c7a8b90/avatar-0123456789abcdef0123456789abcdef.webp'
     where id = 'fa000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'ein Bewerbungsfoto liegt nie im ausgelieferten Profilpfad'
);
select throws_ok(
  $$update public.freelancer_applications
       set photo_storage_path = 'incoming/0b5c2b9e-3c55-4a43-9a7e-2f1d6c7a8b90/avatar-0123456789abcdef0123456789abcdef.svg'
     where id = 'fa000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'nur JPEG, PNG oder WebP'
);

select * from finish();
rollback;
