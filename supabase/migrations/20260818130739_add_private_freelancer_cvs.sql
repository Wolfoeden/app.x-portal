-- Freelancer CVs are sensitive documents. The browser never receives direct
-- table or bucket access; trusted server routes use the service role and issue
-- short-lived signed URLs only after application-level authorization.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'freelancer-cvs',
  'freelancer-cvs',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.freelancer_cv_documents (
  profile_id uuid primary key
    references public.freelancer_profiles (id) on delete cascade,
  storage_bucket text not null default 'freelancer-cvs',
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null default 'application/pdf',
  byte_size bigint not null,
  version bigint not null default 1,
  is_downloadable boolean not null default false,
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint freelancer_cv_documents_storage_bucket_check
    check (storage_bucket = 'freelancer-cvs'),
  constraint freelancer_cv_documents_storage_path_check
    check (
      storage_path =
        profile_id::text || '/cv-v' || version::text || '.pdf'
    ),
  constraint freelancer_cv_documents_original_filename_check
    check (
      original_filename = btrim(original_filename)
      and char_length(original_filename) between 5 and 255
      and original_filename !~ '[[:cntrl:]/]'
      and position(E'\\' in original_filename) = 0
      and lower(right(original_filename, 4)) = '.pdf'
    ),
  constraint freelancer_cv_documents_mime_type_check
    check (mime_type = 'application/pdf'),
  constraint freelancer_cv_documents_byte_size_check
    check (byte_size between 1 and 10485760),
  constraint freelancer_cv_documents_version_check
    check (version > 0),
  constraint freelancer_cv_documents_timestamps_check
    check (updated_at >= uploaded_at)
);

comment on table public.freelancer_cv_documents is
  'Service-role-only metadata for private freelancer CV objects.';

alter table public.freelancer_cv_documents enable row level security;
alter table public.freelancer_cv_documents force row level security;

revoke all privileges on table public.freelancer_cv_documents from public;
revoke all privileges on table public.freelancer_cv_documents
  from anon, authenticated, service_role;
grant select, insert, update, delete
  on table public.freelancer_cv_documents to service_role;

create trigger freelancer_cv_documents_set_updated_at
  before update on public.freelancer_cv_documents
  for each row execute function private.set_updated_at();

-- No storage.objects policy is created for freelancer-cvs. Private buckets
-- deny browser uploads/downloads by default, while the server-side service key
-- bypasses Storage RLS for controlled administration and signed downloads.
