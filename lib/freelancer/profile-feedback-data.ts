import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import {
  PROFILE_FEEDBACK_ACTIONS,
  summarizeProfileFeedback,
  type ProfileFeedbackCount,
} from "./profile-feedback";

/**
 * Die Rückmeldungen aus Suchen zu einem veröffentlichten Profil, für die
 * Admin-Ansicht. Liest nur das Protokoll; wer zurückgemeldet hat, bleibt
 * dort und wird hier nicht gezeigt.
 */
export async function loadProfileFeedbackSummary(
  profileId: string,
): Promise<ProfileFeedbackCount[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("audit_events")
    .select("action,metadata")
    .eq("target_type", "freelancer_profile")
    .eq("target_id", profileId)
    .in("action", Object.values(PROFILE_FEEDBACK_ACTIONS))
    .order("occurred_at", { ascending: false })
    .limit(1_000);
  if (error) throw error;
  return summarizeProfileFeedback(
    (data ?? []).map((row) => ({
      action: typeof row.action === "string" ? row.action : "",
      reason:
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>).reason
          : null,
    })),
  );
}
