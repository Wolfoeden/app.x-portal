-- Additive cutover: existing records retain their historical obligations.
-- New contacts use the software subscription and never create placement fees.
begin;

alter table public.search_mandates add column commercial_model text not null default 'legacy_placement';
alter table public.search_mandates alter column commercial_model set default 'no_fee';
alter table public.search_mandates add constraint search_mandates_commercial_model_check check (commercial_model in ('legacy_placement', 'no_fee'));

alter table public.intro_bookings
  add column commercial_model text not null default 'legacy_placement',
  add column legacy_mandate_id uuid references public.search_mandates(id),
  add column contact_delivery_status text,
  add column contact_delivered_at timestamptz,
  add column freelancer_consented_at timestamptz;
alter table public.intro_bookings alter column commercial_model set default 'no_fee';
alter table public.intro_bookings
  add constraint intro_bookings_commercial_model_check check (commercial_model in ('legacy_placement', 'no_fee')),
  add constraint intro_bookings_contact_delivery_check check (contact_delivery_status is null or contact_delivery_status in ('pending', 'sent', 'failed'));
alter table public.intro_bookings drop constraint intro_bookings_intro_policy_check;
alter table public.intro_bookings add constraint intro_bookings_intro_policy_check check (intro_policy_snapshot in ('free', 'manual_approval', 'freelancer_consent'));

alter table public.engagements add column commercial_model text not null default 'legacy_placement';
alter table public.engagements alter column commercial_model set default 'no_fee';
alter table public.engagements
  add constraint engagements_commercial_model_check check (commercial_model in ('legacy_placement', 'no_fee')),
  add constraint engagements_no_fee_check check (
    commercial_model <> 'no_fee' or (
      coalesce(fee_minor, 0) = 0
      and (fee_status is null or fee_status = 'waived')
      and stripe_invoice_id is null and invoice_reference is null
      and terms_version is null
    )
  );

-- This index applies only to the new workflow. Historical duplicates remain.
create unique index intro_bookings_no_fee_active_unique
  on public.intro_bookings(owner_user_id, project_id, freelancer_profile_id)
  where commercial_model = 'no_fee' and status <> 'cancelled';

create function public.guard_recruiting_commercial_model() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare inherited_model text;
begin
  if tg_op = 'UPDATE' and new.commercial_model is distinct from old.commercial_model then
    raise exception 'Historical commercial models are immutable';
  end if;
  if tg_table_name = 'intro_bookings' and tg_op = 'INSERT' then
    if new.commercial_model = 'legacy_placement' then
      select commercial_model into inherited_model from public.search_mandates
      where id = new.legacy_mandate_id and owner_user_id = new.owner_user_id and project_id = new.project_id;
      if inherited_model is distinct from 'legacy_placement' then
        raise exception 'New contacts must use no_fee';
      end if;
    end if;
  elsif tg_table_name = 'engagements' and tg_op = 'INSERT' then
    if new.intro_booking_id is not null then
      select commercial_model into inherited_model from public.intro_bookings
      where id = new.intro_booking_id and owner_user_id = new.owner_user_id and project_id = new.project_id;
      if inherited_model is null then raise exception 'Invalid introduction reference'; end if;
      new.commercial_model := inherited_model;
    elsif new.commercial_model <> 'no_fee' then
      raise exception 'Legacy fees require a historical introduction';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_recruiting_commercial_model() from public, anon, authenticated;
create trigger intro_bookings_commercial_model_guard before insert or update on public.intro_bookings
  for each row execute function public.guard_recruiting_commercial_model();
create trigger engagements_commercial_model_guard before insert or update on public.engagements
  for each row execute function public.guard_recruiting_commercial_model();
create trigger search_mandates_commercial_model_guard before update on public.search_mandates
  for each row execute function public.guard_recruiting_commercial_model();

comment on column public.intro_bookings.commercial_model is 'Immutable cutover tag: historical placement obligations remain; new no_fee contacts do not incur commission.';
comment on column public.engagements.commercial_model is 'Inherited from the introduction. no_fee disallows fees and placement invoices at database level.';
commit;
