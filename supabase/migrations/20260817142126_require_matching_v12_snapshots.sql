alter table public.shortlists
  drop constraint shortlists_v11_decision_required_check,
  add constraint shortlists_v11_plus_decision_required_check
    check (
      matching_rule_version not in (
        'freelancer-match-v11',
        'freelancer-match-v12'
      )
      or (result_status is not null and decision_snapshot is not null)
    );

alter table public.matches
  drop constraint matches_v11_evaluation_required_check,
  add constraint matches_v11_plus_evaluation_required_check
    check (
      matching_rule_version not in (
        'freelancer-match-v11',
        'freelancer-match-v12'
      )
      or evaluation_snapshot is not null
    );

comment on constraint shortlists_v11_plus_decision_required_check
  on public.shortlists is
  'Auditable v11 and v12 shortlists require their aggregate matching decision snapshot.';

comment on constraint matches_v11_plus_evaluation_required_check
  on public.matches is
  'Auditable v11 and v12 matches require their per-profile evaluation snapshot.';
