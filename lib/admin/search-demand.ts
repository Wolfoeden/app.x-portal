import "server-only";

import { platformAnalyticsExcludedUserIds } from "@/lib/admin/analytics-exclusions";
import { readAdminAuthEmails } from "@/lib/admin/auth-emails";
import {
  buildSearchDemandReport,
  type DemandPeriod,
  type SearchDemandReport,
  type SearchDemandSourceRow,
} from "@/lib/admin/search-demand-analysis";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 1_000;
const MAX_ROWS = 20_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

async function readShortlistRows(input: {
  period: DemandPeriod;
  now: Date;
}): Promise<{ rows: SearchDemandSourceRow[]; truncated: boolean }> {
  const admin = createAdminSupabaseClient();
  const rows: SearchDemandSourceRow[] = [];
  const earliest =
    input.period === "all"
      ? null
      : new Date(input.now.getTime() - input.period * 2 * DAY_MS).toISOString();

  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    let query = admin
      .from("shortlists")
      .select(
        "id,project_id,owner_user_id,brief_snapshot,decision_snapshot,result_count,result_status,created_at",
      )
      .lte("created_at", input.now.toISOString())
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (earliest) query = query.gte("created_at", earliest);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as SearchDemandSourceRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export async function getSearchDemandReport(input: {
  period?: DemandPeriod;
} = {}): Promise<SearchDemandReport & { truncated: boolean }> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error("Admin demand service is not configured");
  }
  const now = new Date();
  const period = input.period ?? 90;
  const [shortlists, auth] = await Promise.all([
    readShortlistRows({ period, now }),
    readAdminAuthEmails(),
  ]);
  const excludedUserIds = platformAnalyticsExcludedUserIds(auth.emails);
  return {
    ...buildSearchDemandReport({
      rows: shortlists.rows,
      excludedUserIds,
      excludedAccounts: excludedUserIds.size,
      period,
      now,
    }),
    truncated: shortlists.truncated || auth.truncated,
  };
}
