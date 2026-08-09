-- XPORTAL founding whitelist. Public clients never access this table directly;
-- the server route validates and writes through the service role.

create table public.whitelist_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  country text not null,
  consent_at timestamptz not null,
  source text not null default 'home',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whitelist_leads_full_name_check
    check (char_length(btrim(full_name)) between 2 and 100),
  constraint whitelist_leads_email_check
    check (
      email = lower(email)
      and char_length(email) between 3 and 160
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  constraint whitelist_leads_country_check
    check (char_length(btrim(country)) between 2 and 80),
  constraint whitelist_leads_source_check
    check (source in ('home'))
);

create index whitelist_leads_created_at_idx
  on public.whitelist_leads (created_at desc);

alter table public.whitelist_leads enable row level security;
alter table public.whitelist_leads force row level security;

revoke all on public.whitelist_leads from public, anon, authenticated;
grant select, insert, update, delete on public.whitelist_leads to service_role;

create trigger whitelist_leads_touch
  before update on public.whitelist_leads
  for each row execute function private.set_updated_at();

insert into public.retention_policies (
  record_type,
  retention_days,
  deletion_mode,
  is_enabled,
  notes
) values (
  'whitelist_leads',
  365,
  'operator_review',
  true,
  'Review early-access leads after the campaign period and delete records when consent no longer supports retention.'
)
on conflict (record_type) do update set
  retention_days = excluded.retention_days,
  deletion_mode = excluded.deletion_mode,
  is_enabled = excluded.is_enabled,
  notes = excluded.notes;
