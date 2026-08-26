import "server-only";

import {
  aggregateSearchUsage,
  groupSearchUsageByUser,
  readSearchUsageRows,
  type SearchUsageTotals,
} from "@/lib/ai/admin-search-usage";
import { formatNanoUsdAsUsd } from "@/lib/ai/model-pricing";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type AdminUsageSourceRow = {
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

export type AdminLegacyCreditSourceRow = {
  user_id: string;
  is_anonymous: boolean;
  credits_total: number | string;
  credits_used: number | string;
  credits_reserved: number | string;
};

export type AdminFreeUsageSourceRow = {
  user_id: string;
  is_anonymous: boolean;
  period_start: string;
  period_end: string;
  usage_limit: number | string;
  used: number | string;
  reserved: number | string;
};

export type AdminProductCreditSourceRow = {
  user_id: string;
  balance: number | string;
  reserved: number | string;
};

export type AdminLegacyTechnicalCreditBalance = {
  total: number;
  used: number;
  reserved: number;
  remaining: number;
};

export type AdminFreeUsageBalance = {
  limit: number;
  used: number;
  reserved: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
};

export type AdminProductCreditBalance = {
  balance: number;
  reserved: number;
  available: number;
};

export type AdminAccountTotals = {
  legacyTechnical: AdminLegacyTechnicalCreditBalance & { accounts: number };
  freeMonthly: Omit<AdminFreeUsageBalance, "periodStart" | "periodEnd"> & {
    accounts: number;
  };
  product: AdminProductCreditBalance & { accounts: number };
};

export type AdminAccountUserSnapshot = {
  userId: string;
  anonymous: boolean;
  legacyTechnicalCredits: AdminLegacyTechnicalCreditBalance | null;
  freeMonthlyUsage: AdminFreeUsageBalance | null;
  productCredits: AdminProductCreditBalance | null;
};

export type AdminProviderUsageTotals = {
  requests: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costNanoUsd: string;
  costUsd: string;
  unknownCostRequests: number;
};

export type AdminUsageTotals = {
  settlements: number;
  confirmedProvider: AdminProviderUsageTotals;
  estimatedOrReconciled: AdminProviderUsageTotals;
  reconciledEstimates: number;
  failedAttempts: number;
  legacyTechnicalCreditsConsumed: number;
};

export type AdminUsageBreakdown = AdminUsageTotals & {
  key: string;
};

export type AdminUserUsage = AdminUsageTotals & {
  userId: string;
  email: string | null;
  anonymous: boolean;
  legacyTechnicalCredits: AdminLegacyTechnicalCreditBalance | null;
  freeMonthlyUsage: AdminFreeUsageBalance | null;
  productCredits: AdminProductCreditBalance | null;
  lastUsedAt: string | null;
  /** Websuchen dieses Kontos — der teurere Posten. */
  searchRuns: number;
  searchToolCalls: number;
};

/** Nutzung getrennt nach Gästen und angemeldeten Konten. */
export type AdminUsageSegment = {
  accounts: number;
  activeAccounts: number;
  totalTokens: number;
  tokenCostNanoUsd: string;
  searchRuns: number;
  searchToolCalls: number;
};

export type AdminUsageDashboard = {
  generatedAt: string;
  from: string | null;
  to: string | null;
  truncated: boolean;
  totals: AdminUsageTotals;
  accountTotals: AdminAccountTotals;
  byModel: AdminUsageBreakdown[];
  users: AdminUserUsage[];
  recentInteractions: AdminUsageInteraction[];
  /**
   * Websuchen stehen nicht in `ai_usage_events` — nur Token stehen dort. Ohne
   * diese Zahlen unterschlägt jede Kostenanzeige den größeren Posten: Token
   * kosten Zehntelcent, ein Suchaufruf einen ganzen.
   */
  searchUsage: SearchUsageTotals & { costUsd: string };
  /** Token- und Suchkosten zusammen. */
  combinedCostNanoUsd: string;
  combinedCostUsd: string;
  segments: { guests: AdminUsageSegment; registered: AdminUsageSegment };
};

export type AdminUsageInteraction = {
  id: string;
  userId: string | null;
  email: string | null;
  model: string;
  purpose: string;
  tokens: number;
  legacyTechnicalCredits: number;
  usageBasis: "confirmed_provider" | "estimated_or_reconciled";
  costNanoUsd: string | null;
  costUsd: string | null;
  outcome: string;
  settledAt: string;
};

function count(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function emptyAccountTotals(): AdminAccountTotals {
  return {
    legacyTechnical: {
      accounts: 0,
      total: 0,
      used: 0,
      reserved: 0,
      remaining: 0,
    },
    freeMonthly: {
      accounts: 0,
      limit: 0,
      used: 0,
      reserved: 0,
      remaining: 0,
    },
    product: {
      accounts: 0,
      balance: 0,
      reserved: 0,
      available: 0,
    },
  };
}

export function aggregateAdminAccountRows(input: {
  legacy: readonly AdminLegacyCreditSourceRow[];
  freeMonthly: readonly AdminFreeUsageSourceRow[];
  product: readonly AdminProductCreditSourceRow[];
}): { totals: AdminAccountTotals; users: AdminAccountUserSnapshot[] } {
  const byUser = new Map<string, AdminAccountUserSnapshot>();
  const account = (userId: string, anonymous = false) => {
    const existing = byUser.get(userId);
    if (existing) {
      if (anonymous) existing.anonymous = true;
      return existing;
    }
    const created: AdminAccountUserSnapshot = {
      userId,
      anonymous,
      legacyTechnicalCredits: null,
      freeMonthlyUsage: null,
      productCredits: null,
    };
    byUser.set(userId, created);
    return created;
  };

  for (const row of input.legacy) {
    const total = count(row.credits_total);
    const used = count(row.credits_used);
    const reserved = count(row.credits_reserved);
    account(row.user_id, row.is_anonymous).legacyTechnicalCredits = {
      total,
      used,
      reserved,
      remaining: Math.max(total - used - reserved, 0),
    };
  }
  for (const row of input.freeMonthly) {
    const user = account(row.user_id, row.is_anonymous);
    if (
      user.freeMonthlyUsage &&
      user.freeMonthlyUsage.periodStart >= row.period_start
    ) {
      continue;
    }
    const limit = count(row.usage_limit);
    const used = count(row.used);
    const reserved = count(row.reserved);
    user.freeMonthlyUsage = {
      limit,
      used,
      reserved,
      remaining: Math.max(limit - used - reserved, 0),
      periodStart: row.period_start,
      periodEnd: row.period_end,
    };
  }
  for (const row of input.product) {
    const balance = count(row.balance);
    const reserved = count(row.reserved);
    account(row.user_id).productCredits = {
      balance,
      reserved,
      available: Math.max(balance - reserved, 0),
    };
  }

  const users = [...byUser.values()];
  const totals = emptyAccountTotals();
  for (const user of users) {
    if (user.legacyTechnicalCredits) {
      totals.legacyTechnical.accounts += 1;
      totals.legacyTechnical.total += user.legacyTechnicalCredits.total;
      totals.legacyTechnical.used += user.legacyTechnicalCredits.used;
      totals.legacyTechnical.reserved += user.legacyTechnicalCredits.reserved;
      totals.legacyTechnical.remaining += user.legacyTechnicalCredits.remaining;
    }
    if (user.freeMonthlyUsage) {
      totals.freeMonthly.accounts += 1;
      totals.freeMonthly.limit += user.freeMonthlyUsage.limit;
      totals.freeMonthly.used += user.freeMonthlyUsage.used;
      totals.freeMonthly.reserved += user.freeMonthlyUsage.reserved;
      totals.freeMonthly.remaining += user.freeMonthlyUsage.remaining;
    }
    if (user.productCredits) {
      totals.product.accounts += 1;
      totals.product.balance += user.productCredits.balance;
      totals.product.reserved += user.productCredits.reserved;
      totals.product.available += user.productCredits.available;
    }
  }
  return { totals, users };
}

function validCount(
  value: number | string | null | undefined,
): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string" || !/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validNanoUsd(
  value: number | string | null | undefined,
): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }
  return typeof value === "string" && /^\d+$/u.test(value) ? value : null;
}

export function classifyAdminUsageRow(
  row: AdminUsageSourceRow,
): "confirmed_provider" | "estimated_or_reconciled" {
  if (row.outcome === "reconciled_estimate") {
    return "estimated_or_reconciled";
  }
  if (!row.provider_response_id?.trim() || !row.actual_model?.trim()) {
    return "estimated_or_reconciled";
  }
  const inputTokens = validCount(row.input_tokens);
  const cachedInputTokens = validCount(row.cached_input_tokens);
  const outputTokens = validCount(row.output_tokens);
  const totalTokens = validCount(row.total_tokens);
  if (
    inputTokens === null ||
    cachedInputTokens === null ||
    outputTokens === null ||
    totalTokens === null ||
    cachedInputTokens > inputTokens ||
    totalTokens !== inputTokens + outputTokens
  ) {
    return "estimated_or_reconciled";
  }
  return "confirmed_provider";
}

function rowCostNanoUsd(row: AdminUsageSourceRow): string | null {
  // This value was calculated and versioned at settlement time. Keeping it
  // avoids silently repricing historical usage when the live registry changes.
  return validNanoUsd(row.actual_cost_nano_usd);
}

function emptyProviderTotals(): AdminProviderUsageTotals {
  return {
    requests: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costNanoUsd: "0",
    costUsd: "0",
    unknownCostRequests: 0,
  };
}

function emptyTotals(): AdminUsageTotals {
  return {
    settlements: 0,
    confirmedProvider: emptyProviderTotals(),
    estimatedOrReconciled: emptyProviderTotals(),
    reconciledEstimates: 0,
    failedAttempts: 0,
    legacyTechnicalCreditsConsumed: 0,
  };
}

function addProviderRow(
  total: AdminProviderUsageTotals,
  row: AdminUsageSourceRow,
): void {
  total.requests += 1;
  total.inputTokens += count(row.input_tokens);
  total.cachedInputTokens += count(row.cached_input_tokens);
  total.outputTokens += count(row.output_tokens);
  total.totalTokens += count(row.total_tokens);
  const costNanoUsd = rowCostNanoUsd(row);
  if (costNanoUsd === null) {
    total.unknownCostRequests += 1;
  } else {
    total.costNanoUsd = (
      BigInt(total.costNanoUsd) + BigInt(costNanoUsd)
    ).toString();
  }
}

function addRow(total: AdminUsageTotals, row: AdminUsageSourceRow): void {
  total.settlements += 1;
  total.legacyTechnicalCreditsConsumed += count(row.credits_consumed);
  const usageBasis = classifyAdminUsageRow(row);
  addProviderRow(
    usageBasis === "confirmed_provider"
      ? total.confirmedProvider
      : total.estimatedOrReconciled,
    row,
  );
  if (row.outcome === "reconciled_estimate") {
    total.reconciledEstimates += 1;
  }
  if (["provider_error", "timeout", "cancelled"].includes(row.outcome)) {
    total.failedAttempts += 1;
  }
}

function finalizeProvider(total: AdminProviderUsageTotals): void {
  total.costUsd = formatNanoUsdAsUsd(total.costNanoUsd);
}

function finalize<T extends AdminUsageTotals>(total: T): T {
  finalizeProvider(total.confirmedProvider);
  finalizeProvider(total.estimatedOrReconciled);
  return total;
}

export function aggregateAdminUsageRows(
  rows: readonly AdminUsageSourceRow[],
): AdminUsageTotals {
  const totals = emptyTotals();
  for (const row of rows) addRow(totals, row);
  return finalize(totals);
}

function usageModel(row: AdminUsageSourceRow): string {
  return classifyAdminUsageRow(row) === "confirmed_provider"
    ? row.actual_model ?? "unknown"
    : row.requested_model ?? row.actual_model ?? "unknown";
}

function compareNanoUsdDescending(left: string, right: string): number {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  return rightValue > leftValue ? 1 : rightValue < leftValue ? -1 : 0;
}

function presentInteraction(
  row: AdminUsageSourceRow,
  email: string | null,
): AdminUsageInteraction {
  const usageBasis = classifyAdminUsageRow(row);
  const cost = rowCostNanoUsd(row);
  return {
    id: row.interaction_id ?? row.id,
    userId: row.user_id,
    email,
    model: usageModel(row),
    purpose: row.purpose ?? "unknown",
    tokens: count(row.total_tokens),
    legacyTechnicalCredits: count(row.credits_consumed),
    usageBasis,
    costNanoUsd: cost,
    costUsd: cost === null ? null : formatNanoUsdAsUsd(cost),
    outcome: row.outcome,
    settledAt: row.settled_at,
  };
}

async function readUsageRows(input: { from?: string; to?: string }) {
  const admin = createAdminSupabaseClient();
  const pageSize = 1_000;
  const maxRows = 20_000;
  const rows: AdminUsageSourceRow[] = [];

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
    const page = (data ?? []) as AdminUsageSourceRow[];
    rows.push(...page);
    if (page.length < pageSize) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

async function readLegacyCreditRows() {
  const admin = createAdminSupabaseClient();
  const pageSize = 1_000;
  const maxRows = 20_000;
  const rows: AdminLegacyCreditSourceRow[] = [];
  while (rows.length < maxRows) {
    const { data, error } = await admin
      .from("user_ai_credit_accounts")
      .select(
        "user_id,is_anonymous,credits_total,credits_used,credits_reserved",
      )
      .order("user_id", { ascending: true })
      .range(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as AdminLegacyCreditSourceRow[];
    rows.push(...page);
    if (page.length < pageSize) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

async function readCurrentFreeUsageRows() {
  const admin = createAdminSupabaseClient();
  const pageSize = 1_000;
  const maxRows = 20_000;
  const now = new Date().toISOString();
  const rows: AdminFreeUsageSourceRow[] = [];
  while (rows.length < maxRows) {
    const { data, error } = await admin
      .from("ai_free_usage_accounts")
      .select(
        "user_id,is_anonymous,period_start,period_end,usage_limit,used,reserved",
      )
      .lte("period_start", now)
      .gt("period_end", now)
      .order("period_start", { ascending: false })
      .order("user_id", { ascending: true })
      .range(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as AdminFreeUsageSourceRow[];
    rows.push(...page);
    if (page.length < pageSize) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

async function readProductCreditRows() {
  const admin = createAdminSupabaseClient();
  const pageSize = 1_000;
  const maxRows = 20_000;
  const rows: AdminProductCreditSourceRow[] = [];
  while (rows.length < maxRows) {
    const { data, error } = await admin
      .from("product_credit_accounts")
      .select("user_id,balance,reserved")
      .order("user_id", { ascending: true })
      .range(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as AdminProductCreditSourceRow[];
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
  const [usageResult, legacyResult, freeUsageResult, productResult, emails, searchResult] =
    await Promise.all([
      readUsageRows(input),
      readLegacyCreditRows(),
      readCurrentFreeUsageRows(),
      readProductCreditRows(),
      readAuthEmails(),
      readSearchUsageRows(input),
    ]);
  const searchTotals = aggregateSearchUsage(searchResult.rows);
  const searchByUser = groupSearchUsageByUser(searchResult.rows);
  const { rows, truncated: usageTruncated } = usageResult;
  const accountData = aggregateAdminAccountRows({
    legacy: legacyResult.rows,
    freeMonthly: freeUsageResult.rows,
    product: productResult.rows,
  });

  const totals = emptyTotals();
  const byModel = new Map<string, AdminUsageBreakdown>();
  const byUser = new Map<string, AdminUserUsage>();
  for (const account of accountData.users) {
    byUser.set(account.userId, {
      ...emptyTotals(),
      userId: account.userId,
      email: emails.get(account.userId) ?? null,
      anonymous: account.anonymous,
      legacyTechnicalCredits: account.legacyTechnicalCredits,
      freeMonthlyUsage: account.freeMonthlyUsage,
      productCredits: account.productCredits,
      lastUsedAt: null,
      searchRuns: 0,
      searchToolCalls: 0,
    });
  }

  for (const row of rows) {
    addRow(totals, row);
    const model = usageModel(row);
    const modelTotal = byModel.get(model) ?? { ...emptyTotals(), key: model };
    addRow(modelTotal, row);
    byModel.set(model, modelTotal);

    if (row.user_id) {
      const userTotal = byUser.get(row.user_id) ?? {
        ...emptyTotals(),
        userId: row.user_id,
        email: emails.get(row.user_id) ?? null,
        anonymous: false,
        legacyTechnicalCredits: null,
        freeMonthlyUsage: null,
        productCredits: null,
        lastUsedAt: null,
        searchRuns: 0,
        searchToolCalls: 0,
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
    .sort((left, right) => {
      const confirmedCostOrder = compareNanoUsdDescending(
        left.confirmedProvider.costNanoUsd,
        right.confirmedProvider.costNanoUsd,
      );
      return confirmedCostOrder || compareNanoUsdDescending(
        left.estimatedOrReconciled.costNanoUsd,
        right.estimatedOrReconciled.costNanoUsd,
      );
    });
  const modelRows = [...byModel.values()]
    .map(finalize)
    .sort((left, right) =>
      right.confirmedProvider.totalTokens - left.confirmedProvider.totalTokens ||
      right.estimatedOrReconciled.totalTokens - left.estimatedOrReconciled.totalTokens,
    );

  const withSearch = users.map((user) => {
    const search = searchByUser.get(user.userId);
    return {
      ...user,
      searchRuns: search?.runs ?? 0,
      searchToolCalls: search?.toolCalls ?? 0,
    };
  });

  const emptySegment = (): AdminUsageSegment => ({
    accounts: 0,
    activeAccounts: 0,
    totalTokens: 0,
    tokenCostNanoUsd: "0",
    searchRuns: 0,
    searchToolCalls: 0,
  });
  const segments = { guests: emptySegment(), registered: emptySegment() };
  for (const user of withSearch) {
    const segment = user.anonymous ? segments.guests : segments.registered;
    segment.accounts += 1;
    const tokens =
      user.confirmedProvider.totalTokens + user.estimatedOrReconciled.totalTokens;
    if (tokens > 0 || user.searchRuns > 0) segment.activeAccounts += 1;
    segment.totalTokens += tokens;
    segment.tokenCostNanoUsd = (
      BigInt(segment.tokenCostNanoUsd) +
      BigInt(user.confirmedProvider.costNanoUsd) +
      BigInt(user.estimatedOrReconciled.costNanoUsd)
    ).toString();
    segment.searchRuns += user.searchRuns;
    segment.searchToolCalls += user.searchToolCalls;
  }

  const finalizedTotals = finalize(totals);
  const tokenCostNanoUsd =
    BigInt(finalizedTotals.confirmedProvider.costNanoUsd) +
    BigInt(finalizedTotals.estimatedOrReconciled.costNanoUsd);
  const combined = tokenCostNanoUsd + BigInt(searchTotals.costNanoUsd);

  return {
    generatedAt: new Date().toISOString(),
    from: input.from ?? null,
    to: input.to ?? null,
    truncated:
      usageTruncated || legacyResult.truncated || freeUsageResult.truncated ||
      productResult.truncated || searchResult.truncated,
    totals: finalizedTotals,
    accountTotals: accountData.totals,
    byModel: modelRows,
    users: withSearch,
    recentInteractions: rows
      .slice(0, 100)
      .map((row) =>
        presentInteraction(
          row,
          row.user_id ? emails.get(row.user_id) ?? null : null,
        ),
      ),
    searchUsage: {
      ...searchTotals,
      costUsd: formatNanoUsdAsUsd(String(searchTotals.costNanoUsd)),
    },
    combinedCostNanoUsd: combined.toString(),
    combinedCostUsd: formatNanoUsdAsUsd(combined.toString()),
    segments,
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
  return ((data ?? []) as AdminUsageSourceRow[]).map((row) =>
    presentInteraction(row, input.email),
  );
}
