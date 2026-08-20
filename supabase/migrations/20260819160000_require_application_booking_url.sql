-- A booking URL is what makes a published profile reachable at all:
-- `fetchActiveBookableRealProfiles` filters on a non-null HTTPS `booking_url`,
-- so an application without one can never become a matchable profile. Requiring
-- it at submission time moves that failure from the review screen — where only
-- the operator can fix it — to the applicant, who is the only one who knows
-- their own scheduling link.

alter table public.freelancer_applications
  alter column booking_url set not null;

alter table public.freelancer_applications
  drop constraint freelancer_applications_booking_url_check;

alter table public.freelancer_applications
  add constraint freelancer_applications_booking_url_check
  check (
    booking_url ~ '^https://'
    and char_length(booking_url) between 12 and 1000
  );

comment on column public.freelancer_applications.booking_url is
  'Required HTTPS scheduling link. Format is validated here; reachability is a human check during review.';
