begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_column(
  'public',
  'freelancer_profiles',
  'owner_user_id',
  'freelancer profiles can be linked to one authenticated owner'
);

select has_column(
  'public',
  'freelancer_profiles',
  'avatar_path',
  'freelancer profiles can reference a public avatar object'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'freelancer_profiles_owner_uidx'
      and indexdef like '%UNIQUE%'
  ),
  'one authenticated account cannot own multiple freelancer profiles'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'freelancer_applications_submitted_user_updated_idx'
  ),
  'the portal application lookup has a covering owner and recency index'
);

select has_table(
  'public',
  'freelancer_profile_events',
  'private freelancer profile analytics exist'
);

select ok(
  (
    select c.relrowsecurity and c.relforcerowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'freelancer_profile_events'
  ),
  'analytics has enabled and forced RLS'
);

select ok(
  not has_table_privilege('anon', 'public.freelancer_profile_events', 'SELECT')
  and not has_table_privilege('authenticated', 'public.freelancer_profile_events', 'SELECT')
  and not has_table_privilege('authenticated', 'public.freelancer_profile_events', 'INSERT'),
  'browser roles cannot inspect or forge profile analytics'
);

select ok(
  has_table_privilege('service_role', 'public.freelancer_profile_events', 'SELECT')
  and has_table_privilege('service_role', 'public.freelancer_profile_events', 'INSERT')
  and has_table_privilege('service_role', 'public.freelancer_profile_events', 'DELETE'),
  'the trusted service can maintain profile analytics'
);

-- Der Bucket war oeffentlich, bis private_freelancer_avatars.sql ihn am
-- 28.08.2026 geschlossen hat: ein Portraitfoto ist ein personenbezogenes
-- Datum, und ein nicht erratbarer Pfad ist Auffindbarkeit, kein Zugriffs-
-- schutz. Abgerufen wird seitdem ueber /api/freelancer/avatar-image/… mit
-- einer kurzlebigen signierten URL, wie beim Lebenslauf nebenan.
select is(
  (select public from storage.buckets where id = 'freelancer-avatars'),
  false,
  'freelancer avatars are private and reached through a signed URL'
);

select is(
  (select file_size_limit from storage.buckets where id = 'freelancer-avatars'),
  5242880::bigint,
  'avatars are limited to five MiB'
);

select is(
  (select allowed_mime_types from storage.buckets where id = 'freelancer-avatars'),
  array['image/jpeg', 'image/png', 'image/webp']::text[],
  'only JPEG, PNG and WebP avatars are accepted'
);

select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') like '%freelancer-avatars%'
        or coalesce(with_check, '') like '%freelancer-avatars%'
      )
  ),
  0::bigint,
  'no browser Storage write policy exists for freelancer avatars'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.delete_freelancer_profile_cascade(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.delete_freelancer_profile_cascade(uuid)',
    'EXECUTE'
  ),
  'only the service role can execute profile cascade deletion'
);

select * from finish();
rollback;
