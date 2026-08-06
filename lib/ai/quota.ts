import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type AiQuotaReservation = {
  allowed: boolean;
  reason: string;
  retryAfterSeconds: number | null;
  reservationId: string | null;
};

function positiveInteger(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function calculateProviderCostCents(
  inputTokens: number,
  outputTokens: number,
): number {
  const inputUsdPerMillion = nonNegativeNumber(
    "OPENAI_INPUT_USD_PER_MILLION",
    0.2,
  );
  const outputUsdPerMillion = nonNegativeNumber(
    "OPENAI_OUTPUT_USD_PER_MILLION",
    1.2,
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

  // Decimal price configuration is represented as IEEE-754. Normalizing well
  // below one cent avoids a phantom extra cent at exact boundaries.
  return Math.ceil(Number((usd * 100).toFixed(9)));
}

export async function reserveAiQuota(input: {
  requestKey: string;
  userHash: string;
  ipHash: string;
  isAnonymous: boolean;
  estimatedTokens?: number;
  estimatedCostCents?: number;
}): Promise<AiQuotaReservation> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return {
      allowed: false,
      reason: "quota_service_not_configured",
      retryAfterSeconds: null,
      reservationId: null,
    };
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("consume_ai_quota", {
    p_request_key: input.requestKey,
    p_user_hash: input.userHash,
    p_ip_hash: input.ipHash,
    p_is_anonymous: input.isAnonymous,
    p_request_limit: positiveInteger("AI_REQUESTS_PER_MINUTE", 6),
    p_daily_token_limit: positiveInteger(
      input.isAnonymous
        ? "AI_DAILY_TOKEN_LIMIT_GUEST"
        : "AI_DAILY_TOKEN_LIMIT_USER",
      input.isAnonymous ? 20_000 : 100_000,
    ),
    p_monthly_budget_cents: positiveInteger(
      "AI_MONTHLY_PROVIDER_BUDGET_CENTS",
      5_000,
    ),
    p_estimated_tokens: input.estimatedTokens ?? 4_000,
    p_estimated_cost_cents: input.estimatedCostCents ?? 1,
  });

  if (error) {
    return {
      allowed: false,
      reason: "quota_service_error",
      retryAfterSeconds: null,
      reservationId: null,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
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
  };
}

export async function recordAiUsage(input: {
  requestKey: string;
  inputTokens: number;
  outputTokens: number;
  actualCostCents: number;
  outcome: "succeeded" | "provider_error" | "timeout" | "cancelled";
}): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return;

  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("record_ai_usage", {
    p_request_key: input.requestKey,
    p_actual_input_tokens: input.inputTokens,
    p_actual_output_tokens: input.outputTokens,
    p_actual_cost_cents: input.actualCostCents,
    p_outcome: input.outcome,
  });

  if (error) throw error;
}
