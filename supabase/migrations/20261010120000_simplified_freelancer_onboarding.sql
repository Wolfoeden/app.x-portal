-- The application is now an evidence intake: only name, compensation and CV
-- are mandatory. AI-derived fields may stay empty until operator review.
begin;

alter table public.freelancer_applications
  add column if not exists monthly_salary_minor bigint;

alter table public.freelancer_profiles
  add column if not exists monthly_salary_minor bigint;

alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_role_title_check,
  drop constraint if exists freelancer_applications_experience_summary_check,
  drop constraint if exists freelancer_applications_skills_check,
  drop constraint if exists freelancer_applications_languages_check,
  drop constraint if exists freelancer_applications_work_modes_check,
  drop constraint if exists freelancer_applications_rate_currency_check;

alter table public.freelancer_applications
  add constraint freelancer_applications_role_title_check
    check (char_length(btrim(role_title)) between 0 and 160),
  add constraint freelancer_applications_experience_summary_check
    check (char_length(btrim(experience_summary)) between 0 and 2000),
  add constraint freelancer_applications_skills_check
    check (cardinality(skills) between 0 and 80),
  add constraint freelancer_applications_languages_check
    check (cardinality(languages) between 0 and 20),
  add constraint freelancer_applications_work_modes_check
    check (cardinality(work_modes) between 0 and 3 and work_modes <@ array['remote', 'on_site', 'hybrid']::text[]),
  add constraint freelancer_applications_monthly_salary_check
    check (monthly_salary_minor is null or (monthly_salary_minor > 0 and monthly_salary_minor <= 1000000000)),
  add constraint freelancer_applications_rate_currency_check
    check (
      currency is not null
      and num_nonnulls(monthly_salary_minor, hourly_rate_minor, day_rate_minor) >= 1
    ),
  add constraint freelancer_applications_cv_required_check
    check (cv_storage_path is not null) not valid;

alter table public.freelancer_profiles
  drop constraint if exists freelancer_profiles_rate_currency_check;

alter table public.freelancer_profiles
  add constraint freelancer_profiles_monthly_salary_check
    check (monthly_salary_minor is null or monthly_salary_minor > 0),
  add constraint freelancer_profiles_rate_currency_check
    check (
      (monthly_salary_minor is null and hourly_rate_minor is null and day_rate_minor is null and currency is null)
      or (currency is not null and num_nonnulls(monthly_salary_minor, hourly_rate_minor, day_rate_minor) >= 1)
    );

comment on column public.freelancer_applications.monthly_salary_minor is
  'Applicant-declared gross monthly salary in currency minor units.';
comment on column public.freelancer_profiles.monthly_salary_minor is
  'Published gross monthly salary in currency minor units; applicant claim until explicitly verified.';

notify pgrst, 'reload schema';
commit;
