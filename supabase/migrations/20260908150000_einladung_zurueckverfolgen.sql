-- Die Einladung kommt zurück.
--
-- Bisher verlinkte die Ansprache auf `/freelancer/apply` ohne Kennzeichen. Wer
-- sich daraufhin eintrug, erzeugte eine neue Bewerbung; der recherchierte
-- Datensatz blieb unberührt liegen und wurde nach dreißig Tagen gelöscht.
--
-- Damit war **nicht messbar, ob eine Einladung gewirkt hat** — und ohne diese
-- Zahl lässt sich nicht entscheiden, ob der ganze Weg sein Geld wert ist. Fünf
-- Cent je Adresse und ein Modellaufruf je Person sind billig, wenn jede
-- zwanzigste Einladung ein Profil bringt, und Verschwendung, wenn keine.

begin;

alter table public.freelancer_applications
  add column if not exists invite_opened_at timestamptz,
  add column if not exists converted_at timestamptz,
  add column if not exists converted_application_id uuid
    references public.freelancer_applications (id) on delete set null;

comment on column public.freelancer_applications.invite_opened_at is
  'Wann jemand den Einladungslink dieses Kandidaten geöffnet hat. Erster '
  'Zeitpunkt, nicht der letzte — die Frage ist, ob die Einladung ankam.';

comment on column public.freelancer_applications.converted_at is
  'Wann aus der Einladung eine Anmeldung wurde. Der Beleg dafür, dass sich '
  'der Aufwand für diese Person gelohnt hat.';

comment on column public.freelancer_applications.converted_application_id is
  'Die Bewerbung, die daraus entstand. Sie steht als eigene Zeile da, weil '
  'sie einem angemeldeten Konto gehört und der Kandidat keinem.';

-- Eine Zeile kann nicht ihre eigene Folge sein.
alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_converted_self_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_converted_self_check
  check (converted_application_id is null or converted_application_id <> id);

-- Der Zeitpunkt und die Zeile gehören zusammen: Ein `converted_at` ohne
-- Bewerbung wäre eine Behauptung ohne Beleg.
alter table public.freelancer_applications
  drop constraint if exists freelancer_applications_converted_shape_check;
alter table public.freelancer_applications
  add constraint freelancer_applications_converted_shape_check
  check ((converted_at is null) = (converted_application_id is null));

create index if not exists freelancer_applications_konversion_idx
  on public.freelancer_applications (converted_at)
  where source = 'web_research' and converted_at is not null;

-- Ein angemeldeter Kandidat darf nicht mehr verfallen.
--
-- `run_sourced_candidate_cleanup()` löscht bisher jede unbeantwortete
-- Recherche nach dreißig Tagen. Wer sich eingetragen hat, hat geantwortet —
-- und sein Datensatz ist ab dann der Beleg, dass die Einladung gewirkt hat.
create or replace function public.run_sourced_candidate_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_deleted integer := 0;
  v_result jsonb;
begin
  select retention_days into v_days
    from public.retention_policies
   where record_type = 'sourced_candidates'
     and is_enabled and deletion_mode = 'hard_delete';

  if v_days is not null then
    delete from public.freelancer_applications
     where source = 'web_research'
       and status = 'sourced'
       and consent_at is null
       -- Neu: Wer sich eingetragen hat, bleibt. Der Datensatz ist der Beleg
       -- der Konversion und enthält ab dann keine Daten mehr, die die Person
       -- nicht selbst beigetragen hätte.
       and converted_at is null
       and sourced_at is not null
       and sourced_at < now() - make_interval(days => v_days);
    get diagnostics v_deleted = row_count;
  end if;

  v_result := jsonb_build_object(
    'sourced_candidates', v_deleted,
    'retention_days', coalesce(v_days, -1)
  );

  insert into public.audit_events (
    actor_tombstone, action, target_type, outcome, metadata
  ) values (
    'system:sourced-retention', 'sourced_candidate_cleanup',
    'freelancer_application', 'success', v_result
  );

  return v_result;
end;
$$;

commit;
