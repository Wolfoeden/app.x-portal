-- Ruecknahme zu 20260826140000_plans_and_plan_teams.sql und der Korrektur
-- 20260826150000_guest_plan_default.sql.
--
-- Liegt bewusst ausserhalb von supabase/migrations, damit die CLI sie nicht
-- als naechste Vorwaertsmigration einspielt. Sie wird von Hand ausgefuehrt,
-- siehe docs/deployment-and-rollback.md.
--
-- Verlust bei der Ausfuehrung: die Zuordnung, wer aus wessen Plan bezahlt,
-- und die Stufe jedes Kontos. Die Guthabenbetraege selbst bleiben unberuehrt,
-- weil die Vorwaertsmigration sie nie angefasst hat. Ein Konto mit 1.500
-- Credits behaelt sie also auch danach — nur die Angabe, dass es sich um die
-- gekaufte Stufe handelt, ist dann fort.

begin;

-- Erst der Trigger: er liest die Spalte, die weiter unten entfernt wird.
drop trigger if exists user_ai_credit_accounts_normalize_plan
  on public.user_ai_credit_accounts;
drop function if exists private.normalize_credit_account_plan();

drop trigger if exists plan_team_members_validate on public.plan_team_members;
drop table if exists public.plan_team_members;
drop function if exists private.validate_plan_team_member();

alter table public.user_ai_credit_accounts
  drop constraint if exists user_ai_credit_accounts_guest_plan_check;
alter table public.user_ai_credit_accounts
  drop constraint if exists user_ai_credit_accounts_plan_check;
alter table public.user_ai_credit_accounts
  drop column if exists plan_id;

notify pgrst, 'reload schema';

commit;
