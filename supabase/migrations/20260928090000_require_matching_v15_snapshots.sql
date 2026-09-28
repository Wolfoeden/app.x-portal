-- Matching v15 adds the role family as a reliability condition: a profile
-- whose role contradicts the requested one is no longer recommended, only
-- shown as a partial match with the deviation as a stated gap. The rule
-- version is bumped so a stored decision stays attributable to the rules that
-- actually produced it.
--
-- These constraints must name v15 explicitly, otherwise new shortlists would
-- silently stop requiring the audit snapshots that v11 through v14 require.
-- Until this migration runs, v15 rows are written unchecked; nothing fails.

alter table public.shortlists
  drop constraint shortlists_v11_through_v14_decision_required_check,
  add constraint shortlists_v11_through_v15_decision_required_check
    check (
      matching_rule_version not in (
        'freelancer-match-v11',
        'freelancer-match-v12',
        'freelancer-match-v13',
        'freelancer-match-v14',
        'freelancer-match-v15'
      )
      or (result_status is not null and decision_snapshot is not null)
    );

alter table public.matches
  drop constraint matches_v11_through_v14_evaluation_required_check,
  add constraint matches_v11_through_v15_evaluation_required_check
    check (
      matching_rule_version not in (
        'freelancer-match-v11',
        'freelancer-match-v12',
        'freelancer-match-v13',
        'freelancer-match-v14',
        'freelancer-match-v15'
      )
      or evaluation_snapshot is not null
    );

comment on constraint shortlists_v11_through_v15_decision_required_check
  on public.shortlists is
  'Auditable v11 to v15 shortlists require their aggregate matching decision snapshot.';

comment on constraint matches_v11_through_v15_evaluation_required_check
  on public.matches is
  'Auditable v11 to v15 matches require their per-profile evaluation snapshot.';
