import "server-only";

import {
  ACCOUNT_MONTHLY_CREDITS,
  creditPlan,
  GUEST_MONTHLY_CREDITS,
  type CreditPlanId,
} from "@/lib/ai/credit-policy";
import { findOwnerForMember } from "@/lib/data/plan-teams";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type AiCreditSnapshot = {
  total: number;
  used: number;
  reserved: number;
  remaining: number;
};

/**
 * Der eigene Kontostand samt Stufe. Reservierung und Settlement liefern
 * bewusst nur AiCreditSnapshot: sie beschreiben das belastete Konto, das bei
 * einem Teammitglied dem Plan-Inhaber gehört.
 */
export type AiCreditSnapshotWithPlan = AiCreditSnapshot & {
  planId: CreditPlanId;
};

export type AiQuotaReservation = {
  allowed: boolean;
  reason: string;
  retryAfterSeconds: number | null;
  reservationId: string | null;
  credits: AiCreditSnapshot | null;
};

export type AiUsageOutcome =
  | "succeeded"
  | "provider_error"
  | "timeout"
  | "cancelled"
  | "reconciled_estimate";

function positiveInteger(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim() ?? "";
  if (!/^\d+$/u.test(raw)) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function nonNegativeNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function integerValue(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/u.test(value)
        ? Number(value)
        : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function creditSnapshot(row: unknown): AiCreditSnapshot | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const total = integerValue(record.credits_total);
  const used = integerValue(record.credits_used);
  const reserved = integerValue(record.credits_reserved);
  const remaining = integerValue(record.credits_remaining);
  return total === null || used === null || reserved === null || remaining === null
    ? null
    : { total, used, reserved, remaining };
}

function firstRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object"
    ? (row as Record<string, unknown>)
    : null;
}

/**
 * Die Kontingente selbst stehen in lib/ai/credit-policy.ts, weil die
 * Oberfläche sie nennt. Hier bleibt nur, wie eine Umgebungsvariable sie
 * übersteuern kann.
 */
export {
  ACCOUNT_MONTHLY_CREDITS,
  GUEST_MONTHLY_CREDITS,
} from "@/lib/ai/credit-policy";

/**
 * First instant of the next UTC month, which is when
 * roll_ai_credit_period refills the allowance. Derived rather than read back,
 * so the snapshot RPC keeps its existing return signature.
 */
export function currentPeriodEndIso(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  ).toISOString();
}

export function configuredInitialCredits(isAnonymous: boolean): number {
  return nonNegativeInteger(
    isAnonymous ? "AI_CREDITS_GUEST_TOTAL" : "AI_CREDITS_USER_TOTAL",
    isAnonymous ? GUEST_MONTHLY_CREDITS : ACCOUNT_MONTHLY_CREDITS,
  );
}

export function configuredDailyTokenLimit(
  isAnonymous: boolean,
  isAdmin = false,
): number {
  // This is a provider-safety ceiling, not a customer entitlement. The public
  // product limit is the monthly credit allowance above. Use new names so
  // stale pre-Nano Netlify values cannot block a valid request.
  return nonNegativeInteger(
    isAdmin && !isAnonymous
      ? "AI_PROVIDER_DAILY_TOKEN_SAFETY_LIMIT_ADMIN"
      : isAnonymous
      ? "AI_PROVIDER_DAILY_TOKEN_SAFETY_LIMIT_GUEST"
      : "AI_PROVIDER_DAILY_TOKEN_SAFETY_LIMIT_USER",
    isAdmin && !isAnonymous ? 10_000_000 : isAnonymous ? 500_000 : 5_000_000,
  );
}

export function configuredMonthlyProviderBudgetCents(): number {
  return nonNegativeInteger("AI_MONTHLY_PROVIDER_BUDGET_CENTS", 5_000);
}

export function configuredUnknownModelEstimatedCostCents(): number {
  return nonNegativeInteger("AI_UNKNOWN_MODEL_ESTIMATED_COST_CENTS", 100);
}

/**
 * Legacy cent estimate retained only for the existing provider-wide monthly
 * safety bucket. Per-request reporting uses exact, model-specific nano-USD.
 */
export function calculateProviderCostCents(
  inputTokens: number,
  outputTokens: number,
): number {
  const inputUsdPerMillion = nonNegativeNumber(
    "OPENAI_INPUT_USD_PER_MILLION",
    2,
  );
  const outputUsdPerMillion = nonNegativeNumber(
    "OPENAI_OUTPUT_USD_PER_MILLION",
    12,
  );
  const residencyMultiplier = nonNegativeNumber(
    "OPENAI_COST_MULTIPLIER",
    1,
  );
  const usd =
    ((Math.max(0, inputTokens) * inputUsdPerMillion +
      Math.max(0, outputTokens) * outputUsdPerMillion) /
      1_000_000) *
    residencyMultiplier;
  return Math.ceil(Number((usd * 100).toFixed(9)));
}

export function nanoUsdToCeilingCents(value: string | null): number {
  if (value === null) return 0;
  if (!/^\d+$/u.test(value)) throw new RangeError("Invalid nano-USD amount");
  const nanoUsd = BigInt(value);
  const cents = (nanoUsd + 9_999_999n) / 10_000_000n;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Provider cost exceeds the safe integer range");
  }
  return Number(cents);
}

export async function getAiCreditSnapshot(input: {
  userId: string;
  isAnonymous: boolean;
}): Promise<AiCreditSnapshotWithPlan> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error("quota_service_not_configured");
  }
  const admin = createAdminSupabaseClient();
  // Beide Fahrten gehen gleichzeitig raus statt nacheinander. Die Stufe hängt
  // nicht am Ergebnis der RPC: legt diese das Konto gerade erst an, findet der
  // Nebenlauf keine Zeile und `readPlanId` fällt auf genau die Stufe zurück,
  // die ein frisches Konto ohnehin bekommt. Das spart auf jedem Workspace-Aufruf
  // eine volle Wartezeit zur Datenbank.
  const [snapshot, planId] = await Promise.all([
    admin.rpc("get_ai_credit_snapshot", {
      p_user_id: input.userId,
      p_is_anonymous: input.isAnonymous,
      p_initial_credit_total: configuredInitialCredits(input.isAnonymous),
    }),
    readPlanId(admin, input.userId, input.isAnonymous),
  ]);
  if (snapshot.error) throw snapshot.error;
  const credits = creditSnapshot(firstRow(snapshot.data));
  if (!credits) throw new Error("invalid_credit_snapshot");
  return { ...credits, planId };
}

/**
 * Die Stufe eines Kontos, ohne den vollen Snapshot zu ziehen. Für Antworten,
 * die den Kontostand ohnehin schon kennen und nur noch die Stufe brauchen.
 */
export async function getAccountPlanId(input: {
  userId: string;
  isAnonymous: boolean;
}): Promise<CreditPlanId> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return creditPlan(null, input.isAnonymous).id;
  }
  try {
    return await readPlanId(
      createAdminSupabaseClient(),
      input.userId,
      input.isAnonymous,
    );
  } catch {
    return creditPlan(null, input.isAnonymous).id;
  }
}

/**
 * Die Stufe steht auf dem Konto, nicht in der Snapshot-RPC — deren Signatur
 * wird von mehreren Stellen erwartet. Ein fehlender Wert ist kein Fehler:
 * das Konto wird erst durch die RPC oben angelegt.
 */
async function readPlanId(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  userId: string,
  isAnonymous: boolean,
): Promise<CreditPlanId> {
  const { data } = await admin
    .from("user_ai_credit_accounts")
    .select("plan_id,is_anonymous")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as { plan_id: string; is_anonymous: boolean } | null;
  // Fehlt die Spalte noch, ist `data` null. Dann entscheidet die Anonymität
  // des Aufrufers — sonst bekäme eine Gastsitzung die Kontostufe angezeigt.
  return creditPlan(row?.plan_id, row?.is_anonymous ?? isAnonymous).id;
}

export type BillingAccount = {
  userId: string;
  isAnonymous: boolean;
  /** Gesetzt, wenn nicht das eigene Konto zahlt, sondern der Plan-Inhaber. */
  billedToOwnerUserId: string | null;
};

/**
 * Wer diese Anfrage bezahlt.
 *
 * Reihenfolge: erst das eigene Monatskontingent, danach der Pool des Teams.
 * Das eigene Guthaben zuerst zu verbrauchen ist die Zusage an das Mitglied —
 * seine 300 Credits gehoeren ihm, auch wenn er eingeladen wurde. Der Pool ist
 * der Puffer danach.
 *
 * Bewusst eine Vorabpruefung statt eines zweiten Reservierungsversuchs: eine
 * Reservierung haengt am `request_key`, ein zweiter Anlauf mit einem anderen
 * Konto liefe in `request_key_conflict`. Zwischen dieser Pruefung und der
 * Reservierung kann sich der Stand aendern; dann wird die Anfrage abgelehnt
 * und der naechste Versuch greift auf den Pool zu.
 */
export async function resolveBillingAccount(input: {
  userId: string;
  isAnonymous: boolean;
  requiredCredits: number;
}): Promise<BillingAccount> {
  const own: BillingAccount = {
    userId: input.userId,
    isAnonymous: input.isAnonymous,
    billedToOwnerUserId: null,
  };
  // Eine Gastsitzung kann kein Teammitglied sein; der Umweg entfaellt.
  if (input.isAnonymous || input.requiredCredits <= 0) return own;

  try {
    const credits = await getAiCreditSnapshot({
      userId: input.userId,
      isAnonymous: input.isAnonymous,
    });
    if (credits.remaining >= input.requiredCredits) return own;

    const ownerUserId = await findOwnerForMember(input.userId);
    if (!ownerUserId) return own;
    return {
      userId: ownerUserId,
      isAnonymous: false,
      billedToOwnerUserId: ownerUserId,
    };
  } catch {
    // Die Aufloesung ist eine Optimierung, keine Zugangspruefung. Faellt sie
    // aus, zahlt das eigene Konto und die Reservierung entscheidet.
    return own;
  }
}

export async function reserveAiQuota(input: {
  requestKey: string;
  userId: string;
  interactionId: string;
  userHash: string;
  ipHash: string;
  isAnonymous: boolean;
  isAdmin?: boolean;
  requestedModel: string;
  purpose: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCredits: number;
  estimatedCostNanoUsd: string | null;
  pricingVersion: string | null;
  creditPolicyVersion: string;
}): Promise<AiQuotaReservation> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return {
      allowed: false,
      reason: "quota_service_not_configured",
      retryAfterSeconds: null,
      reservationId: null,
      credits: null,
    };
  }

  const estimatedTokens =
    input.estimatedInputTokens + input.estimatedOutputTokens;
  const estimatedCostCents =
    input.estimatedCostNanoUsd === null
      ? configuredUnknownModelEstimatedCostCents()
      : nanoUsdToCeilingCents(input.estimatedCostNanoUsd);
  // consume_ai_quota calls get_ai_credit_snapshot to ensure the account
  // before its reservation predicate runs, and that function rolls an expired
  // monthly period. No separate roll statement is needed here.
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("consume_ai_quota", {
    p_request_key: input.requestKey,
    p_user_hash: input.userHash,
    p_ip_hash: input.ipHash,
    p_is_anonymous: input.isAnonymous,
    p_request_limit: positiveInteger("AI_REQUESTS_PER_MINUTE", 6),
    p_daily_token_limit: configuredDailyTokenLimit(
      input.isAnonymous,
      input.isAdmin,
    ),
    p_monthly_budget_cents: configuredMonthlyProviderBudgetCents(),
    p_estimated_tokens: estimatedTokens,
    p_estimated_cost_cents: estimatedCostCents,
    p_user_id: input.userId,
    p_interaction_id: input.interactionId,
    p_requested_model: input.requestedModel,
    p_purpose: input.purpose,
    p_estimated_credits: input.estimatedCredits,
    p_initial_credit_total: configuredInitialCredits(input.isAnonymous),
    p_estimated_cost_nano_usd: input.estimatedCostNanoUsd,
    p_pricing_version: input.pricingVersion,
    p_credit_policy_version: input.creditPolicyVersion,
  });

  if (error) {
    return {
      allowed: false,
      reason: "quota_service_error",
      retryAfterSeconds: null,
      reservationId: null,
      credits: null,
    };
  }

  const row = firstRow(data);
  const retryAt =
    typeof row?.retry_after === "string"
      ? Date.parse(row.retry_after)
      : Number.NaN;
  return {
    allowed: row?.allowed === true,
    reason: typeof row?.reason === "string" ? row.reason : "quota_denied",
    retryAfterSeconds: Number.isFinite(retryAt)
      ? Math.max(1, Math.ceil((retryAt - Date.now()) / 1_000))
      : null,
    reservationId:
      typeof row?.reservation_id === "string" ? row.reservation_id : null,
    credits: creditSnapshot(row),
  };
}

export async function recordAiUsage(input: {
  requestKey: string;
  actualModel: string | null;
  providerResponseId: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  actualCostNanoUsd: string | null;
  actualCredits: number;
  actualCostCents: number | null;
  pricingVersion: string | null;
  creditPolicyVersion: string;
  outcome: AiUsageOutcome;
}): Promise<AiCreditSnapshot | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return null;

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("record_ai_usage", {
    p_request_key: input.requestKey,
    p_actual_input_tokens: input.inputTokens,
    p_actual_cached_input_tokens: input.cachedInputTokens,
    p_actual_output_tokens: input.outputTokens,
    p_actual_total_tokens: input.totalTokens,
    p_actual_cost_cents: input.actualCostCents,
    p_actual_cost_nano_usd: input.actualCostNanoUsd,
    p_actual_credits: input.actualCredits,
    p_outcome: input.outcome,
    p_actual_model: input.actualModel,
    p_provider_response_id: input.providerResponseId,
    p_pricing_version: input.pricingVersion,
    p_credit_policy_version: input.creditPolicyVersion,
  });

  if (error) throw error;
  const row = firstRow(data);
  if (row?.recorded !== true) {
    const reason = typeof row?.reason === "string" ? row.reason : "unknown";
    throw new Error(`ai_usage_not_recorded:${reason}`);
  }
  const credits = creditSnapshot(row);
  if (!credits) throw new Error("invalid_credit_settlement_snapshot");
  return credits;
}
