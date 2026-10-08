begin;

-- Contains consented addresses only after acceptance. Never grant browser access.
create table public.recruiting_contact_deliveries (
  id uuid primary key default gen_random_uuid(),
  intro_booking_id uuid not null references public.intro_bookings(id) on delete cascade,
  kind text not null check (kind in ('consent_request', 'confirmation_client', 'confirmation_freelancer')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  recipient_email text,
  payload jsonb not null default '{}'::jsonb,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  lease_token uuid,
  lease_until timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(intro_booking_id, kind)
);
alter table public.recruiting_contact_deliveries enable row level security;
alter table public.recruiting_contact_deliveries force row level security;
revoke all on public.recruiting_contact_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.recruiting_contact_deliveries to service_role;

create function public.enqueue_recruiting_consent_request() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.commercial_model = 'no_fee' and new.status = 'requested' then
    insert into public.recruiting_contact_deliveries(intro_booking_id, kind)
      values(new.id, 'consent_request');
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_recruiting_consent_request() from public, anon, authenticated;
create trigger intro_bookings_enqueue_consent after insert on public.intro_bookings
  for each row execute function public.enqueue_recruiting_consent_request();

create function public.claim_recruiting_contact_delivery(p_id uuid)
returns setof public.recruiting_contact_deliveries
language sql security invoker set search_path = '' as $$
  update public.recruiting_contact_deliveries
  set status = 'sending', attempts = attempts + 1,
      lease_token = gen_random_uuid(), lease_until = now() + interval '5 minutes', last_error = null
  where id = p_id and attempts < 5
    and (status in ('pending', 'failed') or (status = 'sending' and lease_until < now()))
  returning *;
$$;
revoke all on function public.claim_recruiting_contact_delivery(uuid) from public, anon, authenticated;
grant execute on function public.claim_recruiting_contact_delivery(uuid) to service_role;

-- Called only after the server validated the recipient-bound consent token.
-- Conditional transition plus both delivery records form one transaction.
create function public.respond_recruiting_contact(
  p_id uuid, p_accept boolean, p_client_email text, p_freelancer_email text,
  p_freelancer_name text, p_project_title text, p_booking_url text
) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare selected public.intro_bookings;
begin
  select * into selected from public.intro_bookings
    where id = p_id and commercial_model = 'no_fee' for update;
  if not found or selected.status <> 'requested' then return false; end if;
  if p_accept and (nullif(btrim(p_client_email), '') is null or nullif(btrim(p_freelancer_email), '') is null) then
    raise exception 'Both confirmed contacts are required';
  end if;
  update public.intro_bookings set
    status = case when p_accept then 'ready_to_book' else 'cancelled' end,
    confirmed_at = case when p_accept then now() else null end,
    freelancer_consented_at = case when p_accept then now() else null end,
    cancelled_at = case when p_accept then null else now() end,
    booking_url = case when p_accept then p_booking_url else null end,
    booking_provider = case when p_accept and p_booking_url is not null then 'calendly' else null end
    where id = p_id;
  update public.recruiting_contact_deliveries set status = 'cancelled'
    where intro_booking_id = p_id and kind = 'consent_request' and status <> 'sent';
  if p_accept then
    insert into public.recruiting_contact_deliveries(intro_booking_id, kind, recipient_email, payload) values
      (p_id, 'confirmation_client', p_client_email, jsonb_build_object('projectTitle', p_project_title, 'counterpartEmail', p_freelancer_email, 'counterpartName', p_freelancer_name, 'bookingUrl', p_booking_url)),
      (p_id, 'confirmation_freelancer', p_freelancer_email, jsonb_build_object('projectTitle', p_project_title, 'counterpartEmail', p_client_email, 'counterpartName', 'Anfragende Person'));
  end if;
  return true;
end;
$$;
revoke all on function public.respond_recruiting_contact(uuid, boolean, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.respond_recruiting_contact(uuid, boolean, text, text, text, text, text) to service_role;

-- Requests created during the previous code checkpoint can safely be retried.
insert into public.recruiting_contact_deliveries(intro_booking_id, kind, status)
  select id, 'consent_request', case when contact_delivery_status = 'sent' then 'sent' else 'pending' end
  from public.intro_bookings where commercial_model = 'no_fee' and status = 'requested'
  on conflict (intro_booking_id, kind) do nothing;

commit;
