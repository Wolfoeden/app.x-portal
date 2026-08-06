-- X Portal freelancer V1
-- Managed Supabase (EU project selected in the Supabase Dashboard).
-- This migration is intentionally payment-free. Supabase Studio/Table Editor is
-- the only V1 operator interface.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

-- New objects are private until this migration grants the minimum Data API
-- privileges explicitly. This matches Supabase's 2026 opt-in API exposure.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale text not null default 'de-DE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_display_name_check
    check (display_name is null or char_length(btrim(display_name)) between 1 and 120),
  constraint user_profiles_locale_check
    check (locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$')
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  original_request text not null,
  structured_brief jsonb,
  brief_status text not null default 'pending',
  brief_schema_version text not null default 'freelancer-brief-v1',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_title_check
    check (title is null or char_length(btrim(title)) between 1 and 180),
  constraint projects_original_request_check
    check (char_length(btrim(original_request)) between 1 and 20000),
  constraint projects_structured_brief_check
    check (
      structured_brief is null
      or (
        jsonb_typeof(structured_brief) = 'object'
        and octet_length(structured_brief::text) <= 32768
      )
    ),
  constraint projects_brief_status_check
    check (brief_status in ('pending', 'ready', 'failed', 'manual')),
  constraint projects_brief_schema_version_check
    check (char_length(btrim(brief_schema_version)) between 1 and 80),
  constraint projects_status_check
    check (status in (
      'draft', 'matching', 'shortlisted', 'intro_requested',
      'active', 'completed', 'cancelled', 'archived'
    ))
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  content text not null,
  structured_payload jsonb not null default '{}'::jsonb,
  client_message_id text,
  created_at timestamptz not null default now(),
  constraint messages_role_check check (role in ('user', 'assistant')),
  constraint messages_content_check
    check (char_length(btrim(content)) between 1 and 12000),
  constraint messages_structured_payload_check
    check (
      jsonb_typeof(structured_payload) = 'object'
      and octet_length(structured_payload::text) <= 32768
    ),
  constraint messages_client_message_id_check
    check (
      client_message_id is null
      or char_length(btrim(client_message_id)) between 8 and 160
    )
);

create unique index messages_project_client_message_uidx
  on public.messages (project_id, client_message_id)
  where client_message_id is not null;

create table public.freelancer_profiles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  role_title text not null,
  skill_tags text[] not null default '{}'::text[],
  languages text[] not null default '{}'::text[],
  location_text text,
  work_modes text[] not null default array['remote']::text[],
  experience_summary text not null,
  verified_facts text[] not null default '{}'::text[],
  self_reported_facts text[] not null default '{}'::text[],
  references_summary text,
  verification_status text not null default 'unverified',
  hourly_rate_minor bigint,
  day_rate_minor bigint,
  currency text,
  profile_status text not null default 'paused',
  availability_status text not null default 'unknown',
  availability_from date,
  availability_updated_at timestamptz not null default now(),
  intro_policy text not null default 'free',
  booking_url text,
  demo_status text not null default 'demo',
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint freelancer_profiles_slug_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint freelancer_profiles_display_name_check
    check (char_length(btrim(display_name)) between 1 and 120),
  constraint freelancer_profiles_role_title_check
    check (char_length(btrim(role_title)) between 1 and 160),
  constraint freelancer_profiles_skill_tags_check
    check (cardinality(skill_tags) between 1 and 80),
  constraint freelancer_profiles_languages_check
    check (cardinality(languages) between 1 and 20),
  constraint freelancer_profiles_location_check
    check (location_text is null or char_length(btrim(location_text)) between 1 and 160),
  constraint freelancer_profiles_work_modes_check
    check (
      cardinality(work_modes) between 1 and 3
      and work_modes <@ array['remote', 'on_site', 'hybrid']::text[]
    ),
  constraint freelancer_profiles_experience_summary_check
    check (char_length(btrim(experience_summary)) between 1 and 4000),
  constraint freelancer_profiles_facts_size_check
    check (
      cardinality(verified_facts) <= 40
      and cardinality(self_reported_facts) <= 40
    ),
  constraint freelancer_profiles_references_summary_check
    check (
      references_summary is null
      or char_length(btrim(references_summary)) between 1 and 2000
    ),
  constraint freelancer_profiles_verification_status_check
    check (verification_status in (
      'unverified', 'identity_checked', 'references_checked', 'operator_verified'
    )),
  constraint freelancer_profiles_hourly_rate_check
    check (hourly_rate_minor is null or hourly_rate_minor > 0),
  constraint freelancer_profiles_day_rate_check
    check (day_rate_minor is null or day_rate_minor > 0),
  constraint freelancer_profiles_currency_check
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint freelancer_profiles_rate_currency_check
    check (
      (hourly_rate_minor is null and day_rate_minor is null and currency is null)
      or (
        currency is not null
        and (hourly_rate_minor is not null or day_rate_minor is not null)
      )
    ),
  constraint freelancer_profiles_profile_status_check
    check (profile_status in ('active', 'paused', 'unavailable', 'archived')),
  constraint freelancer_profiles_availability_status_check
    check (availability_status in ('available', 'limited', 'unavailable', 'unknown')),
  constraint freelancer_profiles_intro_policy_check
    check (intro_policy in ('free', 'manual_approval')),
  constraint freelancer_profiles_booking_url_check
    check (
      booking_url is null
      or (
        booking_url ~ '^https://'
        and char_length(booking_url) <= 1000
      )
    ),
  constraint freelancer_profiles_demo_status_check
    check (demo_status in ('demo', 'real')),
  constraint freelancer_profiles_version_check check (version > 0)
);

create table public.shortlists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  matching_rule_version text not null,
  brief_snapshot jsonb not null,
  result_count smallint not null,
  profile_catalog_version text not null,
  created_at timestamptz not null default now(),
  constraint shortlists_matching_rule_version_check
    check (char_length(btrim(matching_rule_version)) between 1 and 80),
  constraint shortlists_brief_snapshot_check
    check (
      jsonb_typeof(brief_snapshot) = 'object'
      and octet_length(brief_snapshot::text) <= 32768
    ),
  constraint shortlists_result_count_check check (result_count between 0 and 3),
  constraint shortlists_profile_catalog_version_check
    check (char_length(btrim(profile_catalog_version)) between 1 and 160)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  shortlist_id uuid not null references public.shortlists (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  freelancer_profile_id uuid not null
    references public.freelancer_profiles (id) on delete restrict,
  position smallint not null,
  match_reasons text[] not null default '{}'::text[],
  known_gaps text[] not null default '{}'::text[],
  verified_facts_snapshot text[] not null default '{}'::text[],
  self_reported_facts_snapshot text[] not null default '{}'::text[],
  profile_snapshot jsonb not null,
  matching_rule_version text not null,
  profile_data_version bigint not null,
  created_at timestamptz not null default now(),
  constraint matches_position_check check (position between 1 and 3),
  constraint matches_reasons_check check (cardinality(match_reasons) between 1 and 20),
  constraint matches_gaps_check check (cardinality(known_gaps) <= 20),
  constraint matches_snapshot_check
    check (
      jsonb_typeof(profile_snapshot) = 'object'
      and octet_length(profile_snapshot::text) <= 65536
    ),
  constraint matches_rule_version_check
    check (char_length(btrim(matching_rule_version)) between 1 and 80),
  constraint matches_profile_data_version_check check (profile_data_version > 0),
  constraint matches_shortlist_position_unique unique (shortlist_id, position),
  constraint matches_shortlist_profile_unique unique (shortlist_id, freelancer_profile_id)
);

create table public.intro_bookings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  freelancer_profile_id uuid not null
    references public.freelancer_profiles (id) on delete restrict,
  match_id uuid references public.matches (id) on delete set null,
  intro_policy_snapshot text not null,
  status text not null default 'requested',
  booking_provider text,
  booking_url text,
  booking_reference text,
  idempotency_key text not null,
  explicit_confirmation_at timestamptz not null,
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intro_bookings_intro_policy_check
    check (intro_policy_snapshot in ('free', 'manual_approval')),
  constraint intro_bookings_status_check
    check (status in (
      'requested', 'manual_review', 'ready_to_book',
      'booked', 'completed', 'cancelled'
    )),
  constraint intro_bookings_provider_check
    check (booking_provider is null or booking_provider in ('calendly', 'manual')),
  constraint intro_bookings_url_check
    check (
      booking_url is null
      or (
        booking_url ~ '^https://'
        and char_length(booking_url) <= 1000
      )
    ),
  constraint intro_bookings_reference_check
    check (
      booking_reference is null
      or char_length(btrim(booking_reference)) between 1 and 512
    ),
  constraint intro_bookings_idempotency_key_check
    check (char_length(btrim(idempotency_key)) between 8 and 160),
  constraint intro_bookings_owner_idempotency_unique
    unique (owner_user_id, idempotency_key),
  constraint intro_bookings_cancelled_at_check
    check (status = 'cancelled' or cancelled_at is null)
);

create table public.engagements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  freelancer_profile_id uuid not null
    references public.freelancer_profiles (id) on delete restrict,
  intro_booking_id uuid unique references public.intro_bookings (id) on delete set null,
  status text not null default 'proposed',
  contract_value_minor bigint,
  currency text,
  confirmation_source text not null,
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engagements_status_check
    check (status in ('proposed', 'accepted', 'active', 'completed', 'cancelled', 'disputed')),
  constraint engagements_contract_value_check
    check (contract_value_minor is null or contract_value_minor >= 0),
  constraint engagements_currency_check
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint engagements_contract_currency_check
    check (
      (contract_value_minor is null and currency is null)
      or (contract_value_minor is not null and currency is not null)
    ),
  constraint engagements_confirmation_source_check
    check (confirmation_source in ('user', 'operator'))
);

create table public.engagement_status_events (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now(),
  actor_user_id uuid references auth.users (id) on delete set null,
  constraint engagement_status_events_from_status_check
    check (
      from_status is null
      or from_status in ('proposed', 'accepted', 'active', 'completed', 'cancelled', 'disputed')
    ),
  constraint engagement_status_events_to_status_check
    check (to_status in ('proposed', 'accepted', 'active', 'completed', 'cancelled', 'disputed'))
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_tombstone text,
  action text not null,
  target_type text not null,
  target_id uuid,
  occurred_at timestamptz not null default now(),
  outcome text not null default 'success',
  trace_id text,
  metadata jsonb not null default '{}'::jsonb,
  constraint audit_events_actor_check
    check (actor_user_id is not null or actor_tombstone is not null),
  constraint audit_events_action_check
    check (char_length(btrim(action)) between 1 and 120),
  constraint audit_events_target_type_check
    check (char_length(btrim(target_type)) between 1 and 80),
  constraint audit_events_outcome_check check (outcome in ('success', 'denied', 'failed')),
  constraint audit_events_trace_id_check
    check (trace_id is null or char_length(btrim(trace_id)) between 8 and 160),
  constraint audit_events_metadata_check
    check (
      jsonb_typeof(metadata) = 'object'
      and octet_length(metadata::text) <= 8192
    )
);

create table public.ai_usage_buckets (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_hash text not null,
  bucket_start timestamptz not null,
  bucket_kind text not null,
  request_count bigint not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  estimated_cost_cents bigint not null default 0,
  constraint ai_usage_buckets_subject_type_check
    check (subject_type in ('user', 'ip', 'provider')),
  constraint ai_usage_buckets_subject_hash_check
    check (char_length(btrim(subject_hash)) between 8 and 255),
  constraint ai_usage_buckets_bucket_kind_check
    check (bucket_kind in ('minute', 'day', 'month')),
  constraint ai_usage_buckets_nonnegative_check
    check (
      request_count >= 0
      and input_tokens >= 0
      and output_tokens >= 0
      and estimated_cost_cents >= 0
    ),
  constraint ai_usage_buckets_subject_bucket_unique
    unique (subject_type, subject_hash, bucket_kind, bucket_start)
);

create table public.ai_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  request_key text not null unique,
  user_hash text not null,
  ip_hash text not null,
  is_anonymous boolean not null,
  estimated_tokens bigint not null,
  estimated_cost_cents bigint not null,
  actual_input_tokens bigint,
  actual_output_tokens bigint,
  actual_cost_cents bigint,
  outcome text not null default 'reserved',
  minute_bucket_start timestamptz not null,
  day_bucket_start timestamptz not null,
  month_bucket_start timestamptz not null,
  reserved_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint ai_usage_reservations_request_key_check
    check (char_length(btrim(request_key)) between 8 and 160),
  constraint ai_usage_reservations_hashes_check
    check (
      char_length(btrim(user_hash)) between 8 and 255
      and char_length(btrim(ip_hash)) between 8 and 255
    ),
  constraint ai_usage_reservations_estimates_check
    check (estimated_tokens >= 0 and estimated_cost_cents >= 0),
  constraint ai_usage_reservations_actuals_check
    check (
      (actual_input_tokens is null or actual_input_tokens >= 0)
      and (actual_output_tokens is null or actual_output_tokens >= 0)
      and (actual_cost_cents is null or actual_cost_cents >= 0)
    ),
  constraint ai_usage_reservations_outcome_check
    check (outcome in ('reserved', 'succeeded', 'provider_error', 'timeout', 'cancelled')),
  constraint ai_usage_reservations_settlement_check
    check (
      (outcome = 'reserved' and settled_at is null)
      or (outcome <> 'reserved' and settled_at is not null)
    )
);

create table public.guest_claims (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  guest_user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint guest_claims_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint guest_claims_expiry_check check (expires_at > created_at),
  constraint guest_claims_consumed_check
    check (consumed_at is null or consumed_at >= created_at)
);

create table public.retention_policies (
  record_type text primary key,
  retention_days integer not null,
  deletion_mode text not null,
  is_enabled boolean not null default true,
  notes text not null,
  updated_at timestamptz not null default now(),
  constraint retention_policies_record_type_check
    check (record_type ~ '^[a-z][a-z0-9_]{1,79}$'),
  constraint retention_policies_days_check check (retention_days between 1 and 3650),
  constraint retention_policies_mode_check
    check (deletion_mode in ('hard_delete', 'anonymize', 'operator_review')),
  constraint retention_policies_notes_check
    check (char_length(btrim(notes)) between 1 and 2000)
);

-- Ownership, lifecycle and deterministic matching indexes.
create index user_profiles_updated_at_idx on public.user_profiles (updated_at desc);
create index projects_owner_updated_idx
  on public.projects (owner_user_id, updated_at desc);
create index projects_owner_status_updated_idx
  on public.projects (owner_user_id, status, updated_at desc);
create index messages_owner_project_created_idx
  on public.messages (owner_user_id, project_id, created_at);
create index messages_project_created_idx
  on public.messages (project_id, created_at);

create index freelancer_profiles_status_availability_idx
  on public.freelancer_profiles (profile_status, availability_status, availability_updated_at desc);
create index freelancer_profiles_eligible_availability_idx
  on public.freelancer_profiles (availability_from, availability_updated_at desc, id)
  where profile_status = 'active' and availability_status = 'available';
create index freelancer_profiles_skill_tags_gin_idx
  on public.freelancer_profiles using gin (skill_tags);
create index freelancer_profiles_languages_gin_idx
  on public.freelancer_profiles using gin (languages);
create index freelancer_profiles_work_modes_gin_idx
  on public.freelancer_profiles using gin (work_modes);

create index shortlists_owner_project_created_idx
  on public.shortlists (owner_user_id, project_id, created_at desc);
create index shortlists_project_created_idx
  on public.shortlists (project_id, created_at desc);

create index matches_owner_project_created_idx
  on public.matches (owner_user_id, project_id, created_at desc);
create index matches_project_idx on public.matches (project_id);
create index matches_shortlist_created_idx
  on public.matches (shortlist_id, created_at, position);
create index matches_freelancer_profile_idx
  on public.matches (freelancer_profile_id);

create index intro_bookings_owner_status_updated_idx
  on public.intro_bookings (owner_user_id, status, updated_at desc);
create index intro_bookings_project_idx on public.intro_bookings (project_id);
create index intro_bookings_freelancer_idx on public.intro_bookings (freelancer_profile_id);
create index intro_bookings_match_idx on public.intro_bookings (match_id)
  where match_id is not null;

create index engagements_owner_status_updated_idx
  on public.engagements (owner_user_id, status, updated_at desc);
create index engagements_project_idx on public.engagements (project_id);
create index engagements_freelancer_idx on public.engagements (freelancer_profile_id);
create index engagement_status_events_owner_changed_idx
  on public.engagement_status_events (owner_user_id, changed_at desc);
create index engagement_status_events_engagement_changed_idx
  on public.engagement_status_events (engagement_id, changed_at);
create index engagement_status_events_actor_idx
  on public.engagement_status_events (actor_user_id)
  where actor_user_id is not null;

create index audit_events_actor_occurred_idx
  on public.audit_events (actor_user_id, occurred_at desc)
  where actor_user_id is not null;
create index audit_events_target_occurred_idx
  on public.audit_events (target_type, target_id, occurred_at desc);
create index audit_events_occurred_idx on public.audit_events (occurred_at desc);

create index ai_usage_buckets_kind_start_idx
  on public.ai_usage_buckets (subject_type, bucket_kind, bucket_start desc);
create index ai_usage_reservations_unsettled_idx
  on public.ai_usage_reservations (reserved_at)
  where settled_at is null;
create index guest_claims_unconsumed_expiry_idx
  on public.guest_claims (expires_at, guest_user_id)
  where consumed_at is null;
create index guest_claims_guest_user_idx on public.guest_claims (guest_user_id);
create index guest_claims_consumed_by_user_idx
  on public.guest_claims (consumed_by_user_id)
  where consumed_by_user_id is not null;

-- RLS is enabled and forced on every public table, including service-only tables.
alter table public.user_profiles enable row level security;
alter table public.user_profiles force row level security;
alter table public.projects enable row level security;
alter table public.projects force row level security;
alter table public.messages enable row level security;
alter table public.messages force row level security;
alter table public.freelancer_profiles enable row level security;
alter table public.freelancer_profiles force row level security;
alter table public.shortlists enable row level security;
alter table public.shortlists force row level security;
alter table public.matches enable row level security;
alter table public.matches force row level security;
alter table public.intro_bookings enable row level security;
alter table public.intro_bookings force row level security;
alter table public.engagements enable row level security;
alter table public.engagements force row level security;
alter table public.engagement_status_events enable row level security;
alter table public.engagement_status_events force row level security;
alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
alter table public.ai_usage_buckets enable row level security;
alter table public.ai_usage_buckets force row level security;
alter table public.ai_usage_reservations enable row level security;
alter table public.ai_usage_reservations force row level security;
alter table public.guest_claims enable row level security;
alter table public.guest_claims force row level security;
alter table public.retention_policies enable row level security;
alter table public.retention_policies force row level security;

create policy user_profiles_select_own
  on public.user_profiles for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = id);

create policy user_profiles_insert_own
  on public.user_profiles for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = id);

create policy user_profiles_update_own
  on public.user_profiles for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = id);

create policy projects_select_own
  on public.projects for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);

create policy projects_insert_own
  on public.projects for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);

create policy projects_update_own
  on public.projects for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);

create policy projects_delete_own
  on public.projects for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);

create policy messages_select_own
  on public.messages for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);

create policy messages_insert_own_user_message
  on public.messages for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = owner_user_id
    and role = 'user'
    and exists (
      select 1
      from public.projects p
      where p.id = project_id
        and p.owner_user_id = (select auth.uid())
    )
  );

create policy freelancer_profiles_select_eligible
  on public.freelancer_profiles for select to authenticated
  using (
    profile_status = 'active'
    and availability_status = 'available'
    and demo_status in ('demo', 'real')
  );

create policy shortlists_select_own
  on public.shortlists for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);

create policy matches_select_own
  on public.matches for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);

create policy intro_bookings_select_own
  on public.intro_bookings for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);

create policy engagements_select_own
  on public.engagements for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);

create policy engagement_status_events_select_own
  on public.engagement_status_events for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);

-- No policies are intentionally created for audit_events, ai_usage_buckets,
-- ai_usage_reservations, guest_claims or retention_policies. They are
-- server/operator-only and remain fail-closed through grants plus RLS.

-- Explicit Data API grants. There is no grant to the unauthenticated `anon`
-- Postgres role; product guests first receive an anonymous Supabase Auth user
-- and therefore use the `authenticated` role with their own auth.uid().
grant usage on schema public to anon, authenticated, service_role;

revoke all on table
  public.user_profiles,
  public.projects,
  public.messages,
  public.freelancer_profiles,
  public.shortlists,
  public.matches,
  public.intro_bookings,
  public.engagements,
  public.engagement_status_events,
  public.audit_events,
  public.ai_usage_buckets,
  public.ai_usage_reservations,
  public.guest_claims,
  public.retention_policies
from anon, authenticated, service_role;

grant select, insert on public.user_profiles to authenticated;
grant update (display_name, locale, updated_at) on public.user_profiles to authenticated;
grant select on public.projects to authenticated;
grant select on public.messages to authenticated;
grant select on public.freelancer_profiles to authenticated;
grant select on public.shortlists to authenticated;
grant select on public.matches to authenticated;
grant select on public.intro_bookings to authenticated;
grant select on public.engagements to authenticated;
grant select on public.engagement_status_events to authenticated;

grant select, insert, update, delete on public.user_profiles to service_role;
grant select, insert, update, delete on public.projects to service_role;
grant select, insert, update, delete on public.messages to service_role;
grant select, insert, update, delete on public.freelancer_profiles to service_role;
grant select, insert, update, delete on public.shortlists to service_role;
grant select, insert, update, delete on public.matches to service_role;
grant select, insert, update, delete on public.intro_bookings to service_role;
grant select, insert, update, delete on public.engagements to service_role;
grant select, insert, update, delete on public.engagement_status_events to service_role;
grant select, insert, update (actor_user_id, actor_tombstone) on public.audit_events to service_role;
grant select, insert, update, delete on public.ai_usage_buckets to service_role;
grant select, insert, update, delete on public.ai_usage_reservations to service_role;
grant select, insert, update, delete on public.guest_claims to service_role;
grant select, insert, update, delete on public.retention_policies to service_role;

-- Trigger helpers are kept outside the exposed Data API schema. None is a
-- SECURITY DEFINER function.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.touch_freelancer_profile()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;

  if new.profile_status is distinct from old.profile_status
     or new.availability_status is distinct from old.availability_status
     or new.availability_from is distinct from old.availability_from then
    new.availability_updated_at := now();
  end if;

  return new;
end;
$$;

create or replace function private.guard_audit_event_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.action is distinct from old.action
     or new.target_type is distinct from old.target_type
     or new.target_id is distinct from old.target_id
     or new.occurred_at is distinct from old.occurred_at
     or new.outcome is distinct from old.outcome
     or new.trace_id is distinct from old.trace_id
     or new.metadata is distinct from old.metadata then
    raise exception 'audit events are append-only'
      using errcode = '42501';
  end if;

  if old.actor_user_id is null then
    if new.actor_user_id is distinct from old.actor_user_id
       or new.actor_tombstone is distinct from old.actor_tombstone then
      raise exception 'an anonymized audit actor cannot be changed'
        using errcode = '42501';
    end if;
  elsif new.actor_user_id is null then
    new.actor_tombstone := coalesce(
      new.actor_tombstone,
      old.actor_tombstone,
      'deleted:' || replace(gen_random_uuid()::text, '-', '')
    );
  elsif new.actor_user_id is distinct from old.actor_user_id
        or new.actor_tombstone is distinct from old.actor_tombstone then
    raise exception 'audit actor reassignment is not permitted'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.audit_freelancer_profile_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.freelancer_profiles%rowtype;
  v_action text;
begin
  if tg_op = 'DELETE' then
    v_row := old;
    v_action := 'freelancer_profile_deleted';
  elsif tg_op = 'INSERT' then
    v_row := new;
    v_action := 'freelancer_profile_created';
  else
    v_row := new;
    v_action := 'freelancer_profile_updated';
  end if;

  insert into public.audit_events (
    actor_user_id,
    actor_tombstone,
    action,
    target_type,
    target_id,
    outcome,
    metadata
  ) values (
    (select auth.uid()),
    case when (select auth.uid()) is null then 'db-role:' || current_user else null end,
    v_action,
    'freelancer_profile',
    v_row.id,
    'success',
    jsonb_build_object(
      'profile_status', v_row.profile_status,
      'availability_status', v_row.availability_status,
      'demo_status', v_row.demo_status,
      'profile_version', v_row.version
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.audit_shortlist_created()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.audit_events (
    actor_user_id,
    action,
    target_type,
    target_id,
    outcome,
    metadata
  ) values (
    new.owner_user_id,
    'shortlist_created',
    'shortlist',
    new.id,
    'success',
    jsonb_build_object(
      'project_id', new.project_id,
      'result_count', new.result_count,
      'matching_rule_version', new.matching_rule_version,
      'profile_catalog_version', new.profile_catalog_version
    )
  );
  return new;
end;
$$;

create or replace function private.audit_intro_booking_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_action text;
  v_actor uuid;
begin
  if tg_op = 'INSERT' then
    v_action := 'intro_requested';
    v_actor := new.owner_user_id;
  elsif new.status is distinct from old.status then
    v_action := 'intro_status_changed';
    v_actor := (select auth.uid());
  else
    return new;
  end if;

  insert into public.audit_events (
    actor_user_id,
    actor_tombstone,
    action,
    target_type,
    target_id,
    outcome,
    metadata
  ) values (
    v_actor,
    case when v_actor is null then 'db-role:' || current_user else null end,
    v_action,
    'intro_booking',
    new.id,
    'success',
    jsonb_build_object(
      'project_id', new.project_id,
      'status', new.status,
      'intro_policy', new.intro_policy_snapshot
    )
  );
  return new;
end;
$$;

create or replace function private.write_engagement_status_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid;
  v_from_status text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  v_from_status := case when tg_op = 'UPDATE' then old.status else null end;
  v_actor := case
    when tg_op = 'INSERT' and new.confirmation_source = 'user' then new.owner_user_id
    else (select auth.uid())
  end;

  insert into public.engagement_status_events (
    engagement_id,
    owner_user_id,
    from_status,
    to_status,
    actor_user_id
  ) values (
    new.id,
    new.owner_user_id,
    v_from_status,
    new.status,
    v_actor
  );

  insert into public.audit_events (
    actor_user_id,
    actor_tombstone,
    action,
    target_type,
    target_id,
    outcome,
    metadata
  ) values (
    v_actor,
    case when v_actor is null then 'db-role:' || current_user else null end,
    case when tg_op = 'INSERT' then 'engagement_created' else 'engagement_status_changed' end,
    'engagement',
    new.id,
    'success',
    jsonb_build_object(
      'project_id', new.project_id,
      'from_status', v_from_status,
      'to_status', new.status,
      'confirmation_source', new.confirmation_source
    )
  );

  return new;
end;
$$;

create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function private.set_updated_at();

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function private.set_updated_at();

create trigger freelancer_profiles_touch
  before update on public.freelancer_profiles
  for each row execute function private.touch_freelancer_profile();

create trigger freelancer_profiles_audit
  after insert or update or delete on public.freelancer_profiles
  for each row execute function private.audit_freelancer_profile_change();

create trigger shortlists_audit
  after insert on public.shortlists
  for each row execute function private.audit_shortlist_created();

create trigger intro_bookings_set_updated_at
  before update on public.intro_bookings
  for each row execute function private.set_updated_at();

create trigger intro_bookings_audit
  after insert or update on public.intro_bookings
  for each row execute function private.audit_intro_booking_change();

create trigger engagements_set_updated_at
  before update on public.engagements
  for each row execute function private.set_updated_at();

create trigger engagements_status_history
  after insert or update on public.engagements
  for each row execute function private.write_engagement_status_event();

create trigger retention_policies_set_updated_at
  before update on public.retention_policies
  for each row execute function private.set_updated_at();

create trigger audit_events_guard_update
  before update on public.audit_events
  for each row execute function private.guard_audit_event_update();

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;

-- Atomically move a guest-owned workspace to an already authenticated account.
-- The caller supplies only a SHA-256 token hash; the raw token is never stored.
create or replace function public.claim_guest_workspace(
  p_token_hash text,
  p_target_user_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_guest_user_id uuid;
  v_project_count integer := 0;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid claim token hash'
      using errcode = '22023';
  end if;

  if p_target_user_id is null then
    raise exception 'target user is required'
      using errcode = '22023';
  end if;

  select gc.guest_user_id
    into v_guest_user_id
  from public.guest_claims gc
  where gc.token_hash = p_token_hash
    and gc.consumed_at is null
    and gc.expires_at > now()
  for update;

  if not found then
    return false;
  end if;

  if v_guest_user_id = p_target_user_id then
    -- linkIdentity() preserves auth.uid(); consume the one-time claim without
    -- moving rows so callback retries cannot reuse it.
    update public.guest_claims
      set consumed_at = now(), consumed_by_user_id = p_target_user_id
      where token_hash = p_token_hash;

    insert into public.audit_events (
      actor_user_id,
      action,
      target_type,
      target_id,
      outcome,
      metadata
    ) values (
      p_target_user_id,
      'guest_identity_linked',
      'user_workspace',
      p_target_user_id,
      'success',
      jsonb_build_object('transferred_project_count', 0)
    );

    return true;
  end if;

  -- The auth.users foreign keys reject a nonexistent target. All changes are in
  -- this transaction, so a failed transfer leaves the guest workspace intact.
  update public.messages
    set owner_user_id = p_target_user_id
    where owner_user_id = v_guest_user_id;

  update public.shortlists
    set owner_user_id = p_target_user_id
    where owner_user_id = v_guest_user_id;

  update public.matches
    set owner_user_id = p_target_user_id
    where owner_user_id = v_guest_user_id;

  update public.intro_bookings
    set owner_user_id = p_target_user_id
    where owner_user_id = v_guest_user_id;

  update public.engagement_status_events
    set owner_user_id = p_target_user_id
    where owner_user_id = v_guest_user_id;

  update public.engagements
    set owner_user_id = p_target_user_id
    where owner_user_id = v_guest_user_id;

  update public.projects
    set owner_user_id = p_target_user_id
    where owner_user_id = v_guest_user_id;
  get diagnostics v_project_count = row_count;

  update public.guest_claims
    set consumed_at = now(), consumed_by_user_id = p_target_user_id
    where token_hash = p_token_hash;

  insert into public.audit_events (
    actor_user_id,
    action,
    target_type,
    target_id,
    outcome,
    metadata
  ) values (
    p_target_user_id,
    'guest_workspace_claimed',
    'user_workspace',
    p_target_user_id,
    'success',
    jsonb_build_object('transferred_project_count', v_project_count)
  );

  return true;
end;
$$;

-- Prepare immutable audit records before auth.admin.deleteUser() is called by a
-- server route. Owned app rows then disappear through ON DELETE CASCADE while
-- audit actor references remain pseudonymous and unlinkable to the deleted ID.
create or replace function public.prepare_user_deletion(p_user_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tombstone text;
begin
  if p_user_id is null then
    raise exception 'user id is required'
      using errcode = '22023';
  end if;

  v_tombstone := 'deleted:' || replace(gen_random_uuid()::text, '-', '');

  update public.audit_events
    set actor_user_id = null,
        actor_tombstone = coalesce(actor_tombstone, v_tombstone)
    where actor_user_id = p_user_id;

  insert into public.audit_events (
    actor_user_id,
    actor_tombstone,
    action,
    target_type,
    target_id,
    outcome,
    metadata
  ) values (
    null,
    v_tombstone,
    'user_deletion_prepared',
    'user',
    null,
    'success',
    '{}'::jsonb
  );

  return v_tombstone;
end;
$$;

-- Reserve capacity before an OpenAI call. Hashes must be server-side HMACs,
-- never raw IP addresses or identity tokens. A stable request key makes retries
-- idempotent. Anonymous users receive both user and IP daily token enforcement;
-- permanent accounts retain the IP minute abuse limit but avoid shared-NAT
-- daily-token false positives.
create or replace function public.consume_ai_quota(
  p_request_key text,
  p_user_hash text,
  p_ip_hash text,
  p_is_anonymous boolean,
  p_request_limit integer,
  p_daily_token_limit bigint,
  p_monthly_budget_cents bigint,
  p_estimated_tokens bigint,
  p_estimated_cost_cents bigint
)
returns table (
  allowed boolean,
  reason text,
  retry_after timestamptz,
  reservation_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_minute_start timestamptz;
  v_day_start timestamptz;
  v_month_start timestamptz;
  v_provider_hash constant text := 'provider:openai';
  v_existing_reservation_id uuid;
  v_new_reservation_id uuid;
  v_user_minute_count bigint;
  v_ip_minute_count bigint;
  v_user_day_tokens bigint;
  v_ip_day_tokens bigint := 0;
  v_provider_month_cost bigint;
begin
  v_minute_start := date_trunc('minute', v_now);
  v_day_start := date_trunc('day', v_now);
  v_month_start := date_trunc('month', v_now);

  if p_request_key is null or char_length(btrim(p_request_key)) not between 8 and 160
     or p_user_hash is null or char_length(btrim(p_user_hash)) not between 8 and 255
     or p_ip_hash is null or char_length(btrim(p_ip_hash)) not between 8 and 255
     or p_is_anonymous is null
     or p_request_limit is null or p_request_limit <= 0
     or p_daily_token_limit is null or p_daily_token_limit < 0
     or p_monthly_budget_cents is null or p_monthly_budget_cents < 0
     or p_estimated_tokens is null or p_estimated_tokens < 0
     or p_estimated_cost_cents is null or p_estimated_cost_cents < 0 then
    allowed := false;
    reason := 'invalid_input';
    retry_after := null;
    reservation_id := null;
    return next;
    return;
  end if;

  select r.id into v_existing_reservation_id
  from public.ai_usage_reservations r
  where r.request_key = p_request_key;

  if found then
    allowed := false;
    reason := 'already_reserved';
    retry_after := null;
    reservation_id := v_existing_reservation_id;
    return next;
    return;
  end if;

  insert into public.ai_usage_buckets (
    subject_type, subject_hash, bucket_start, bucket_kind
  ) values
    ('user', p_user_hash, v_minute_start, 'minute'),
    ('ip', p_ip_hash, v_minute_start, 'minute'),
    ('user', p_user_hash, v_day_start, 'day'),
    ('provider', v_provider_hash, v_month_start, 'month')
  on conflict (subject_type, subject_hash, bucket_kind, bucket_start) do nothing;

  if p_is_anonymous then
    insert into public.ai_usage_buckets (
      subject_type, subject_hash, bucket_start, bucket_kind
    ) values ('ip', p_ip_hash, v_day_start, 'day')
    on conflict (subject_type, subject_hash, bucket_kind, bucket_start) do nothing;
  end if;

  -- Lock all shared counters in one stable order. The provider row serializes
  -- concurrent calls across users before the monthly hard cap is evaluated.
  perform b.id
  from public.ai_usage_buckets b
  where (b.subject_type = 'user' and b.subject_hash = p_user_hash
         and b.bucket_kind = 'minute' and b.bucket_start = v_minute_start)
     or (b.subject_type = 'ip' and b.subject_hash = p_ip_hash
         and b.bucket_kind = 'minute' and b.bucket_start = v_minute_start)
     or (b.subject_type = 'user' and b.subject_hash = p_user_hash
         and b.bucket_kind = 'day' and b.bucket_start = v_day_start)
     or (p_is_anonymous and b.subject_type = 'ip' and b.subject_hash = p_ip_hash
         and b.bucket_kind = 'day' and b.bucket_start = v_day_start)
     or (b.subject_type = 'provider' and b.subject_hash = v_provider_hash
         and b.bucket_kind = 'month' and b.bucket_start = v_month_start)
  order by b.subject_type, b.subject_hash, b.bucket_kind, b.bucket_start
  for update;

  select b.request_count into v_user_minute_count
  from public.ai_usage_buckets b
  where b.subject_type = 'user'
    and b.subject_hash = p_user_hash
    and b.bucket_kind = 'minute'
    and b.bucket_start = v_minute_start;

  select b.request_count into v_ip_minute_count
  from public.ai_usage_buckets b
  where b.subject_type = 'ip'
    and b.subject_hash = p_ip_hash
    and b.bucket_kind = 'minute'
    and b.bucket_start = v_minute_start;

  select b.input_tokens + b.output_tokens into v_user_day_tokens
  from public.ai_usage_buckets b
  where b.subject_type = 'user'
    and b.subject_hash = p_user_hash
    and b.bucket_kind = 'day'
    and b.bucket_start = v_day_start;

  if p_is_anonymous then
    select b.input_tokens + b.output_tokens into v_ip_day_tokens
    from public.ai_usage_buckets b
    where b.subject_type = 'ip'
      and b.subject_hash = p_ip_hash
      and b.bucket_kind = 'day'
      and b.bucket_start = v_day_start;
  end if;

  select b.estimated_cost_cents into v_provider_month_cost
  from public.ai_usage_buckets b
  where b.subject_type = 'provider'
    and b.subject_hash = v_provider_hash
    and b.bucket_kind = 'month'
    and b.bucket_start = v_month_start;

  if v_user_minute_count >= p_request_limit then
    allowed := false;
    reason := case when p_is_anonymous then 'anonymous_user_minute_limit' else 'user_minute_limit' end;
    retry_after := v_minute_start + interval '1 minute';
    reservation_id := null;
    return next;
    return;
  end if;

  if v_ip_minute_count >= p_request_limit then
    allowed := false;
    reason := 'ip_minute_limit';
    retry_after := v_minute_start + interval '1 minute';
    reservation_id := null;
    return next;
    return;
  end if;

  if v_user_day_tokens + p_estimated_tokens > p_daily_token_limit then
    allowed := false;
    reason := case when p_is_anonymous then 'anonymous_user_daily_token_limit' else 'user_daily_token_limit' end;
    retry_after := v_day_start + interval '1 day';
    reservation_id := null;
    return next;
    return;
  end if;

  if p_is_anonymous and v_ip_day_tokens + p_estimated_tokens > p_daily_token_limit then
    allowed := false;
    reason := 'anonymous_ip_daily_token_limit';
    retry_after := v_day_start + interval '1 day';
    reservation_id := null;
    return next;
    return;
  end if;

  if v_provider_month_cost + p_estimated_cost_cents > p_monthly_budget_cents then
    allowed := false;
    reason := 'provider_monthly_budget';
    retry_after := v_month_start + interval '1 month';
    reservation_id := null;
    return next;
    return;
  end if;

  insert into public.ai_usage_reservations (
    request_key,
    user_hash,
    ip_hash,
    is_anonymous,
    estimated_tokens,
    estimated_cost_cents,
    minute_bucket_start,
    day_bucket_start,
    month_bucket_start
  ) values (
    p_request_key,
    p_user_hash,
    p_ip_hash,
    p_is_anonymous,
    p_estimated_tokens,
    p_estimated_cost_cents,
    v_minute_start,
    v_day_start,
    v_month_start
  )
  on conflict (request_key) do nothing
  returning id into v_new_reservation_id;

  if v_new_reservation_id is null then
    select r.id into v_new_reservation_id
    from public.ai_usage_reservations r
    where r.request_key = p_request_key;

    allowed := false;
    reason := 'already_reserved';
    retry_after := null;
    reservation_id := v_new_reservation_id;
    return next;
    return;
  end if;

  update public.ai_usage_buckets b
    set request_count = b.request_count + 1
    where b.subject_type = 'user'
      and b.subject_hash = p_user_hash
      and b.bucket_kind = 'minute'
      and b.bucket_start = v_minute_start;

  update public.ai_usage_buckets b
    set request_count = b.request_count + 1
    where b.subject_type = 'ip'
      and b.subject_hash = p_ip_hash
      and b.bucket_kind = 'minute'
      and b.bucket_start = v_minute_start;

  update public.ai_usage_buckets b
    set request_count = b.request_count + 1,
        input_tokens = b.input_tokens + p_estimated_tokens,
        estimated_cost_cents = b.estimated_cost_cents + p_estimated_cost_cents
    where b.subject_type = 'user'
      and b.subject_hash = p_user_hash
      and b.bucket_kind = 'day'
      and b.bucket_start = v_day_start;

  if p_is_anonymous then
    update public.ai_usage_buckets b
      set request_count = b.request_count + 1,
          input_tokens = b.input_tokens + p_estimated_tokens,
          estimated_cost_cents = b.estimated_cost_cents + p_estimated_cost_cents
      where b.subject_type = 'ip'
        and b.subject_hash = p_ip_hash
        and b.bucket_kind = 'day'
        and b.bucket_start = v_day_start;
  end if;

  update public.ai_usage_buckets b
    set request_count = b.request_count + 1,
        input_tokens = b.input_tokens + p_estimated_tokens,
        estimated_cost_cents = b.estimated_cost_cents + p_estimated_cost_cents
    where b.subject_type = 'provider'
      and b.subject_hash = v_provider_hash
      and b.bucket_kind = 'month'
      and b.bucket_start = v_month_start;

  allowed := true;
  reason := 'reserved';
  retry_after := null;
  reservation_id := v_new_reservation_id;
  return next;
end;
$$;

-- Replace the preflight reservation with actual provider usage. Repeating the
-- same call is harmless because settled reservations are immutable.
create or replace function public.record_ai_usage(
  p_request_key text,
  p_actual_input_tokens bigint,
  p_actual_output_tokens bigint,
  p_actual_cost_cents bigint,
  p_outcome text
)
returns table (
  recorded boolean,
  reason text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reservation public.ai_usage_reservations%rowtype;
  v_provider_hash constant text := 'provider:openai';
begin
  if p_request_key is null or char_length(btrim(p_request_key)) not between 8 and 160
     or p_actual_input_tokens is null or p_actual_input_tokens < 0
     or p_actual_output_tokens is null or p_actual_output_tokens < 0
     or p_actual_cost_cents is null or p_actual_cost_cents < 0
     or p_outcome is null
     or p_outcome not in ('succeeded', 'provider_error', 'timeout', 'cancelled') then
    recorded := false;
    reason := 'invalid_input';
    return next;
    return;
  end if;

  select r.* into v_reservation
  from public.ai_usage_reservations r
  where r.request_key = p_request_key
  for update;

  if not found then
    recorded := false;
    reason := 'unknown_request';
    return next;
    return;
  end if;

  if v_reservation.settled_at is not null then
    recorded := true;
    reason := 'already_recorded';
    return next;
    return;
  end if;

  perform b.id
  from public.ai_usage_buckets b
  where (b.subject_type = 'user' and b.subject_hash = v_reservation.user_hash
         and b.bucket_kind = 'day' and b.bucket_start = v_reservation.day_bucket_start)
     or (v_reservation.is_anonymous and b.subject_type = 'ip'
         and b.subject_hash = v_reservation.ip_hash
         and b.bucket_kind = 'day' and b.bucket_start = v_reservation.day_bucket_start)
     or (b.subject_type = 'provider' and b.subject_hash = v_provider_hash
         and b.bucket_kind = 'month' and b.bucket_start = v_reservation.month_bucket_start)
  order by b.subject_type, b.subject_hash, b.bucket_kind, b.bucket_start
  for update;

  update public.ai_usage_buckets b
    set input_tokens = greatest(b.input_tokens - v_reservation.estimated_tokens, 0::bigint)
                       + p_actual_input_tokens,
        output_tokens = b.output_tokens + p_actual_output_tokens,
        estimated_cost_cents = greatest(
          b.estimated_cost_cents - v_reservation.estimated_cost_cents,
          0::bigint
        ) + p_actual_cost_cents
    where b.subject_type = 'user'
      and b.subject_hash = v_reservation.user_hash
      and b.bucket_kind = 'day'
      and b.bucket_start = v_reservation.day_bucket_start;

  if v_reservation.is_anonymous then
    update public.ai_usage_buckets b
      set input_tokens = greatest(b.input_tokens - v_reservation.estimated_tokens, 0::bigint)
                         + p_actual_input_tokens,
          output_tokens = b.output_tokens + p_actual_output_tokens,
          estimated_cost_cents = greatest(
            b.estimated_cost_cents - v_reservation.estimated_cost_cents,
            0::bigint
          ) + p_actual_cost_cents
      where b.subject_type = 'ip'
        and b.subject_hash = v_reservation.ip_hash
        and b.bucket_kind = 'day'
        and b.bucket_start = v_reservation.day_bucket_start;
  end if;

  update public.ai_usage_buckets b
    set input_tokens = greatest(b.input_tokens - v_reservation.estimated_tokens, 0::bigint)
                       + p_actual_input_tokens,
        output_tokens = b.output_tokens + p_actual_output_tokens,
        estimated_cost_cents = greatest(
          b.estimated_cost_cents - v_reservation.estimated_cost_cents,
          0::bigint
        ) + p_actual_cost_cents
    where b.subject_type = 'provider'
      and b.subject_hash = v_provider_hash
      and b.bucket_kind = 'month'
      and b.bucket_start = v_reservation.month_bucket_start;

  update public.ai_usage_reservations
    set actual_input_tokens = p_actual_input_tokens,
        actual_output_tokens = p_actual_output_tokens,
        actual_cost_cents = p_actual_cost_cents,
        outcome = p_outcome,
        settled_at = now()
    where id = v_reservation.id;

  recorded := true;
  reason := 'recorded';
  return next;
end;
$$;

revoke all on function public.claim_guest_workspace(text, uuid)
  from public, anon, authenticated;
revoke all on function public.prepare_user_deletion(uuid)
  from public, anon, authenticated;
revoke all on function public.consume_ai_quota(
  text, text, text, boolean, integer, bigint, bigint, bigint, bigint
) from public, anon, authenticated;
revoke all on function public.record_ai_usage(text, bigint, bigint, bigint, text)
  from public, anon, authenticated;

grant execute on function public.claim_guest_workspace(text, uuid) to service_role;
grant execute on function public.prepare_user_deletion(uuid) to service_role;
grant execute on function public.consume_ai_quota(
  text, text, text, boolean, integer, bigint, bigint, bigint, bigint
) to service_role;
grant execute on function public.record_ai_usage(text, bigint, bigint, bigint, text)
  to service_role;
