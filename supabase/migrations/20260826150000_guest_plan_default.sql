-- Korrektur zu 20260826140000_plans_and_plan_teams.sql.
--
-- Der Constraint verlangt fuer eine Gastsitzung plan_id = 'guest', die Spalte
-- hat aber den Default 'free'. get_ai_credit_snapshot legt ein Konto ohne
-- plan_id an — jede neue Gastsitzung lief damit in eine
-- Constraint-Verletzung und bekam gar kein Guthabenkonto mehr.
--
-- Ein Spalten-Default kann nicht von einer anderen Spalte abhaengen, deshalb
-- ein Trigger. Er normalisiert statt abzulehnen: die Stufe einer Gastsitzung
-- ist keine Wahl, sie folgt aus der Anonymitaet.

begin;

create or replace function private.normalize_credit_account_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_anonymous then
    new.plan_id := 'guest';
  elsif new.plan_id = 'guest' then
    -- Aus einer Gastsitzung wird beim Registrieren ein Konto. Die Gaststufe
    -- darf dann nicht haengenbleiben, sonst behielte der Nutzer 100 statt 300.
    new.plan_id := 'free';
  end if;
  return new;
end;
$$;

create trigger user_ai_credit_accounts_normalize_plan
  before insert or update on public.user_ai_credit_accounts
  for each row execute function private.normalize_credit_account_plan();

revoke all on function private.normalize_credit_account_plan()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
