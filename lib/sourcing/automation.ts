import "server-only";

import { writeAuditEvent } from "@/lib/audit/write";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Die Betriebsarten der Beschaffung.
 *
 * Alles hier ist in der Vorgabe **aus**: Mit dem Anlegen eines Kandidaten
 * beginnt für einen Menschen, der von XPORTAL nichts weiß, die Frist aus
 * Art. 14 DSGVO. Wer das anschaltet, soll es getan haben, nicht geerbt haben.
 *
 * Die früheren Schalter für Adresssuche, Tagesbudget und selbsttätige
 * Einladungen las kein Code; sie sind seit 19.10.2026 entfernt (die Spalten
 * in `sourcing_automation` bleiben vorerst stehen).
 *
 * Der Knopf im Adminbereich wirkt in jeder Betriebsart. „Aus" heißt „von
 * selbst passiert nichts", nicht „geht nicht".
 */

export type SourcingAutomation = {
  absorbUserSearches: boolean;
  pausedUntil: string | null;
  updatedAt: string | null;
};

export const SOURCING_AUTOMATION_DEFAULT: SourcingAutomation = {
  absorbUserSearches: false,
  pausedUntil: null,
  updatedAt: null,
};

const COLUMNS = "absorb_user_searches,paused_until,updated_at";

/**
 * Liest die Einstellung. Fehlt die Zeile oder ist die Datenbank nicht
 * erreichbar, gilt die Vorgabe — und die schaltet alles ab. Ein Ausfall darf
 * nicht dazu führen, dass mehr passiert als vorgesehen.
 */
export async function readSourcingAutomation(): Promise<SourcingAutomation> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("sourcing_automation")
    .select(COLUMNS)
    .eq("id", true)
    .maybeSingle();

  if (error || !data) return SOURCING_AUTOMATION_DEFAULT;

  const zeile = data as Record<string, unknown>;
  return {
    absorbUserSearches: Boolean(zeile.absorb_user_searches),
    pausedUntil: (zeile.paused_until as string | null) ?? null,
    updatedAt: (zeile.updated_at as string | null) ?? null,
  };
}

/** Angehalten? Dann ruht jede Automatik, ohne dass sie verloren geht. */
export function isPaused(
  automation: SourcingAutomation,
  now: Date = new Date(),
): boolean {
  if (!automation.pausedUntil) return false;
  const bis = Date.parse(automation.pausedUntil);
  return Number.isFinite(bis) && bis > now.getTime();
}

export type SourcingAutomationPatch = Partial<{
  absorbUserSearches: boolean;
  pausedUntil: string | null;
}>;

export async function updateSourcingAutomation(
  patch: SourcingAutomationPatch,
  adminId: string,
): Promise<SourcingAutomation> {
  const admin = createAdminSupabaseClient();
  const zeile: Record<string, unknown> = { id: true, updated_by: adminId, updated_at: new Date().toISOString() };
  if (patch.absorbUserSearches !== undefined) {
    zeile.absorb_user_searches = patch.absorbUserSearches;
  }
  if (patch.pausedUntil !== undefined) zeile.paused_until = patch.pausedUntil;

  const { error } = await admin.from("sourcing_automation").upsert(zeile);
  if (error) throw error;

  await writeAuditEvent({
    actorUserId: adminId,
    action: "sourcing_automation_updated",
    targetType: "sourcing_automation",
    outcome: "success",
    metadata: patch as Record<string, string | number | boolean | null>,
    required: true,
  });

  return readSourcingAutomation();
}
