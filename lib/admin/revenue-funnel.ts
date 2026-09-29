import "server-only";

import { placementRequestsEnabled } from "@/lib/placement/config";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import {
  buildRevenueFunnel,
  REVENUE_FUNNEL_ACTIONS,
  REVENUE_FUNNEL_WINDOW_DAYS,
  type RevenueFunnel,
  type RevenueFunnelRow,
} from "./revenue-funnel-model";

const PAGE_SIZE = 1_000;
const ROW_MAX = 20_000;

/**
 * Liest die Messpunkte der letzten 30 Tage aus dem Protokoll. Gelesen werden
 * nur Aktion, Konto und die Metadaten des Messpunkts — keine Inhalte.
 */
export async function getRevenueFunnel(
  excludedUserIds: ReadonlySet<string>,
): Promise<RevenueFunnel> {
  const admin = createAdminSupabaseClient();
  const since = new Date(
    Date.now() - REVENUE_FUNNEL_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const rows: RevenueFunnelRow[] = [];
  let truncated = false;
  for (let offset = 0; offset < ROW_MAX; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from("audit_events")
      .select("id,action,actor_user_id,target_id,metadata")
      .in("action", [...REVENUE_FUNNEL_ACTIONS])
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as RevenueFunnelRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    if (offset + PAGE_SIZE >= ROW_MAX) truncated = true;
  }
  return buildRevenueFunnel(rows, excludedUserIds, truncated, {
    placement: placementRequestsEnabled(),
  });
}
