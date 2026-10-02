import "server-only";

import { writeAuditEvent } from "@/lib/audit/write";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import {
  LEAD_PREPARE_MODES,
  LEAD_SEND_MODES,
  type LeadAutomation,
  type LeadPrepareMode,
  type LeadSendMode,
} from "./automation-model";

export * from "./automation-model";

/**
 * Die Betriebsart der Lead-Automatik (public.leadgen_automation).
 *
 * Bis zum 2. Oktober 2026 entschied eine Konstante im Code, ob der Zeitplan
 * selbst verschickt. Jetzt steht die Entscheidung in einer Zeile, die der
 * Betreiber im Adminbereich setzt, und der Zeitgeber in der Datenbank fragt
 * sie ab, bevor er die Anwendung weckt. Die Route fragt ein zweites Mal —
 * ein Versand, der Werbung verschickt, verdient zwei Schlösser.
 */

const COLUMNS =
  "prepare_mode,send_mode,paused_until,daily_limit,last_arrival_trigger_at,updated_at,updated_by";

/**
 * Vorsichtig, wenn nichts zu lesen ist: abgleichen ja, verschicken nein. Ein
 * Ausfall der Datenbank darf nie dazu führen, dass mehr passiert als
 * eingestellt.
 */
export const LEAD_AUTOMATION_DEFAULT: LeadAutomation = {
  prepareMode: "scheduled",
  sendMode: "manual",
  pausedUntil: null,
  dailyLimit: null,
  lastArrivalTriggerAt: null,
  updatedAt: null,
  updatedBy: null,
};

function prepareMode(value: unknown): LeadPrepareMode {
  return (LEAD_PREPARE_MODES as readonly unknown[]).includes(value)
    ? (value as LeadPrepareMode)
    : LEAD_AUTOMATION_DEFAULT.prepareMode;
}

function sendMode(value: unknown): LeadSendMode {
  return (LEAD_SEND_MODES as readonly unknown[]).includes(value)
    ? (value as LeadSendMode)
    : LEAD_AUTOMATION_DEFAULT.sendMode;
}

export async function readLeadAutomation(): Promise<LeadAutomation> {
  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("leadgen_automation")
      .select(COLUMNS)
      .eq("id", true)
      .maybeSingle();
    if (error || !data) return LEAD_AUTOMATION_DEFAULT;

    const zeile = data as Record<string, unknown>;
    const limit = Number(zeile.daily_limit);
    return {
      prepareMode: prepareMode(zeile.prepare_mode),
      sendMode: sendMode(zeile.send_mode),
      pausedUntil: (zeile.paused_until as string | null) ?? null,
      dailyLimit: Number.isInteger(limit) && limit > 0 ? limit : null,
      lastArrivalTriggerAt: (zeile.last_arrival_trigger_at as string | null) ?? null,
      updatedAt: (zeile.updated_at as string | null) ?? null,
      updatedBy: (zeile.updated_by as string | null) ?? null,
    };
  } catch {
    return LEAD_AUTOMATION_DEFAULT;
  }
}

export type LeadAutomationPatch = Partial<{
  prepareMode: LeadPrepareMode;
  sendMode: LeadSendMode;
  pausedUntil: string | null;
  dailyLimit: number | null;
}>;

export async function updateLeadAutomation(
  patch: LeadAutomationPatch,
  adminId: string,
): Promise<LeadAutomation> {
  const admin = createAdminSupabaseClient();
  const zeile: Record<string, unknown> = {
    id: true,
    updated_by: adminId,
    updated_at: new Date().toISOString(),
  };
  if (patch.prepareMode !== undefined) zeile.prepare_mode = patch.prepareMode;
  if (patch.sendMode !== undefined) zeile.send_mode = patch.sendMode;
  if (patch.pausedUntil !== undefined) zeile.paused_until = patch.pausedUntil;
  if (patch.dailyLimit !== undefined) {
    zeile.daily_limit =
      patch.dailyLimit === null ? null : Math.min(Math.max(Math.round(patch.dailyLimit), 1), 200);
  }

  const { error } = await admin.from("leadgen_automation").upsert(zeile);
  if (error) throw error;

  // Wer den automatischen Versand eingeschaltet hat, muss später benennbar
  // sein: Er verschickt Werbung an Menschen, die nicht darum gebeten haben.
  await writeAuditEvent({
    actorUserId: adminId,
    action: "leadgen_automation_updated",
    targetType: "leadgen_automation",
    outcome: "success",
    metadata: patch as Record<string, string | number | boolean | null>,
    required: true,
  });

  return readLeadAutomation();
}
