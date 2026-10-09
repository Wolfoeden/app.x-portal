import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getAiCreditSnapshot } from "@/lib/ai/quota";
import { getBillingEntitlement } from "@/lib/billing/entitlements";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const credits = await getAiCreditSnapshot({ userId: user.id, isAnonymous: user.isAnonymous });
    const [access, result] = await Promise.all([
      getBillingEntitlement(user.id),
      createAdminSupabaseClient().from("user_ai_credit_accounts")
        .select("stripe_plan_id,stripe_trial_end,voucher_trial_end,stripe_paid_through,stripe_first_paid_at,stripe_cancel_requested_at")
        .eq("user_id", user.id).maybeSingle(),
    ]);
    if (result.error) throw result.error;
    const row = result.data as { stripe_plan_id?: string; stripe_trial_end?: string; voucher_trial_end?: string; stripe_paid_through?: string; stripe_first_paid_at?: string; stripe_cancel_requested_at?: string } | null;
    return NextResponse.json({
      planId: credits.planId, selectedPlanId: row?.stripe_plan_id ?? null,
      subscriptionStatus: credits.subscriptionStatus, trialEnd: row?.stripe_trial_end ?? row?.voucher_trial_end ?? null,
      periodEnd: credits.periodEnd, cancelAtPeriodEnd: credits.cancelAtPeriodEnd,
      latestInvoiceStatus: credits.latestInvoiceStatus, paidThrough: row?.stripe_paid_through ?? null,
      firstPaidAt: row?.stripe_first_paid_at ?? null, access,
      credits: { total: credits.total, used: credits.used, reserved: credits.reserved, remaining: credits.remaining },
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
  }
}
