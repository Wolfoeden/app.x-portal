-- Security hardening found during the V1 adversarial review.
-- Profile catalogue rows are server/operator-only; users receive only the
-- maximum-three snapshots created for their own deterministic shortlist.

begin;

drop policy if exists freelancer_profiles_select_eligible
  on public.freelancer_profiles;
revoke select on public.freelancer_profiles from anon, authenticated;

-- Only one unconsumed claim may exist per guest. The server replaces it when a
-- new sign-in flow starts, preventing unbounded claim-row creation.
create unique index if not exists guest_claims_one_open_per_guest_uidx
  on public.guest_claims (guest_user_id)
  where consumed_at is null;

-- Apply controller-configured hard-delete policies. Records marked
-- operator_review are deliberately excluded. No chat body, identity, IP hash or
-- deleted-row content is copied into the audit event.
create or replace function public.run_retention_cleanup()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_days integer;
  v_anonymous_users integer := 0;
  v_guest_claims integer := 0;
  v_messages integer := 0;
  v_shortlists integer := 0;
  v_ai_reservations integer := 0;
  v_ai_buckets integer := 0;
  v_audit_events integer := 0;
  v_result jsonb;
begin
  select retention_days into v_days
  from public.retention_policies
  where record_type = 'anonymous_auth_users'
    and is_enabled
    and deletion_mode = 'hard_delete';
  if v_days is not null then
    delete from auth.users u
    where u.is_anonymous
      and greatest(
        u.created_at,
        coalesce(u.updated_at, u.created_at),
        coalesce(u.last_sign_in_at, u.created_at)
      ) < now() - make_interval(days => v_days)
      and not exists (
        select 1 from public.projects p where p.owner_user_id = u.id
      )
      and not exists (
        select 1
        from public.guest_claims gc
        where gc.guest_user_id = u.id
          and gc.consumed_at is null
          and gc.expires_at > now()
      );
    get diagnostics v_anonymous_users = row_count;
  end if;

  select retention_days into v_days
  from public.retention_policies
  where record_type = 'guest_claims'
    and is_enabled
    and deletion_mode = 'hard_delete';
  if v_days is not null then
    delete from public.guest_claims
    where coalesce(consumed_at, expires_at) < now() - make_interval(days => v_days);
    get diagnostics v_guest_claims = row_count;
  end if;

  select retention_days into v_days
  from public.retention_policies
  where record_type = 'messages'
    and is_enabled
    and deletion_mode = 'hard_delete';
  if v_days is not null then
    delete from public.messages m
    using public.projects p
    where p.id = m.project_id
      and p.updated_at < now() - make_interval(days => v_days)
      and m.created_at < now() - make_interval(days => v_days);
    get diagnostics v_messages = row_count;
  end if;

  select retention_days into v_days
  from public.retention_policies
  where record_type = 'shortlists_and_matches'
    and is_enabled
    and deletion_mode = 'hard_delete';
  if v_days is not null then
    delete from public.shortlists
    where created_at < now() - make_interval(days => v_days);
    get diagnostics v_shortlists = row_count;
  end if;

  select retention_days into v_days
  from public.retention_policies
  where record_type = 'ai_usage'
    and is_enabled
    and deletion_mode = 'hard_delete';
  if v_days is not null then
    delete from public.ai_usage_reservations
    where settled_at is not null
      and settled_at < now() - make_interval(days => v_days);
    get diagnostics v_ai_reservations = row_count;

    delete from public.ai_usage_buckets
    where bucket_start < now() - make_interval(days => v_days);
    get diagnostics v_ai_buckets = row_count;
  end if;

  select retention_days into v_days
  from public.retention_policies
  where record_type = 'audit_events'
    and is_enabled
    and deletion_mode = 'anonymize';
  if v_days is not null then
    delete from public.audit_events
    where occurred_at < now() - make_interval(days => v_days);
    get diagnostics v_audit_events = row_count;
  end if;

  v_result := jsonb_build_object(
    'anonymous_users', v_anonymous_users,
    'guest_claims', v_guest_claims,
    'messages', v_messages,
    'shortlists', v_shortlists,
    'ai_reservations', v_ai_reservations,
    'ai_buckets', v_ai_buckets,
    'audit_events', v_audit_events
  );

  insert into public.audit_events (
    actor_tombstone, action, target_type, outcome, metadata
  ) values (
    'system:retention', 'retention_cleanup', 'retention_policies', 'success',
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.run_retention_cleanup() from public, anon, authenticated;
grant execute on function public.run_retention_cleanup() to service_role;

-- Supabase Cron/pg_cron runs the minimal cleanup once per day. Re-applying the
-- migration in a repaired staging environment cannot create a duplicate job.
create extension if not exists pg_cron;
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'xportal-retention-daily'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;
select cron.schedule(
  'xportal-retention-daily',
  '25 2 * * *',
  'select public.run_retention_cleanup();'
);

commit;
