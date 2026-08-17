alter table public.shortlists
  add column partial_matches_snapshot jsonb not null default '[]'::jsonb,
  add constraint shortlists_partial_matches_snapshot_check
    check (
      jsonb_typeof(partial_matches_snapshot) = 'array'
      and jsonb_array_length(partial_matches_snapshot) <= 2
      and octet_length(partial_matches_snapshot::text) <= 262144
      and (
        result_status = 'no_reliable_match'
        or jsonb_array_length(partial_matches_snapshot) = 0
      )
    );

alter table public.shortlists
  drop constraint shortlists_v11_plus_decision_required_check,
  add constraint shortlists_v11_through_v13_decision_required_check
    check (
      matching_rule_version not in (
        'freelancer-match-v11',
        'freelancer-match-v12',
        'freelancer-match-v13'
      )
      or (result_status is not null and decision_snapshot is not null)
    );

alter table public.matches
  drop constraint matches_v11_plus_evaluation_required_check,
  add constraint matches_v11_through_v13_evaluation_required_check
    check (
      matching_rule_version not in (
        'freelancer-match-v11',
        'freelancer-match-v12',
        'freelancer-match-v13'
      )
      or evaluation_snapshot is not null
    );

comment on column public.shortlists.partial_matches_snapshot is
  'At most two deterministic internal overlaps below the recommendation gate. These snapshots never authorize booking or contact.';

comment on constraint shortlists_partial_matches_snapshot_check
  on public.shortlists is
  'Non-recommended partial matches are bounded and may exist only for a no-reliable-match decision.';
