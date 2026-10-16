import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { PRAXIS_ACTIONS, summarizePraxisActivity, type PraxisActivity, type PraxisActivityRow } from "./praxis-activity-model";

export const PRAXIS_WINDOW_DAYS = 180;
const ROW_MAX = 5_000;

/**
 * Liest Aufrufe, Interesse und Kalenderklicks der Praxisseite aus dem
 * Protokoll — für alle Kontakte (Admin › Praxisseite) oder für einen
 * (Kontaktseite). Nur Aktion, Kontakt, Zeit und die Schlüssel der Beispiele.
 */
export async function getPraxisActivity(contactId?: string): Promise<PraxisActivity> {
  const since = new Date(Date.now() - PRAXIS_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let query = createAdminSupabaseClient()
    .from("audit_events")
    .select("id,action,target_id,occurred_at,metadata")
    .in("action", [...PRAXIS_ACTIONS])
    .eq("target_type", "crm_contacts")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(ROW_MAX);
  if (contactId) query = query.eq("target_id", contactId);
  const { data, error } = await query;
  if (error) throw error;
  return summarizePraxisActivity((data ?? []) as PraxisActivityRow[]);
}
