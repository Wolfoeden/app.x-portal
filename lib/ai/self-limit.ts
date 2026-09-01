import "server-only";

import { CREDIT_PLANS, creditPlan } from "@/lib/ai/credit-policy";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Das Limit, das ein zahlender Kunde sich selbst setzt.
 *
 * Enterprise wird nach Verbrauch abgerechnet. Wer das bucht, will vorher
 * wissen, wie hoch die Rechnung hoechstens ausfaellt — und zwar selbst
 * einstellbar, ohne anzurufen.
 *
 * Durchgesetzt wird es nicht an einer neuen Stelle, sondern ueber das
 * Kontingent der laufenden Periode: die Datenbankfunktion senkt
 * `credits_total`. Damit greift jede bestehende Pruefung unveraendert weiter.
 */

/** Die Obergrenze, die sich ueberhaupt einstellen laesst. */
export const SELF_LIMIT_MAX = CREDIT_PLANS.enterprise.monthlyCredits;

/**
 * Was das volle Kontingent hoechstens kostet.
 *
 * Steht hier neben der Credit-Zahl und nicht nur in der Oberflaeche: die
 * beiden Zahlen gehoeren zusammen, und getrennt gepflegt laufen sie
 * auseinander.
 */
export const SELF_LIMIT_MAX_EURO = 50;

export type SelfLimitResult =
  | { ok: true; limit: number | null; creditsTotal: number }
  | { ok: false; reason: "not_entitled" | "out_of_range" | "unavailable" };

/**
 * Prueft den eingegebenen Wert.
 *
 * `null` heisst ausdruecklich "kein Limit" und ist etwas anderes als 0 — die
 * Null waere ein Konto, das nichts mehr darf. Beides muss unterscheidbar
 * bleiben, sonst schaltet ein geleertes Feld den Zugang ab.
 */
export function parseSelfLimit(value: unknown): number | null | "invalid" {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return "invalid";
  if (value < 0 || value > SELF_LIMIT_MAX) return "invalid";
  return value;
}

export async function setSelfCreditLimit(input: {
  userId: string;
  isAnonymous: boolean;
  planId: string | null;
  limit: number | null;
}): Promise<SelfLimitResult> {
  // Nur wer nach Verbrauch abgerechnet wird, hat hier etwas einzustellen.
  const plan = creditPlan(input.planId, input.isAnonymous);
  if (input.isAnonymous || !plan.purchasable) {
    return { ok: false, reason: "not_entitled" };
  }
  if (input.limit !== null && (input.limit < 0 || input.limit > plan.monthlyCredits)) {
    return { ok: false, reason: "out_of_range" };
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return { ok: false, reason: "unavailable" };
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("set_ai_credit_self_limit", {
    p_user_id: input.userId,
    p_limit: input.limit,
    p_plan_allowance: plan.monthlyCredits,
  });
  if (error) return { ok: false, reason: "unavailable" };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { credits_total?: unknown; credits_self_limit?: unknown }
    | null;
  const total = Number(row?.credits_total ?? plan.monthlyCredits);
  const stored = row?.credits_self_limit;

  return {
    ok: true,
    limit: stored === null || stored === undefined ? null : Number(stored),
    creditsTotal: Number.isSafeInteger(total) ? total : plan.monthlyCredits,
  };
}

/** Liest das gespeicherte Limit; `null` heisst "kein Limit gesetzt". */
export async function readSelfCreditLimit(userId: string): Promise<number | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return null;
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("get_ai_credit_self_limit", {
    p_user_id: userId,
  });
  if (error || data === null || data === undefined) return null;
  const value = Number(data);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
