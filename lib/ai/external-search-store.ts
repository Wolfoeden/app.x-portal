import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { ExternalFreelancerCandidate } from "@/lib/openai/external-freelancer-search";

/**
 * Der Ablageort für ein bezahltes Suchergebnis.
 *
 * Eine Websuche kostet Credits und einen Anbieteraufruf. Geht die HTTP-Antwort
 * unterwegs verloren — Netzwechsel, geschlossener Reiter, Zeitüberschreitung im
 * Browser —, dann darf der zweite Anlauf nicht noch einmal beides kosten.
 * Deshalb liegt das Ergebnis unter demselben `request_key` in der Datenbank und
 * wird von dort zurückgegeben.
 *
 * Bis September 2026 hing dieser Speicher an einer Reservierung aus dem
 * zweiten Guthaben. Das Guthaben ist zusammengelegt, die Abrechnung läuft
 * jetzt über `executeTrackedAiRequest` wie bei jeder anderen Anfrage — und
 * dieser Speicher tut nur noch das, wofür er da war: das Ergebnis aufbewahren.
 */

export type StoredExternalSearchResult = {
  candidates: ExternalFreelancerCandidate[];
  providerResponseId: string;
  actualModel: string;
  createdAt: string;
};

type Row = Record<string, unknown>;

function firstRow(value: unknown): Row | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? (row as Row) : null;
}

function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`invalid_external_search_${key}`);
  }
  return value;
}

/** Höchstens drei Karten — mehr gibt die Suche nicht aus, mehr wird nicht angenommen. */
function candidateSnapshot(row: Row): ExternalFreelancerCandidate[] {
  const value = row.result_snapshot;
  if (!Array.isArray(value) || value.length > 3) {
    throw new Error("invalid_external_search_snapshot");
  }
  return value as ExternalFreelancerCandidate[];
}

function requireServiceRole(): void {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error("external_search_store_not_configured");
  }
}

export async function getExternalSearchResult(input: {
  userId: string;
  projectId: string;
  requestKey: string;
}): Promise<StoredExternalSearchResult | null> {
  requireServiceRole();
  const { data, error } = await createAdminSupabaseClient().rpc(
    "get_external_search_result",
    {
      p_user_id: input.userId,
      p_project_id: input.projectId,
      p_request_key: input.requestKey,
    },
  );
  if (error) throw error;
  const row = firstRow(data);
  if (!row || row.result_found !== true) return null;
  return {
    candidates: candidateSnapshot(row),
    providerResponseId: text(row, "provider_response_id"),
    actualModel: text(row, "actual_model"),
    createdAt: text(row, "created_at"),
  };
}

export type StoredExternalSearch = {
  /** Falsch, wenn unter diesem Schlüssel schon ein Ergebnis lag. */
  recorded: boolean;
  reason: "stored" | "already_stored";
  candidates: ExternalFreelancerCandidate[];
};

/**
 * Legt das Ergebnis ab. Ein zweiter Aufruf mit demselben Schlüssel gibt das
 * bereits abgelegte Ergebnis zurück, statt eine zweite Zeile anzulegen — die
 * Belastung hat die Abrechnung schon vorgenommen und darf sich nicht
 * wiederholen.
 */
export async function storeExternalSearchResult(input: {
  userId: string;
  projectId: string;
  requestKey: string;
  candidates: ExternalFreelancerCandidate[];
  providerResponseId: string;
  actualModel: string;
}): Promise<StoredExternalSearch> {
  requireServiceRole();
  const { data, error } = await createAdminSupabaseClient().rpc(
    "store_external_search_result",
    {
      p_user_id: input.userId,
      p_project_id: input.projectId,
      p_request_key: input.requestKey,
      p_result_snapshot: input.candidates,
      p_provider_response_id: input.providerResponseId,
      p_actual_model: input.actualModel,
    },
  );
  if (error) throw error;
  const row = firstRow(data);
  const reason = row?.reason;
  if (!row || (reason !== "stored" && reason !== "already_stored")) {
    throw new Error(
      `external_search_not_stored:${typeof reason === "string" ? reason : "unknown"}`,
    );
  }
  return {
    recorded: row.recorded === true,
    reason,
    candidates: candidateSnapshot(row),
  };
}
