alter table public.projects
  alter column brief_schema_version set default 'freelancer-brief-v2';

alter table public.shortlists
  add column result_status text,
  add column decision_snapshot jsonb;

alter table public.matches
  add column evaluation_snapshot jsonb;

alter table public.shortlists
  add constraint shortlists_result_status_check
    check (
      result_status is null
      or result_status in (
        'ranked',
        'needs_clarification',
        'no_reliable_match'
      )
    ),
  add constraint shortlists_result_status_count_check
    check (
      result_status is null
      or (result_status = 'ranked' and result_count between 1 and 3)
      or (
        result_status in ('needs_clarification', 'no_reliable_match')
        and result_count = 0
      )
    ),
  add constraint shortlists_decision_snapshot_check
    check (
      decision_snapshot is null
      or (
        jsonb_typeof(decision_snapshot) = 'object'
        and octet_length(decision_snapshot::text) <= 32768
      )
    ),
  add constraint shortlists_v11_decision_required_check
    check (
      matching_rule_version <> 'freelancer-match-v11'
      or (result_status is not null and decision_snapshot is not null)
    );

alter table public.matches
  add constraint matches_evaluation_snapshot_check
    check (
      evaluation_snapshot is null
      or (
        jsonb_typeof(evaluation_snapshot) = 'object'
        and octet_length(evaluation_snapshot::text) <= 65536
      )
    ),
  add constraint matches_v11_evaluation_required_check
    check (
      matching_rule_version <> 'freelancer-match-v11'
      or evaluation_snapshot is not null
    );

-- Positive historical results are unambiguously ranked. Historical empty
-- results stay NULL because the old schema cannot distinguish an unclear brief
-- from a catalogue search that returned no acceptable profile.
update public.shortlists
set result_status = 'ranked'
where result_status is null
  and result_count > 0;

comment on column public.shortlists.result_status is
  'NULL on legacy zero-result rows means the historic outcome cannot be classified honestly.';
comment on column public.shortlists.decision_snapshot is
  'Versioned aggregate matching decision; NULL means no historic decision snapshot exists.';
comment on column public.matches.evaluation_snapshot is
  'Versioned per-profile matching evaluation; NULL means no historic evaluation snapshot exists.';

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
      'result_status', new.result_status,
      'matching_rule_version', new.matching_rule_version,
      'profile_catalog_version', new.profile_catalog_version
    )
  );
  return new;
end;
$$;
