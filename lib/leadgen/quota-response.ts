import { LEADGEN_OUTREACH_CREDITS } from "@/lib/ai/credit-policy";
import type { AiCreditSnapshot } from "@/lib/ai/quota";

/**
 * Wie eine abgelehnte Reservierung dem Betreiber gemeldet wird.
 *
 * Zuvor entschied allein `retryAfterSeconds` darüber: war er gesetzt, hieß es
 * „Anfragelimit erreicht", sonst „Guthaben reicht nicht". Damit bekam jede
 * Störung der Abrechnung — ein fehlender Dienstschlüssel, ein Fehler in der
 * Datenbank, ein Anfrageschlüssel, der nicht zum Voranschlag passt — die
 * Meldung, das Guthaben sei alle. Der Betreiber hätte Credits nachgekauft,
 * die er längst hat.
 *
 * Entschieden wird deshalb nach dem Grund, nicht nach dem Zeitstempel.
 */
export type QuotaRefusal = {
  status: 402 | 429 | 503;
  body: {
    error: string;
    reason: string;
    traceId: string;
    price?: { credits: number };
    credits?: AiCreditSnapshot | null;
  };
  headers: Record<string, string>;
};

/** Gründe, bei denen wirklich das Guthaben fehlt. */
const GUTHABEN_GRUENDE = new Set(["insufficient_credits"]);

/**
 * Gründe, die von selbst vergehen: Minutenlimit, Tageskontingent des
 * Anbieters, Monatsbudget. Alles davon ist eine Wartezeit, kein Kaufanlass.
 */
const WARTE_GRUENDE = new Set([
  "rate_limited",
  "user_daily_token_limit",
  "anonymous_user_daily_token_limit",
  "anonymous_ip_daily_token_limit",
  "provider_monthly_budget",
]);

export function quotaRefusal(input: {
  reason: string;
  retryAfterSeconds: number | null;
  credits: AiCreditSnapshot | null;
  traceId: string;
}): QuotaRefusal {
  const headers: Record<string, string> = {
    "Cache-Control": "private, no-store",
  };
  if (input.retryAfterSeconds !== null) {
    headers["Retry-After"] = String(input.retryAfterSeconds);
  }

  if (GUTHABEN_GRUENDE.has(input.reason)) {
    return {
      status: 402,
      body: {
        error: `Das Guthaben reicht nicht für ein Anschreiben (${LEADGEN_OUTREACH_CREDITS} Credits).`,
        reason: input.reason,
        price: { credits: LEADGEN_OUTREACH_CREDITS },
        credits: input.credits,
        traceId: input.traceId,
      },
      headers,
    };
  }

  if (WARTE_GRUENDE.has(input.reason) || input.retryAfterSeconds !== null) {
    return {
      status: 429,
      body: {
        error: "Das Anfragelimit ist erreicht. Bitte später erneut versuchen.",
        reason: input.reason,
        credits: input.credits,
        traceId: input.traceId,
      },
      headers,
    };
  }

  // Alles Übrige ist eine Störung, kein Limit. Eine neutrale Meldung ist
  // ehrlicher als eine erfundene Ursache.
  return {
    status: 503,
    body: {
      error: "Die Abrechnung ist gerade nicht erreichbar.",
      reason: input.reason,
      traceId: input.traceId,
    },
    headers,
  };
}
