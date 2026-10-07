import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/security/request";
import { isPlatformAnalyticsExcludedEmail } from "@/lib/admin/analytics-exclusions";
import type { CampaignSource, RecruitingEvent, RECRUITING_OUTCOMES } from "./recruiting-events";

type Input = {
  event: RecruitingEvent; userId?: string | null; entityId: string;
  plan?: string | null; outcome?: typeof RECRUITING_OUTCOMES[number];
  isInternal?: boolean; livemode?: boolean; sessionId?: string | null;
  source?: CampaignSource; origin?: "server" | "client";
};

/** Database uniqueness provides retry-safe event counting. Failures never alter rights. */
export async function recordRecruitingEvent(input: Input): Promise<void> {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return;
    const admin = createAdminSupabaseClient();
    let internal = input.isInternal === true || input.livemode === false || process.env.CONTEXT === "deploy-preview" || process.env.XPORTAL_LOCAL_PREVIEW === "1";
    if (input.userId && !internal) {
      const { data, error } = await admin.auth.admin.getUserById(input.userId);
      if (error || !data.user) return; // Do not classify unknown accounts as real customers.
      internal = isPlatformAnalyticsExcludedEmail(data.user.email) || data.user.app_metadata?.role === "admin";
    }
    const { error } = await admin.from("recruiting_events").upsert({
      event: input.event, entity_id: input.entityId, user_id: input.userId ?? null,
      session_id: input.sessionId ?? null, source: input.source ?? "direct",
      origin: input.origin ?? "server", plan: input.plan ?? null,
      outcome: input.outcome ?? "success", is_internal: internal,
    }, { onConflict: "event,entity_id,origin", ignoreDuplicates: true });
    if (error) throw error;
  } catch { logEvent("recruiting_measurement_failed", { step: input.event }); }
}
