import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { ExternalFreelancerCandidate } from "@/lib/openai/external-freelancer-search";

export const EXTERNAL_FREELANCER_SEARCH_CREDITS = 30;
export const PRODUCT_CREDIT_EURO_PER_UNIT = "0.0166666667";

export type MonthlyAiUsageSnapshot = {
  limit: number;
  used: number;
  reserved: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
};

export type MonthlyAiUsageReservation = MonthlyAiUsageSnapshot & {
  allowed: boolean;
  reason: string;
  reservationId: string | null;
};

export type ProductCreditSnapshot = {
  balance: number;
  reserved: number;
  available: number;
};

export type ProductCreditReservation = ProductCreditSnapshot & {
  allowed: boolean;
  reason: string;
  reservationId: string | null;
};

export type StoredExternalSearchResult = {
  candidates: ExternalFreelancerCandidate[];
  providerResponseId: string;
  actualModel: string;
  createdAt: string;
};

export type CompletedExternalSearch = ProductCreditSnapshot & {
  recorded: boolean;
  reason: "charged" | "already_completed";
  candidates: ExternalFreelancerCandidate[];
};

type Row = Record<string, unknown>;

function firstRow(value: unknown): Row | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? (row as Row) : null;
}

function integer(row: Row, key: string): number {
  const raw = row[key];
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && /^\d+$/u.test(raw)
        ? Number(raw)
        : Number.NaN;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`invalid_entitlement_${key}`);
  }
  return value;
}

function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`invalid_entitlement_${key}`);
  }
  return value;
}

function monthlySnapshot(row: Row): MonthlyAiUsageSnapshot {
  return {
    limit: integer(row, "usage_limit"),
    used: integer(row, "used"),
    reserved: integer(row, "reserved"),
    remaining: integer(row, "remaining"),
    periodStart: text(row, "period_start"),
    periodEnd: text(row, "period_end"),
  };
}

function productSnapshot(row: Row): ProductCreditSnapshot {
  return {
    balance: integer(row, "balance"),
    reserved: integer(row, "reserved"),
    available: integer(row, "available"),
  };
}

function candidateSnapshot(row: Row): ExternalFreelancerCandidate[] {
  const value = row.result_snapshot;
  if (!Array.isArray(value) || value.length > 3) {
    throw new Error("invalid_external_search_snapshot");
  }
  return value as ExternalFreelancerCandidate[];
}

function requireServiceRole(): void {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error("entitlement_service_not_configured");
  }
}

export async function getMonthlyAiUsageSnapshot(input: {
  userId: string;
  isAnonymous: boolean;
}): Promise<MonthlyAiUsageSnapshot> {
  requireServiceRole();
  const { data, error } = await createAdminSupabaseClient().rpc(
    "get_monthly_ai_usage_snapshot",
    {
      p_user_id: input.userId,
      p_is_anonymous: input.isAnonymous,
    },
  );
  if (error) throw error;
  const row = firstRow(data);
  if (!row) throw new Error("invalid_monthly_usage_snapshot");
  return monthlySnapshot(row);
}

export async function reserveMonthlyAiUsage(input: {
  userId: string;
  isAnonymous: boolean;
  requestKey: string;
}): Promise<MonthlyAiUsageReservation> {
  requireServiceRole();
  const { data, error } = await createAdminSupabaseClient().rpc(
    "reserve_monthly_ai_usage",
    {
      p_user_id: input.userId,
      p_is_anonymous: input.isAnonymous,
      p_request_key: input.requestKey,
    },
  );
  if (error) throw error;
  const row = firstRow(data);
  if (!row) throw new Error("invalid_monthly_usage_reservation");
  return {
    ...monthlySnapshot(row),
    allowed: row.allowed === true,
    reason: typeof row.reason === "string" ? row.reason : "usage_denied",
    reservationId:
      typeof row.reservation_id === "string" ? row.reservation_id : null,
  };
}

export type MonthlyAiUsageSettlementOutcome =
  | "succeeded"
  | "provider_error"
  | "timeout"
  | "invalid_response"
  | "cancelled";

export async function settleMonthlyAiUsage(input: {
  userId: string;
  requestKey: string;
  outcome: MonthlyAiUsageSettlementOutcome;
}): Promise<MonthlyAiUsageSnapshot> {
  requireServiceRole();
  const { data, error } = await createAdminSupabaseClient().rpc(
    "settle_monthly_ai_usage",
    {
      p_user_id: input.userId,
      p_request_key: input.requestKey,
      p_outcome: input.outcome,
    },
  );
  if (error) throw error;
  const row = firstRow(data);
  if (!row || row.recorded !== true) {
    throw new Error(
      `monthly_usage_not_settled:${typeof row?.reason === "string" ? row.reason : "unknown"}`,
    );
  }
  return monthlySnapshot(row);
}

export async function getProductCreditSnapshot(
  userId: string,
): Promise<ProductCreditSnapshot> {
  requireServiceRole();
  const { data, error } = await createAdminSupabaseClient().rpc(
    "get_product_credit_snapshot",
    { p_user_id: userId },
  );
  if (error) throw error;
  const row = firstRow(data);
  if (!row) throw new Error("invalid_product_credit_snapshot");
  return productSnapshot(row);
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

export async function reserveProductCredits(input: {
  userId: string;
  requestKey: string;
  purpose: "external_freelancer_search";
  amount?: number;
}): Promise<ProductCreditReservation> {
  requireServiceRole();
  const { data, error } = await createAdminSupabaseClient().rpc(
    "reserve_product_credits",
    {
      p_user_id: input.userId,
      p_request_key: input.requestKey,
      p_purpose: input.purpose,
      p_amount: input.amount ?? EXTERNAL_FREELANCER_SEARCH_CREDITS,
    },
  );
  if (error) throw error;
  const row = firstRow(data);
  if (!row) throw new Error("invalid_product_credit_reservation");
  return {
    ...productSnapshot(row),
    allowed: row.allowed === true,
    reason: typeof row.reason === "string" ? row.reason : "credit_denied",
    reservationId:
      typeof row.reservation_id === "string" ? row.reservation_id : null,
  };
}

export type ProductCreditSettlementOutcome =
  | "completed"
  | "completed_no_result"
  | "technical_error"
  | "timeout"
  | "invalid_response"
  | "cancelled";

export async function completeExternalSearch(input: {
  userId: string;
  projectId: string;
  requestKey: string;
  candidates: ExternalFreelancerCandidate[];
  providerResponseId: string;
  actualModel: string;
}): Promise<CompletedExternalSearch> {
  requireServiceRole();
  const { data, error } = await createAdminSupabaseClient().rpc(
    "complete_external_search",
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
  if (
    !row ||
    (reason !== "charged" && reason !== "already_completed") ||
    (row.recorded !== true && reason !== "already_completed")
  ) {
    throw new Error(
      `external_search_not_completed:${typeof reason === "string" ? reason : "unknown"}`,
    );
  }
  return {
    ...productSnapshot(row),
    recorded: row.recorded === true,
    reason,
    candidates: candidateSnapshot(row),
  };
}

export async function settleProductCredits(input: {
  userId: string;
  requestKey: string;
  outcome: ProductCreditSettlementOutcome;
}): Promise<ProductCreditSnapshot> {
  requireServiceRole();
  const { data, error } = await createAdminSupabaseClient().rpc(
    "settle_product_credit_reservation",
    {
      p_user_id: input.userId,
      p_request_key: input.requestKey,
      p_outcome: input.outcome,
    },
  );
  if (error) throw error;
  const row = firstRow(data);
  if (!row || row.recorded !== true) {
    throw new Error(
      `product_credit_not_settled:${typeof row?.reason === "string" ? row.reason : "unknown"}`,
    );
  }
  return productSnapshot(row);
}
