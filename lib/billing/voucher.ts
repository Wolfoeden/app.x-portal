import "server-only";

import type { CheckoutPlanId } from "@/lib/billing/payment-links";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type VoucherRedemptionStatus =
  | "redeemed"
  | "already_redeemed"
  | "invalid"
  | "exhausted"
  | "account_ineligible";

export type VoucherRedemption = {
  status: VoucherRedemptionStatus;
  creditsTotal: number;
  trialEnd: string | null;
  redemptionsRemaining: number;
};

export async function redeemRecruitingVoucher(input: {
  userId: string;
  code: string;
  planId: CheckoutPlanId;
}): Promise<VoucherRedemption> {
  const { data, error } = await createAdminSupabaseClient().rpc(
    "redeem_recruiting_voucher",
    {
      p_user_id: input.userId,
      p_code: input.code,
      p_plan_id: input.planId,
    },
  );
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as {
    status?: unknown;
    credits_total?: unknown;
    trial_end?: unknown;
    redemptions_remaining?: unknown;
  } | null;
  const status = row?.status;
  if (
    status !== "redeemed" &&
    status !== "already_redeemed" &&
    status !== "invalid" &&
    status !== "exhausted" &&
    status !== "account_ineligible"
  ) {
    throw new Error("invalid_voucher_redemption");
  }

  return {
    status,
    creditsTotal: Number(row?.credits_total ?? 0),
    trialEnd: typeof row?.trial_end === "string" ? row.trial_end : null,
    redemptionsRemaining: Number(row?.redemptions_remaining ?? 0),
  };
}
