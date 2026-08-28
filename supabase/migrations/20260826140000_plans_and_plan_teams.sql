-- Stufen und Team-Zugang.
--
-- Bisher stand auf einem Guthabenkonto nur eine Zahl. Woher sie kam — Gast,
-- angemeldet oder gekauft — liess sich nur raten, und beim Monatswechsel
-- setzte roll_ai_credit_period `credits_used` zurueck, ohne `credits_total`
-- je wieder gegen die konfigurierte Stufe zu pruefen. Bestandskonten trugen
-- deshalb Betraege wie 50.000 unbefristet weiter.
--
-- `plan_id` macht die Stufe explizit. Sie ist die Quelle, `credits_total`
-- die Ableitung.
--
-- `plan_team_members` ist der zweite Teil: wer einen Plan gekauft hat, kann
-- Konten einladen, die daraus mitbezahlen. Ein Konto gehoert zu hoechstens
-- einem Team — deshalb ist `member_user_id` der Primaerschluessel. Ohne diese
-- Eindeutigkeit waere bei einer Anfrage nicht entscheidbar, welcher Pool
-- belastet wird.

begin;

-- ---------------------------------------------------------------- Stufen ---

alter table public.user_ai_credit_accounts
  add column if not exists plan_id text not null default 'free';

-- Bestandskonten: Gastsitzungen auf die Gaststufe, alles andere auf 'free'.
-- Die Betraege selbst bleiben unangetastet — ein bereits zugesagtes Guthaben
-- rueckwirkend zu kuerzen waere eine Produktentscheidung, keine Migration.
update public.user_ai_credit_accounts
   set plan_id = 'guest'
 where is_anonymous = true;

alter table public.user_ai_credit_accounts
  drop constraint if exists user_ai_credit_accounts_plan_check;
alter table public.user_ai_credit_accounts
  add constraint user_ai_credit_accounts_plan_check
  check (plan_id in ('guest', 'free', 'enterprise'));

-- Eine Gastsitzung kann keinen bezahlten Plan tragen: sie ueberlebt den
-- Browserwechsel nicht, ein Kauf darauf waere verloren.
alter table public.user_ai_credit_accounts
  drop constraint if exists user_ai_credit_accounts_guest_plan_check;
alter table public.user_ai_credit_accounts
  add constraint user_ai_credit_accounts_guest_plan_check
  check (is_anonymous = false or plan_id = 'guest');

-- ------------------------------------------------------------------ Team ---

create table public.plan_team_members (
  member_user_id uuid primary key
    references auth.users (id) on delete cascade,
  owner_user_id uuid not null
    references auth.users (id) on delete cascade,
  invited_at timestamptz not null default now(),
  constraint plan_team_members_not_self
    check (owner_user_id <> member_user_id)
);

-- Die Mitgliederliste wird immer fuer einen Inhaber gelesen.
create index plan_team_members_owner_idx
  on public.plan_team_members (owner_user_id, invited_at desc);

-- Beide Seiten muessen dauerhafte Konten sein, und ein Mitglied darf nicht
-- selbst Inhaber eines Teams sein. Sonst entstuende eine Kette, an deren Ende
-- nicht mehr feststeht, wer zahlt.
create or replace function private.validate_plan_team_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from auth.users u
    where u.id = new.owner_user_id
      and coalesce(u.is_anonymous, false) = false
  ) then
    raise exception 'a plan team owner must be a permanent account'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = new.member_user_id
      and coalesce(u.is_anonymous, false) = false
  ) then
    raise exception 'a plan team member must be a permanent account'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.plan_team_members t
    where t.owner_user_id = new.member_user_id
  ) then
    raise exception 'a plan team owner cannot join another team'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.plan_team_members t
    where t.member_user_id = new.owner_user_id
  ) then
    raise exception 'a plan team member cannot own a team'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger plan_team_members_validate
  before insert or update on public.plan_team_members
  for each row execute function private.validate_plan_team_member();

alter table public.plan_team_members enable row level security;
alter table public.plan_team_members force row level security;

-- Lesend: das Mitglied sieht seine eigene Zugehoerigkeit, der Inhaber sein
-- Team. Jede Schreiboperation laeuft ueber die Service-Rolle, wie bei
-- saved_freelancers.
create policy plan_team_members_select_member
  on public.plan_team_members for select to authenticated
  using ((select auth.uid()) = member_user_id);

create policy plan_team_members_select_owner
  on public.plan_team_members for select to authenticated
  using ((select auth.uid()) = owner_user_id);

revoke all on public.plan_team_members from public, anon;
grant select on public.plan_team_members to authenticated;
grant all on public.plan_team_members to service_role;

revoke all on function private.validate_plan_team_member()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
