import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type BillingEntitlement = {
  canRunAi: boolean;
  canUseRecruiting: boolean;
  source: "trial" | "paid" | "legacy" | "none";
  reason: string;
};

export async function getBillingEntitlement(userId: string): Promise<BillingEntitlement> {
  const { data, error } = await createAdminSupabaseClient().rpc("get_recruiting_entitlement", {
    p_user_id: userId,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as {
    can_run_ai?: boolean; can_use_recruiting?: boolean; source?: string; reason?: string;
  } | null;
  return {
    canRunAi: row?.can_run_ai === true,
    canUseRecruiting: row?.can_use_recruiting === true,
    source: row?.source === "trial" || row?.source === "paid" || row?.source === "legacy"
      ? row.source : "none",
    reason: row?.reason ?? "billing_required",
  };
}

export async function userHasRecruitingAccess(userId: string): Promise<boolean> {
  return (await getBillingEntitlement(userId)).canUseRecruiting;
}
