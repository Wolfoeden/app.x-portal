import "server-only";

import { createHash } from "node:crypto";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { takeRateLimit, type RateLimitDecision } from "./rate-limit";
import { logEvent } from "./request";

/**
 * Die Ratenbegrenzung über alle Funktionsinstanzen hinweg.
 *
 * `takeRateLimit` zählt im Prozessspeicher. Auf Netlify bedient jede Route
 * mehrere, kurzlebige Instanzen — aufeinanderfolgende Anfragen desselben
 * Absenders landen in verschiedenen Prozessen, und nach einem Kaltstart ist
 * der Zähler leer. Ein Limit, das sich so umgehen lässt, ist keines.
 *
 * Der gemeinsame Zähler liegt deshalb in Postgres (siehe
 * `20260828120000_shared_rate_limit_counters.sql`). Der lokale Zähler bleibt
 * trotzdem davor stehen, aus zwei Gründen: er spart bei einem laufenden
 * Angriff den Datenbankaufruf, und er ist die Untergrenze, die auch dann noch
 * gilt, wenn die Datenbank gerade nicht antwortet.
 */

/** Der Schlüssel muss in die Spalte passen; lange Schlüssel werden verdichtet. */
const MAX_KEY_LENGTH = 200;

/** Damit ein Datenbankausfall nicht jede Anfrage einzeln ins Log schreibt. */
const DEGRADATION_LOG_INTERVAL_MS = 60_000;

let lastDegradationLogAt = 0;

function storageKey(key: string): string {
  if (key.length <= MAX_KEY_LENGTH) return key;
  // Kürzen würde zwei verschiedene Absender auf denselben Zähler werfen.
  return `h:${createHash("sha256").update(key).digest("hex")}`;
}

function reportDegradation(error: unknown, now: number): void {
  if (now - lastDegradationLogAt < DEGRADATION_LOG_INTERVAL_MS) return;
  lastDegradationLogAt = now;
  logEvent("rate_limit_shared_unavailable", {
    // Kein Schlüssel und keine Absenderangabe: das Log soll den Ausfall
    // melden, nicht nachzeichnen, wer gerade angefragt hat.
    reason:
      error instanceof Error ? error.message.slice(0, 200) : "unknown_error",
  });
}

type RateLimitRow = {
  allowed?: unknown;
  remaining?: unknown;
  retry_after_seconds?: unknown;
};

function decisionFromRow(row: RateLimitRow, limit: number): RateLimitDecision {
  if (typeof row.allowed !== "boolean") {
    throw new Error("malformed_rate_limit_row");
  }

  const remaining =
    typeof row.remaining === "number" && Number.isFinite(row.remaining)
      ? Math.max(0, Math.min(limit, Math.trunc(row.remaining)))
      : 0;
  const retryAfterSeconds =
    typeof row.retry_after_seconds === "number" &&
    Number.isFinite(row.retry_after_seconds)
      ? Math.max(0, Math.trunc(row.retry_after_seconds))
      : 0;

  return {
    allowed: row.allowed,
    remaining,
    // Eine Ablehnung ohne verwertbares Retry-After lässt den Aufrufer raten.
    retryAfterSeconds:
      row.allowed || retryAfterSeconds > 0 ? retryAfterSeconds : 1,
  };
}

/**
 * Zählt eine Anfrage in beiden Zählern und gibt die strengere Entscheidung
 * zurück. Fällt der gemeinsame Zähler aus, bleibt die lokale Entscheidung
 * stehen — schlechter als der gemeinsame Zähler, aber besser als offen.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMilliseconds = 60_000,
): Promise<RateLimitDecision> {
  const local = takeRateLimit(key, limit, windowMilliseconds);
  if (!local.allowed) return local;

  const now = Date.now();
  try {
    const { data, error } = await createAdminSupabaseClient().rpc(
      "consume_rate_limit",
      {
        p_key: storageKey(key),
        p_limit: limit,
        p_window_seconds: Math.max(1, Math.ceil(windowMilliseconds / 1_000)),
      },
    );
    if (error) throw new Error(error.message);

    const row = (Array.isArray(data) ? data[0] : data) as RateLimitRow | null;
    if (!row) throw new Error("empty_rate_limit_result");
    return decisionFromRow(row, limit);
  } catch (error) {
    // Auch der fehlende Service-Role-Key landet hier: in einer Umgebung ohne
    // Datenbankzugang bleibt der lokale Zähler die einzige Bremse.
    reportDegradation(error, now);
    return local;
  }
}

export function resetSharedRateLimitStateForTests(): void {
  lastDegradationLogAt = 0;
}
