-- Ein Guthaben statt zwei.
--
-- Die Websuche wurde bis hierher aus `product_credit_accounts` bezahlt, einem
-- zweiten Konto mit eigener Reservierung, eigenem Ledger und eigener Währung.
-- In der Oberfläche standen dadurch zwei Zahlen nebeneinander, beide „Credits"
-- genannt. Welche für welche Funktion gilt, war nicht zu erkennen — und jede
-- weitere kostenpflichtige Funktion hätte die Frage neu aufgeworfen.
--
-- Ab jetzt läuft die Websuche über dieselbe Abrechnung wie jede andere
-- KI-Anfrage: `consume_ai_quota` reserviert, `record_ai_usage` belastet, und
-- der Preis steht als Festpreis in lib/ai/credit-policy.ts (CREDIT_PRICES).
-- Ein Anbieterfehler bucht dort null Credits, die Rückgabe der Reservierung
-- ist damit dieselbe wie bei Analyse und Chat.
--
-- Die alten Tabellen werden NICHT gelöscht. Sie enthalten die Buchungen der
-- bereits bezahlten Suchen, und die gehören zur Abrechnungshistorie. Sie
-- werden nur stillgelegt: nichts schreibt mehr hinein.

begin;

-- 1. Der Ergebnisspeicher hängt nicht mehr an einer Reservierung -------------
--
-- Er hatte nie eine andere Aufgabe, als ein bezahltes Ergebnis eine verlorene
-- HTTP-Antwort überleben zu lassen. Die Kopplung an die Reservierung des
-- zweiten Guthabens war der Abrechnungsweg, nicht der Zweck.

alter table public.external_freelancer_search_results
  alter column credit_reservation_id drop not null;

comment on column public.external_freelancer_search_results.credit_reservation_id is
  'Stillgelegt. Bis September 2026 die Reservierung aus dem zweiten Guthaben; '
  'seit der Zusammenlegung bleibt die Spalte für Altzeilen stehen und wird '
  'nicht mehr gesetzt.';

-- 2. Ablegen ohne Belastung --------------------------------------------------

create or replace function public.store_external_search_result(
  p_user_id uuid,
  p_project_id uuid,
  p_request_key text,
  p_result_snapshot jsonb,
  p_provider_response_id text,
  p_actual_model text
)
returns table (
  recorded boolean,
  reason text,
  result_count integer,
  result_snapshot jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.external_freelancer_search_results%rowtype;
  v_result_count integer;
  v_result_id uuid;
begin
  if p_user_id is null
     or p_project_id is null
     or p_request_key is null
     or char_length(btrim(p_request_key)) not between 8 and 200
     or p_result_snapshot is null
     or jsonb_typeof(p_result_snapshot) <> 'array'
     or jsonb_array_length(p_result_snapshot) > 3
     or octet_length(p_result_snapshot::text) > 65536
     or p_provider_response_id is null
     or char_length(btrim(p_provider_response_id)) not between 3 and 255
     or p_actual_model is null
     or char_length(btrim(p_actual_model)) not between 1 and 120
     or not exists (
       select 1 from public.projects p
        where p.id = p_project_id and p.owner_user_id = p_user_id
     ) then
    recorded := false;
    reason := 'invalid_input';
    return next;
    return;
  end if;

  -- Zwei gleichzeitige Anläufe unter demselben Schlüssel dürfen nicht zwei
  -- Zeilen anlegen. Derselbe Sperrbereich wie in complete_external_search.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(btrim(p_request_key), 903117)
  );

  select r.* into v_existing
    from public.external_freelancer_search_results r
   where r.request_key = btrim(p_request_key);

  if found then
    -- Ein fremder Schlüssel gibt nichts zurück, auch nicht die Zeilenzahl.
    if v_existing.owner_user_id is distinct from p_user_id
       or v_existing.project_id is distinct from p_project_id then
      recorded := false;
      reason := 'request_key_conflict';
      return next;
      return;
    end if;

    recorded := false;
    reason := 'already_stored';
    result_count := v_existing.result_count;
    result_snapshot := v_existing.result_snapshot;
    return next;
    return;
  end if;

  v_result_count := jsonb_array_length(p_result_snapshot);

  insert into public.external_freelancer_search_results (
    owner_user_id, project_id, request_key, credit_reservation_id,
    result_count, result_snapshot, provider_response_id, actual_model
  ) values (
    p_user_id, p_project_id, btrim(p_request_key), null,
    v_result_count, p_result_snapshot, btrim(p_provider_response_id),
    btrim(p_actual_model)
  ) returning id into v_result_id;

  insert into public.audit_events (
    actor_user_id, action, target_type, target_id, outcome, metadata
  ) values (
    p_user_id, 'external_freelancer_search_stored',
    'external_freelancer_search_results', v_result_id, 'success',
    jsonb_build_object(
      'request_key', btrim(p_request_key),
      'result_count', v_result_count,
      'provider_response_id', btrim(p_provider_response_id),
      'actual_model', btrim(p_actual_model)
    )
  );

  recorded := true;
  reason := 'stored';
  result_count := v_result_count;
  result_snapshot := p_result_snapshot;
  return next;
end;
$$;

revoke all on function public.store_external_search_result(
  uuid, uuid, text, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.store_external_search_result(
  uuid, uuid, text, jsonb, text, text
) to service_role;

-- 3. Das zweite Guthaben wird stillgelegt ------------------------------------
--
-- Kein Drop: die Zeilen belegen, was bereits bezahlt wurde. Der Kommentar ist
-- die Warnung an den nächsten, der die Tabelle im Studio findet.

comment on table public.product_credit_accounts is
  'STILLGELEGT seit 2026-09-01. Das zweite Guthaben für die Websuche wurde in '
  'user_ai_credit_accounts zusammengelegt. Bestände bleiben als Historie '
  'stehen, es wird nichts mehr gebucht.';
comment on table public.product_credit_reservations is
  'STILLGELEGT seit 2026-09-01. Siehe product_credit_accounts.';
comment on table public.product_credit_ledger is
  'STILLGELEGT seit 2026-09-01. Siehe product_credit_accounts.';

notify pgrst, 'reload schema';

commit;
