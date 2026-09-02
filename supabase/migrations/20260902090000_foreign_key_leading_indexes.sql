-- Fremdschlüssel ohne führenden Index.
--
-- Ein Index auf der verweisenden Spalte wird nicht beim Lesen gebraucht,
-- sondern beim Löschen des Elternteils: Postgres muss dann jedes Mal fragen,
-- wer auf die verschwindende Zeile verweist. Ohne passenden Index geht das nur
-- mit einem vollständigen Durchlauf der Kindtabelle, unter Sperre — und zwar
-- bei jeder einzelnen gelöschten Elternzeile.
--
-- Übersetzt in die Vorgänge, die es hier gibt:
--
--   Konto löschen (Art. 17 DSGVO) -> freelancer_applications, zweimal
--   Projekt löschen              -> external_freelancer_search_results
--   Projektordner löschen        -> projects
--   Freelancer-Profil löschen    -> saved_freelancers
--   Reservierung aufräumen       -> product_credit_ledger
--   Abrechnungsperiode entfernen -> ai_free_usage_reservations
--
-- Bei den heutigen Zeilenzahlen (1 bis 141) merkt das niemand. Die
-- Abnahmeprüfung in supabase/tests/database/query_plan_evidence.sql legt
-- deshalb 4.000 Projekte, 20.000 Nachrichten und 3.000 Profile an: sie prüft
-- nicht den Ist-Zustand, sondern ob das Schema Wachstum aushält. Sie war
-- deswegen dauerhaft rot, und ein dauerhaft roter Pflichtlauf sagt beim
-- nächsten echten Befund nichts mehr.
--
-- Vier der sieben Spalten hatten bereits einen Index, in dem sie an zweiter
-- Stelle standen — für eine Fremdschlüsselprüfung nutzlos, weil die führende
-- Spalte in der Abfrage gar nicht vorkommt.
--
-- KEIN `concurrently`: die betroffenen Tabellen sind winzig, der Aufbau dauert
-- Millisekunden, und `create index concurrently` liefe nicht in dieser
-- Transaktion. Bei gewachsenen Tabellen wäre die Abwägung umgekehrt.

begin;

-- ------------------------------------------------- Spalten ohne NULL-Werte ---

-- Bisher nur als zweite Spalte in saved_freelancers_unique
-- (owner_user_id, freelancer_id). Greift ein Profil-Löschvorgang, wird danach
-- gesucht, nicht nach dem Eigentümer.
create index if not exists saved_freelancers_freelancer_idx
  on public.saved_freelancers (freelancer_id);

-- Bisher nur als zweite Spalte in
-- external_search_results_owner_project_created_idx.
create index if not exists external_search_results_project_idx
  on public.external_freelancer_search_results (project_id);

-- Der vorhandene ai_free_usage_reservations_open_idx (user_id, expires_at)
-- führt zwar mit user_id, hat aber die falsche zweite Spalte und ist zusätzlich
-- partiell auf status = 'reserved' — eine abgelaufene Reservierung stünde
-- nicht darin.
create index if not exists ai_free_usage_reservations_account_idx
  on public.ai_free_usage_reservations (user_id, period_start);

-- ---------------------------------------------------- Spalten mit NULL-Werten ---
--
-- Hier stehen partielle Indizes, wie schon bei
-- freelancer_applications_published_profile_idx und
-- product_credit_ledger_owner_created_idx. Das ist keine Sparmaßnahme auf
-- Kosten der Wirkung: die Fremdschlüsselprüfung sucht immer nach
-- `spalte = <id>`, und daraus folgt `spalte is not null` — der Planer darf den
-- Index also verwenden. Die überwiegend leeren Spalten blähen ihn dafür nicht
-- auf. Die Abnahmeprüfung akzeptiert partielle Indizes ausdrücklich; sie
-- verlangt nur einen gültigen Index, dessen führende Spalten dem
-- Fremdschlüssel entsprechen.

create index if not exists freelancer_applications_reviewed_by_idx
  on public.freelancer_applications (reviewed_by_user_id)
  where reviewed_by_user_id is not null;

create index if not exists freelancer_applications_sourced_by_idx
  on public.freelancer_applications (sourced_by_user_id)
  where sourced_by_user_id is not null;

create index if not exists product_credit_ledger_reservation_idx
  on public.product_credit_ledger (reservation_id)
  where reservation_id is not null;

-- Die meisten Projekte liegen in keinem Ordner; ein vollständiger Index wäre
-- hier überwiegend eine Liste von NULL-Werten.
create index if not exists projects_collection_idx
  on public.projects (collection_id)
  where collection_id is not null;

-- ------------------------------------------------------------- Gegenprobe ---
--
-- Dieselbe Bedingung, die die Abnahmeprüfung stellt. Bleibt ein Fremdschlüssel
-- übrig, bricht die Migration ab, statt einen grünen Eindruck zu hinterlassen.
do $$
declare
  v_missing text;
begin
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ')
    into v_missing
  from pg_constraint c
  where c.contype = 'f'
    and c.connamespace = 'public'::regnamespace
    and not exists (
      select 1
      from pg_index i
      where i.indrelid = c.conrelid
        and i.indisvalid
        and i.indisready
        and i.indnkeyatts >= cardinality(c.conkey)
        and not exists (
          select 1
          from generate_subscripts(c.conkey, 1) as key_position(position)
          where i.indkey[key_position.position - 1] <> c.conkey[key_position.position]
        )
    );

  if v_missing is not null then
    raise exception
      'Fremdschluessel ohne fuehrenden Index verblieben: %', v_missing;
  end if;
end;
$$;

commit;
