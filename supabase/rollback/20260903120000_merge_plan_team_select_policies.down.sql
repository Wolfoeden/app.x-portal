-- Stellt die beiden getrennten Leserichtlinien auf plan_team_members wieder her.
-- Fachlich identisch mit der zusammengefassten Policy, nur wieder als zwei
-- permissive Ausdrücke, die PostgreSQL pro Zeile beide auswertet.

drop policy if exists plan_team_members_select_own on public.plan_team_members;

create policy plan_team_members_select_member
  on public.plan_team_members
  for select
  to authenticated
  using ((select auth.uid()) = member_user_id);

create policy plan_team_members_select_owner
  on public.plan_team_members
  for select
  to authenticated
  using ((select auth.uid()) = owner_user_id);
