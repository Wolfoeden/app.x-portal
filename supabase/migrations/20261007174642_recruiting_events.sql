-- Optional consented product events and server-verified billing events are distinct.
create table public.recruiting_events (
  id uuid primary key default gen_random_uuid(),
  event text not null check (event in ('demo_viewed','trial_cta_clicked','registration_completed','first_analysis_succeeded','selection_saved','return_use','technical_error','checkout_started','trial_activated','trial_cancelled','first_payment','subscription_renewed','subscription_cancelled')),
  entity_id text not null check (length(entity_id) between 1 and 160),
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid,
  source text not null default 'direct' check (source in ('direct','google','reddit','linkedin','newsletter','referral')),
  origin text not null check (origin in ('client','server')),
  plan text,
  outcome text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event,entity_id,origin)
);
alter table public.recruiting_events enable row level security;
revoke all on public.recruiting_events from public, anon, authenticated;
grant select, insert, update, delete on public.recruiting_events to service_role;
create index recruiting_events_real_created_idx on public.recruiting_events(created_at,event) where not is_internal;
create index recruiting_events_user_idx on public.recruiting_events(user_id) where user_id is not null;
