-- Matching v14 changes how a stated project condition the catalogue cannot
-- answer is scored: it now leaves the weighted average instead of counting as
-- a partial miss, so a detailed request no longer ranks a candidate below the
-- same candidate on a vague one. The rule version is bumped so a stored
-- decision stays attributable to the rules that actually produced it.
--
-- These constraints must name v14 explicitly, otherwise new shortlists would
-- silently stop requiring the audit snapshots that v11 through v13 require.

alter table public.shortlists
  drop constraint shortlists_v11_through_v13_decision_required_check,
  add constraint shortlists_v11_through_v14_decision_required_check
    check (
      matching_rule_version not in (
        'freelancer-match-v11',
        'freelancer-match-v12',
        'freelancer-match-v13',
        'freelancer-match-v14'
      )
      or (result_status is not null and decision_snapshot is not null)
    );

alter table public.matches
  drop constraint matches_v11_through_v13_evaluation_required_check,
  add constraint matches_v11_through_v14_evaluation_required_check
    check (
      matching_rule_version not in (
        'freelancer-match-v11',
        'freelancer-match-v12',
        'freelancer-match-v13',
        'freelancer-match-v14'
      )
      or evaluation_snapshot is not null
    );

comment on constraint shortlists_v11_through_v14_decision_required_check
  on public.shortlists is
  'Auditable v11 to v14 shortlists require their aggregate matching decision snapshot.';

comment on constraint matches_v11_through_v14_evaluation_required_check
  on public.matches is
  'Auditable v11 to v14 matches require their per-profile evaluation snapshot.';
