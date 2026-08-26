import "server-only";

import { WEB_SEARCH_CALL_NANO_USD } from "@/lib/ai/search-cost";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Websuchen werden nicht in `ai_usage_events` erfasst — dort stehen nur Token.
 * Die Zahl der Suchaufrufe, und damit der größere Teil der Rechnung, steckt in
 * den Audit-Einträgen der Suchroute.
 *
 * Ohne diese Quelle unterschätzt jede Kostenanzeige die echte Rechnung um den
 * Faktor zehn: 0,33 Cent Token gegen drei bis fünf Cent Suchgebühr.
 */
const SEARCH_AUDIT_ACTIONS = [
  "external_freelancer_search_response_served",
  "external_freelancer_search_failed",
] as const;

export type SearchUsageRow = {
  userId: string | null;
  occurredAt: string;
  toolCalls: number;
  candidateCount: number;
  succeeded: boolean;
};

export type SearchUsageTotals = {
  runs: number;
  successfulRuns: number;
  toolCalls: number;
  candidates: number;
  costNanoUsd: number;
};

const PAGE_SIZE = 1_000;
const MAX_ROWS = 50_000;

function count(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export async function readSearchUsageRows(input: {
  from?: string;
  to?: string;
} = {}): Promise<{ rows: SearchUsageRow[]; truncated: boolean }> {
  const admin = createAdminSupabaseClient();
  const rows: SearchUsageRow[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    let query = admin
      .from("audit_events")
      .select("actor_user_id,action,occurred_at,metadata")
      .in("action", SEARCH_AUDIT_ACTIONS as unknown as string[])
      .order("occurred_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (input.from) query = query.gte("occurred_at", input.from);
    if (input.to) query = query.lte("occurred_at", input.to);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as {
      actor_user_id: string | null;
      action: string;
      occurred_at: string;
      metadata: Record<string, unknown> | null;
    }[];
    for (const row of page) {
      rows.push({
        userId: row.actor_user_id,
        occurredAt: row.occurred_at,
        toolCalls: count(row.metadata?.toolCallCount),
        candidateCount: count(row.metadata?.candidateCount),
        succeeded: row.action === "external_freelancer_search_response_served",
      });
    }
    if (page.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export function aggregateSearchUsage(
  rows: readonly SearchUsageRow[],
): SearchUsageTotals {
  const totals: SearchUsageTotals = {
    runs: 0,
    successfulRuns: 0,
    toolCalls: 0,
    candidates: 0,
    costNanoUsd: 0,
  };
  for (const row of rows) {
    totals.runs += 1;
    if (row.succeeded) totals.successfulRuns += 1;
    totals.toolCalls += row.toolCalls;
    totals.candidates += row.candidateCount;
  }
  totals.costNanoUsd = totals.toolCalls * WEB_SEARCH_CALL_NANO_USD;
  return totals;
}

/** Suchnutzung je Nutzer, damit die Nutzertabelle beide Posten zeigen kann. */
export function groupSearchUsageByUser(
  rows: readonly SearchUsageRow[],
): Map<string, SearchUsageTotals> {
  const byUser = new Map<string, SearchUsageRow[]>();
  for (const row of rows) {
    if (!row.userId) continue;
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }
  return new Map(
    [...byUser.entries()].map(([userId, list]) => [
      userId,
      aggregateSearchUsage(list),
    ]),
  );
}
