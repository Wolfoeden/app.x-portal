begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(
  exists (
    select 1
    from storage.buckets
    where id = 'freelancer-cvs'
      and name = 'freelancer-cvs'
  ),
  'the freelancer CV bucket exists'
);

select is(
  (select public from storage.buckets where id = 'freelancer-cvs'),
  false,
  'the freelancer CV bucket is private'
);

select is(
  (select file_size_limit from storage.buckets where id = 'freelancer-cvs'),
  10485760::bigint,
  'the freelancer CV bucket rejects files larger than 10 MiB'
);

select is(
  (select allowed_mime_types from storage.buckets where id = 'freelancer-cvs'),
  array['application/pdf']::text[],
  'the freelancer CV bucket accepts PDF MIME types only'
);

select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') like '%freelancer-cvs%'
        or coalesce(with_check, '') like '%freelancer-cvs%'
      )
  ),
  0::bigint,
  'no browser Storage policy exposes the private freelancer CV bucket'
);

select has_table(
  'public',
  'freelancer_cv_documents',
  'the freelancer CV metadata table exists'
);

select is(
  (
    select confdeltype::text
    from pg_constraint
    where conrelid = 'public.freelancer_cv_documents'::regclass
      and conname = 'freelancer_cv_documents_profile_id_fkey'
  ),
  'r',
  'a freelancer profile cannot be deleted before its private CV metadata is removed'
);

select ok(
  (
    select c.relrowsecurity and c.relforcerowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'freelancer_cv_documents'
      and c.relkind = 'r'
  ),
  'freelancer CV metadata has enabled and forced RLS'
);

select ok(
  not has_table_privilege('anon', 'public.freelancer_cv_documents', 'SELECT')
  and not has_table_privilege('anon', 'public.freelancer_cv_documents', 'INSERT')
  and not has_table_privilege('anon', 'public.freelancer_cv_documents', 'UPDATE')
  and not has_table_privilege('anon', 'public.freelancer_cv_documents', 'DELETE'),
  'the anon role has no freelancer CV metadata privileges'
);

select ok(
  not has_table_privilege('authenticated', 'public.freelancer_cv_documents', 'SELECT')
  and not has_table_privilege('authenticated', 'public.freelancer_cv_documents', 'INSERT')
  and not has_table_privilege('authenticated', 'public.freelancer_cv_documents', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.freelancer_cv_documents', 'DELETE'),
  'the authenticated role has no freelancer CV metadata privileges'
);

select ok(
  has_table_privilege('service_role', 'public.freelancer_cv_documents', 'SELECT')
  and has_table_privilege('service_role', 'public.freelancer_cv_documents', 'INSERT')
  and has_table_privilege('service_role', 'public.freelancer_cv_documents', 'UPDATE')
  and has_table_privilege('service_role', 'public.freelancer_cv_documents', 'DELETE'),
  'the service role has CRUD privileges on freelancer CV metadata'
);

select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and tablename = 'freelancer_cv_documents'
  ),
  0::bigint,
  'the service-only metadata table has no browser RLS policies'
);

insert into public.freelancer_profiles (
  id,
  slug,
  display_name,
  role_title,
  skill_tags,
  languages,
  experience_summary
) values (
  'fc000000-0000-4000-8000-000000000001',
  'cv-database-test-profile',
  'CV Database Test Profile',
  'Test Consultant',
  array['testing'],
  array['de'],
  'Database fixture used only inside this rolled-back pgTAP test.'
);

set local role service_role;

select throws_ok(
  $$
    insert into public.freelancer_cv_documents (
      profile_id,
      storage_path,
      original_filename,
      byte_size
    ) values (
      'fc000000-0000-4000-8000-000000000001',
      'fc000000-0000-4000-8000-000000000099/cv-v1.pdf',
      'Wrong-Profile.pdf',
      1024
    )
  $$,
  '23514',
  null,
  'freelancer CV metadata cannot point at another profile path'
);

select throws_ok(
  $$
    insert into public.freelancer_cv_documents (
      profile_id,
      storage_path,
      original_filename,
      mime_type,
      byte_size
    ) values (
      'fc000000-0000-4000-8000-000000000001',
      'fc000000-0000-4000-8000-000000000001/not-a-pdf.pdf',
      'Not-A-PDF.pdf',
      'text/plain',
      1024
    )
  $$,
  '23514',
  null,
  'freelancer CV metadata rejects non-PDF MIME types'
);

select throws_ok(
  $$
    insert into public.freelancer_cv_documents (
      profile_id,
      storage_path,
      original_filename,
      byte_size
    ) values (
      'fc000000-0000-4000-8000-000000000001',
      'fc000000-0000-4000-8000-000000000001/oversized.pdf',
      'Oversized.pdf',
      10485761
    )
  $$,
  '23514',
  null,
  'freelancer CV metadata rejects files larger than 10 MiB'
);

select lives_ok(
  $$
    insert into public.freelancer_cv_documents (
      profile_id,
      storage_path,
      original_filename,
      byte_size,
      is_downloadable
    ) values (
      'fc000000-0000-4000-8000-000000000001',
      'fc000000-0000-4000-8000-000000000001/cv-v1.pdf',
      'Freelancer-CV.pdf',
      1024,
      true
    )
  $$,
  'the service role can create valid freelancer CV metadata'
);

reset role;
set local role anon;

select throws_ok(
  $$ select * from public.freelancer_cv_documents $$,
  '42501',
  'permission denied for table freelancer_cv_documents',
  'the anon role cannot read freelancer CV metadata'
);

reset role;
set local role authenticated;

select throws_ok(
  $$ select * from public.freelancer_cv_documents $$,
  '42501',
  'permission denied for table freelancer_cv_documents',
  'the authenticated role cannot read freelancer CV metadata'
);

reset role;
select * from finish();
rollback;
