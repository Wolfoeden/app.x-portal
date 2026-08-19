-- Freelancer self-registration with an operator verification step.
--
-- Applications are a staging area, never the catalogue: `freelancer_profiles`
-- stays service-role only and receives a row only when a named administrator
-- approves an application. Browsers therefore never touch either table; the
-- validated server routes write through the service role, exactly like
-- `whitelist_leads`.

create table public.freelancer_applications (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'submitted',
  submitted_by_user_id uuid references auth.users (id) on delete set null,

  full_name text not null,
  contact_email text not null,
  contact_phone text,
  website_url text,
  role_title text not null,
  experience_summary text not null,
  skills text[] not null default '{}'::text[],
  languages text[] not null default '{}'::text[],
  qualifications text[] not null default '{}'::text[],
  industries text[] not null default '{}'::text[],
  location_text text,
  work_modes text[] not null default array['remote']::text[],

  hourly_rate_minor bigint,
  day_rate_minor bigint,
  currency text,

  availability_status text not null default 'unknown',
  availability_from date,
  booking_url text,
  applicant_note text,

  cv_storage_path text,
  cv_original_filename text,
  cv_mime_type text,
  cv_size_bytes bigint,

  consent_at timestamptz not null,
  source text not null default 'apply_form',

  review_notes text,
  reviewed_by_user_id uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  published_profile_id uuid references public.freelancer_profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint freelancer_applications_status_check
    check (status in ('submitted', 'in_review', 'approved', 'rejected')),
  constraint freelancer_applications_full_name_check
    check (char_length(btrim(full_name)) between 2 and 120),
  constraint freelancer_applications_contact_email_check
    check (
      contact_email = lower(contact_email)
      and char_length(contact_email) between 3 and 160
      and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  constraint freelancer_applications_contact_phone_check
    check (contact_phone is null or char_length(btrim(contact_phone)) between 4 and 40),
  constraint freelancer_applications_website_url_check
    check (
      website_url is null
      or (website_url ~ '^https://' and char_length(website_url) <= 1000)
    ),
  constraint freelancer_applications_role_title_check
    check (char_length(btrim(role_title)) between 2 and 160),
  -- 2000, not the catalogue column's 4000: the profile schema in
  -- lib/domain/profile.ts parses the summary back at 2000 characters, so a
  -- longer text could not be published.
  constraint freelancer_applications_experience_summary_check
    check (char_length(btrim(experience_summary)) between 40 and 2000),
  constraint freelancer_applications_skills_check
    check (cardinality(skills) between 1 and 80),
  constraint freelancer_applications_languages_check
    check (cardinality(languages) between 1 and 20),
  constraint freelancer_applications_qualifications_check
    check (cardinality(qualifications) <= 40),
  constraint freelancer_applications_industries_check
    check (cardinality(industries) <= 40),
  constraint freelancer_applications_location_check
    check (location_text is null or char_length(btrim(location_text)) between 1 and 160),
  constraint freelancer_applications_work_modes_check
    check (
      cardinality(work_modes) between 1 and 3
      and work_modes <@ array['remote', 'on_site', 'hybrid']::text[]
    ),
  constraint freelancer_applications_hourly_rate_check
    check (hourly_rate_minor is null or (hourly_rate_minor > 0 and hourly_rate_minor <= 10000000)),
  constraint freelancer_applications_day_rate_check
    check (day_rate_minor is null or (day_rate_minor > 0 and day_rate_minor <= 100000000)),
  constraint freelancer_applications_currency_check
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint freelancer_applications_rate_currency_check
    check (
      (hourly_rate_minor is null and day_rate_minor is null and currency is null)
      or (
        currency is not null
        and (hourly_rate_minor is not null or day_rate_minor is not null)
      )
    ),
  constraint freelancer_applications_availability_status_check
    check (availability_status in ('available', 'limited', 'unavailable', 'unknown')),
  constraint freelancer_applications_booking_url_check
    check (
      booking_url is null
      or (booking_url ~ '^https://' and char_length(booking_url) <= 1000)
    ),
  constraint freelancer_applications_applicant_note_check
    check (applicant_note is null or char_length(btrim(applicant_note)) between 1 and 2000),
  -- Storage keys are minted by the server; the shape is asserted so a forged
  -- upload token can never smuggle an arbitrary object path into a review link.
  -- The `incoming/` prefix keeps applicant uploads clear of the published
  -- `<profile-uuid>/cv-v<version>.pdf` keys in the same bucket.
  constraint freelancer_applications_cv_storage_path_check
    check (
      cv_storage_path is null
      or cv_storage_path ~ '^incoming/[0-9a-f-]{36}/[0-9a-f]{32}\.pdf$'
    ),
  -- Matches `freelancer_cv_documents`: the file becomes the profile CV on
  -- approval, and that table accepts a `.pdf` filename only.
  constraint freelancer_applications_cv_filename_check
    check (
      cv_original_filename is null
      or (
        cv_original_filename = btrim(cv_original_filename)
        and char_length(cv_original_filename) between 5 and 255
        and cv_original_filename !~ '[[:cntrl:]/]'
        and position(E'\\' in cv_original_filename) = 0
        and lower(right(cv_original_filename, 4)) = '.pdf'
      )
    ),
  constraint freelancer_applications_cv_mime_check
    check (cv_mime_type is null or cv_mime_type = 'application/pdf'),
  constraint freelancer_applications_cv_size_check
    check (cv_size_bytes is null or (cv_size_bytes between 1 and 10485760)),
  constraint freelancer_applications_cv_completeness_check
    check (
      cv_storage_path is null
      or (
        cv_original_filename is not null
        and cv_mime_type is not null
        and cv_size_bytes is not null
      )
    ),
  constraint freelancer_applications_source_check
    check (source in ('apply_form')),
  constraint freelancer_applications_review_notes_check
    check (review_notes is null or char_length(btrim(review_notes)) between 1 and 4000),
  -- A decision always names its reviewer, and only an approval may point at a
  -- published catalogue row.
  constraint freelancer_applications_decision_check
    check (
      status in ('submitted', 'in_review')
      or (reviewed_at is not null and reviewed_by_user_id is not null)
    ),
  constraint freelancer_applications_published_profile_check
    check (published_profile_id is null or status = 'approved')
);

create index freelancer_applications_status_created_idx
  on public.freelancer_applications (status, created_at desc);
create index freelancer_applications_created_idx
  on public.freelancer_applications (created_at desc);
-- One open application per address: a re-submission replaces the pending one
-- instead of filling the review queue with duplicates.
create unique index freelancer_applications_open_email_uidx
  on public.freelancer_applications (contact_email)
  where status in ('submitted', 'in_review');
create index freelancer_applications_published_profile_idx
  on public.freelancer_applications (published_profile_id)
  where published_profile_id is not null;

alter table public.freelancer_applications enable row level security;
alter table public.freelancer_applications force row level security;

revoke all on public.freelancer_applications from public, anon, authenticated;
grant select, insert, update, delete on public.freelancer_applications to service_role;

create trigger freelancer_applications_set_updated_at
  before update on public.freelancer_applications
  for each row execute function private.set_updated_at();

-- Applicant CVs reuse the private `freelancer-cvs` bucket created in
-- 20260818130739_add_private_freelancer_cvs.sql under an `incoming/` prefix.
-- The bucket definition is deliberately NOT touched here: it is PDF-only at
-- 10 MiB for the published-profile download flow, and re-declaring it would
-- silently change those limits for that feature. Published profile CVs keep
-- their own `<profile-uuid>/cv-v<version>.pdf` keys in `freelancer_cv_documents`;
-- the two prefixes never overlap.
--
-- No storage policy is created: the browser only ever holds a short-lived
-- signed upload token, and reviewers read through a short-lived signed download
-- URL. Both are issued by the service role, which bypasses Storage RLS.

insert into public.retention_policies (
  record_type,
  retention_days,
  deletion_mode,
  is_enabled,
  notes
) values (
  'freelancer_applications',
  365,
  'operator_review',
  true,
  'Delete rejected freelancer applications together with the uploaded CV object once the review period has passed. Approved applications are retained as the provenance record for the published profile.'
)
on conflict (record_type) do update set
  retention_days = excluded.retention_days,
  deletion_mode = excluded.deletion_mode,
  is_enabled = excluded.is_enabled,
  notes = excluded.notes;
