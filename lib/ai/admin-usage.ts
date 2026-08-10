import "server-only";

import { formatNanoUsdAsUsd } from "@/lib/ai/model-pricing";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type UsageRow = {
  id: string;
  user_id: string | null;
  interaction_id: string | null;
  provider_response_id: string | null;
  requested_model: string | null;
  actual_model: string | null;
  purpose: string | null;
  input_tokens: number | string | null;
  cached_input_tokens: number | string | null;
  output_tokens: number | string | null;
  total_tokens: number | string | null;
  actual_cost_nano_usd: number | string | null;
  credits_consumed: number | string | null;
  outcome: string;
  settled_at: string;
};

type CreditRow = {
  user_id: string;
  is_anonymous: boolean;
  credits_total: number | string;
  credits_used: number | string;
  credits_reserved: number | string;
};

export type AdminUsageTotals = {
  requests: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  creditsUsed: number;
  estimatedCostNanoUsd: string;
  estimatedCostUsd: string;
  unknownCostRequests: number;
};

export type AdminUsageBreakdown = AdminUsageTotals & {
  key: string;
};

export type AdminUserUsage = AdminUsageTotals & {
  userId: string;
  email: string | null;
  anonymous: boolean;
  creditsTotal: number;
  creditsBalanceUsed: number;
  creditsReserved: number;
  creditsRemaining: number;
  lastUsedAt: string | null;
};

export type AdminUsageDashboard = {
  generatedAt: string;
  from: string | null;
  to: string | null;
  truncated: boolean;
  totals: AdminUsageTotals;
  byModel: AdminUsageBreakdown[];
  users: AdminUserUsage[];
  recentInteractions: AdminUsageInteraction[];
};

export type AdminUsageInteraction = {
  id: string;
  userId: string | null;
  email: string | null;
  model: string;
  purpose: string;
  tokens: number;
  credits: number;
  estimatedCostNanoUsd: string | null;
  estimatedCostUsd: string | null;
  outcome: string;
  settledAt: string;
};

function count(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function emptyTotals(): AdminUsageTotals {
  return {
    requests: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    creditsUsed: 0,
    estimatedCostNanoUsd: "0",
    estimatedCostUsd: "0",
    unknownCostRequests: 0,
  };
}

function addRow(total: AdminUsageTotals, row: UsageRow): void {
  total.requests += 1;
  total.inputTokens += count(row.input_tokens);
  total.cachedInputTokens += count(row.cached_input_tokens);
  total.outputTokens += count(row.output_tokens);
  total.totalTokens += count(row.total_tokens);
  total.creditsUsed += count(row.credits_consumed);
  if (row.actual_cost_nano_usd === null) {
    total.unknownCostRequests += 1;
  } else {
    total.estimatedCostNanoUsd = (
      BigInt(total.estimatedCostNanoUsd) +
      BigInt(String(row.actual_cost_nano_usd))
    ).toString();
  }
}

function finalize<T extends AdminUsageTotals>(total: T): T {
  total.estimatedCostUsd = formatNanoUsdAsUsd(total.estimatedCostNanoUsd);
  return total;
}

function presentInteraction(
  row: UsageRow,
  email: string | null,
): AdminUsageInteraction {
  const cost =
    row.actual_cost_nano_usd === null
      ? null
      : String(row.actual_cost_nano_usd);
  return {
    id: row.interaction_id ?? row.id,
    userId: row.user_id,
    email,
    model: row.actual_model ?? row.requested_model ?? "unknown",
    purpose: row.purpose ?? "unknown",
    tokens: count(row.total_tokens),
    credits: count(row.credits_consumed),
    estimatedCostNanoUsd: cost,
    estimatedCostUsd: cost === null ? null : formatNanoUsdAsUsd(cost),
    outcome: row.outcome,
    settledAt: row.settled_at,
  };
}

async function readUsageRows(input: { from?: string; to?: string }) {
  const admin = createAdminSupabaseClient();
  const pageSize = 1_000;
  const maxRows = 20_000;
  const rows: UsageRow[] = [];

  while (rows.length < maxRows) {
    let query = admin
      .from("ai_usage_events")
      .select(
        "id,user_id,interaction_id,provider_response_id,requested_model,actual_model,purpose,input_tokens,cached_input_tokens,output_tokens,total_tokens,actual_cost_nano_usd,credits_consumed,outcome,settled_at",
      )
      .order("settled_at", { ascending: false })
      .order("id", { ascending: false })
      .range(rows.length, rows.length + pageSize - 1);
    if (input.from) query = query.gte("settled_at", input.from);
    if (input.to) query = query.lte("settled_at", input.to);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as UsageRow[];
    rows.push(...page);
    if (page.length < pageSize) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

async function readCreditRows() {
  const admin = createAdminSupabaseClient();
  const pageSize = 1_000;
  const maxRows = 20_000;
  const rows: CreditRow[] = [];
  while (rows.length < maxRows) {
    const { data, error } = await admin
      .from("user_ai_credit_accounts")
      .select(
        "user_id,is_anonymous,credits_total,credits_used,credits_reserved",
      )
      .order("user_id", { ascending: true })
      .range(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as CreditRow[];
    rows.push(...page);
    if (page.length < pageSize) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

async function readAuthEmails(): Promise<Map<string, string | null>> {
  const admin = createAdminSupabaseClient();
  const emails = new Map<string, string | null>();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1_000,
    });
    if (error) throw error;
    for (const user of data.users) emails.set(user.id, user.email ?? null);
    if (data.users.length < 1_000) break;
  }
  return emails;
}

export async function getAdminUsageDashboard(input: {
  from?: string;
  to?: string;
} = {}): Promise<AdminUsageDashboard> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error("Admin usage service is not configured");
  }
  const [usageResult, creditResult, emails] = await Promise.all([
    readUsageRows(input),
    readCreditRows(),
    readAuthEmails(),
  ]);
  const { rows, truncated: usageTruncated } = usageResult;
  const { rows: creditRows, truncated: creditTruncated } = creditResult;

  const totals = emptyTotals();
  const byModel = new Map<string, AdminUsageBreakdown>();
  const byUser = new Map<string, AdminUserUsage>();
  for (const account of creditRows) {
    const total = count(account.credits_total);
    const used = count(account.credits_used);
    const reserved = count(account.credits_reserved);
    byUser.set(account.user_id, {
      ...emptyTotals(),
      userId: account.user_id,
      email: emails.get(account.user_id) ?? null,
      anonymous: account.is_anonymous,
      creditsTotal: total,
      creditsBalanceUsed: used,
      creditsReserved: reserved,
      creditsRemaining: Math.max(total - used - reserved, 0),
      lastUsedAt: null,
    });
  }

  for (const row of rows) {
    addRow(totals, row);
    const model = row.actual_model ?? row.requested_model ?? "unknown";
    const modelTotal = byModel.get(model) ?? { ...emptyTotals(), key: model };
    addRow(modelTotal, row);
    byModel.set(model, modelTotal);

    if (row.user_id) {
      const userTotal = byUser.get(row.user_id) ?? {
        ...emptyTotals(),
        userId: row.user_id,
        email: emails.get(row.user_id) ?? null,
        anonymous: false,
        creditsTotal: 0,
        creditsBalanceUsed: 0,
        creditsReserved: 0,
        creditsRemaining: 0,
        lastUsedAt: null,
      };
      addRow(userTotal, row);
      userTotal.lastUsedAt =
        !userTotal.lastUsedAt || row.settled_at > userTotal.lastUsedAt
          ? row.settled_at
          : userTotal.lastUsedAt;
      byUser.set(row.user_id, userTotal);
    }
  }

  const users = [...byUser.values()]
    .map(finalize)
    .sort((left, right) => right.estimatedCostNanoUsd.localeCompare(
      left.estimatedCostNanoUsd,
      undefined,
      { numeric: true },
    ));
  const modelRows = [...byModel.values()]
    .map(finalize)
    .sort((left, right) => right.totalTokens - left.totalTokens);

  return {
    generatedAt: new Date().toISOString(),
    from: input.from ?? null,
    to: input.to ?? null,
    truncated: usageTruncated || creditTruncated,
    totals: finalize(totals),
    byModel: modelRows,
    users,
    recentInteractions: rows
      .slice(0, 100)
      .map((row) =>
        presentInteraction(
          row,
          row.user_id ? emails.get(row.user_id) ?? null : null,
        ),
      ),
  };
}

export async function getAdminUserUsageInteractions(input: {
  userId: string;
  email: string | null;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<AdminUsageInteraction[]> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error("Admin usage service is not configured");
  }
  const limit = Math.min(200, Math.max(1, input.limit ?? 100));
  const admin = createAdminSupabaseClient();
  let query = admin
    .from("ai_usage_events")
    .select(
      "id,user_id,interaction_id,provider_response_id,requested_model,actual_model,purpose,input_tokens,cached_input_tokens,output_tokens,total_tokens,actual_cost_nano_usd,credits_consumed,outcome,settled_at",
    )
    .eq("user_id", input.userId)
    .order("settled_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (input.from) query = query.gte("settled_at", input.from);
  if (input.to) query = query.lte("settled_at", input.to);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as UsageRow[]).map((row) =>
    presentInteraction(row, input.email),
  );
}
