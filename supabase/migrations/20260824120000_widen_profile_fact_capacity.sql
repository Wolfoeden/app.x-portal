-- Raise the per-profile fact capacity from 40 to 80.
--
-- Provenance is recorded per fact: sourceFor in lib/data/freelancers.ts marks a
-- skill verified only when verified_facts holds that exact value. A catalogue
-- that carries each competence in German and English therefore needs an entry
-- per language, and a fully verified profile needs one entry per skill.
--
-- At 40 that ceiling bound the operator's ability to record what they had
-- actually checked: two profiles in the current catalogue need 46 and 42
-- entries. 80 matches the limit skill_tags already carries, so the two columns
-- can no longer disagree about how many facts a profile may hold.

begin;

alter table public.freelancer_profiles
  drop constraint freelancer_profiles_facts_size_check,
  add constraint freelancer_profiles_facts_size_check
    check (
      cardinality(verified_facts) <= 80
      and cardinality(self_reported_facts) <= 80
    );

notify pgrst, 'reload schema';

commit;
