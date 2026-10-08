import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { stripeRequest } from "@/lib/billing/stripe-api";
import { syncStripeSubscription } from "@/lib/billing/subscription";
import { assertSameOrigin } from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (user.isAnonymous) return NextResponse.json({ error: "login_required" }, { status: 401 });
    const { data, error } = await createAdminSupabaseClient().from("user_ai_credit_accounts")
      .select("stripe_subscription_id,stripe_subscription_status").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    const row = data as { stripe_subscription_id?: string; stripe_subscription_status?: string } | null;
    if (!row?.stripe_subscription_id) return NextResponse.json({ error: "no_subscription" }, { status: 409 });
    if (row.stripe_subscription_status !== "canceled") await stripeRequest("POST", `/subscriptions/${row.stripe_subscription_id}`, {
      cancel_at_period_end: true,
    }, { idempotencyKey: `xportal-cancel-${row.stripe_subscription_id}` });
    const synced = await syncStripeSubscription(row.stripe_subscription_id, `cancel_${randomUUID()}`, "account.cancel");
    return NextResponse.json({ cancelAtPeriodEnd: true, accessUntil: synced.accessUntil, trialEnd: synced.trialEnd });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "cancel_unavailable" }, { status: 503 });
  }
}
