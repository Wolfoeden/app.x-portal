-- Eine Leserichtlinie statt zwei auf plan_team_members.
--
-- Zwei permissive SELECT-Policies für dieselbe Rolle bedeuten, dass PostgreSQL
-- bei jeder Zeile beide Ausdrücke auswertet und mit OR verknüpft. Das Ergebnis
-- ist identisch mit einer einzigen Policy, die dasselbe OR direkt enthält --
-- nur wird dann pro Zeile ein Ausdruck weniger ausgewertet. Der Supabase-Linter
-- meldet den Fall als `multiple_permissive_policies`:
-- https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies
--
-- Der Sichtbarkeitsumfang bleibt unverändert: die eigene Mitgliedszeile und,
-- wer einen Plan hält, alle Zeilen dieses Plans.

drop policy if exists plan_team_members_select_member on public.plan_team_members;
drop policy if exists plan_team_members_select_owner on public.plan_team_members;

create policy plan_team_members_select_own
  on public.plan_team_members
  for select
  to authenticated
  using (
    (select auth.uid()) = member_user_id
    or (select auth.uid()) = owner_user_id
  );
