-- Eine Suche ohne Konto darf die Datenbank nicht anhalten.
--
-- Seit `shortlists` auch die Ausschreibungen aus der Akquise aufnimmt, gibt es
-- dort Zeilen ohne `owner_user_id`: Ein Lead hat kein Konto und wird nie eins
-- haben. Zwei Stellen waren darauf nicht vorbereitet, und beide brachen erst
-- auf, als der Abgleich zum ersten Mal wirklich schrieb -- der Probelauf
-- vorher war ein `dryRun` und hat nie eine Zeile angelegt.
--
--   1. Der Audit-Trigger schrieb `owner_user_id` als Akteur. Bei einer
--      Lead-Zeile ist die Spalte leer, und `audit_events_actor_check`
--      verlangt entweder ein Konto oder einen Grabstein. Der Insert scheiterte
--      damit vollstaendig, die Route antwortete 500, und in der
--      Warteschlange blieb alles stehen.
--
--   2. Der Fremdschluessel auf den Lead loescht mit `on delete set null`, der
--      Formcheck verlangte aber bei `source = 'lead'` eine gesetzte
--      Lead-Kennung. Beides zusammen heisst: Ein Lead, der die
--      Aufbewahrungsfrist erreicht, laesst sich nicht mehr loeschen. Der
--      naechtliche Lauf von `run_leadgen_cleanup()` waere daran gescheitert,
--      sobald die erste Lead-Zeile in `shortlists` steht.

begin;

-- 1. Der Akteur, wenn es keinen gibt ----------------------------------------
--
-- Dieselbe Form, die die Aufbewahrungsroutinen schon benutzen:
-- `system:<vorgang>`. Damit steht im Protokoll, was gehandelt hat, ohne ein
-- Konto zu erfinden, das es nicht gibt.
--
-- Die Herkunft wandert in die Metadaten. Ohne sie liesse sich eine Zeile
-- ohne Konto nicht von einer unterscheiden, deren Konto spaeter geloescht
-- wurde.

create or replace function private.audit_shortlist_created()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.audit_events (
    actor_user_id,
    actor_tombstone,
    action,
    target_type,
    target_id,
    outcome,
    metadata
  ) values (
    new.owner_user_id,
    case
      when new.owner_user_id is null then 'system:leadgen-match'
      else null
    end,
    'shortlist_created',
    'shortlist',
    new.id,
    'success',
    jsonb_build_object(
      'source', new.source,
      'project_id', new.project_id,
      'result_count', new.result_count,
      'result_status', new.result_status,
      'matching_rule_version', new.matching_rule_version,
      'profile_catalog_version', new.profile_catalog_version
    )
  );
  return new;
end;
$$;

-- 2. Der Lead darf verschwinden ---------------------------------------------
--
-- Die Absicht stand schon in 20260907120000: "Bleibt beim Loeschen des Leads
-- leer stehen -- die Nachfrage bleibt wahr, auch wenn der Lead weg ist." Der
-- Formcheck hat das verhindert, statt es zuzulassen.
--
-- Die Form bleibt im Uebrigen streng: Eine Zeile aus der Akquise traegt
-- weiterhin weder Projekt noch Konto, und eine Nutzersuche traegt beides.
-- Nur die Lead-Kennung darf fehlen, und zwar genau in dem einen Fall, in dem
-- sie nachtraeglich entfernt wurde.

alter table public.shortlists
  drop constraint if exists shortlists_source_shape_check;
alter table public.shortlists
  add constraint shortlists_source_shape_check
  check (
    (
      source = 'user_search'
      and project_id is not null
      and owner_user_id is not null
      and lead_id is null
    )
    or (
      source = 'lead'
      and project_id is null
      and owner_user_id is null
    )
  );

comment on constraint shortlists_source_shape_check on public.shortlists is
  'Je Herkunft genau eine Form. Die Lead-Kennung darf fehlen, weil der '
  'Fremdschluessel sie beim Loeschen des Leads entfernt -- die Nachfrage '
  'bleibt trotzdem wahr.';

commit;
