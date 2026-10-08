import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { stripeId } from "@/lib/billing/subscription";
import { stripeRequest } from "@/lib/billing/stripe-api";
import { syncStripeSubscription } from "@/lib/billing/subscription";
import { assertSameOrigin } from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (user.isAnonymous) return NextResponse.json({ error: "login_required" }, { status: 401 });
    const admin = createAdminSupabaseClient();
    const account = await admin.from("user_ai_credit_accounts").select("stripe_subscription_id").eq("user_id", user.id).maybeSingle();
    if (account.error) throw account.error;
    let subscription = (account.data as { stripe_subscription_id?: string } | null)?.stripe_subscription_id;
    let sessionId: string | undefined;
    if (!subscription) {
      const attempt = await admin.from("recruiting_checkout_attempts").select("session_id").eq("user_id", user.id).maybeSingle();
      if (attempt.error) throw attempt.error;
      sessionId = (attempt.data as { session_id?: string } | null)?.session_id;
      if (sessionId) {
        const session = await stripeRequest<{ status?: string; subscription?: unknown }>("GET", `/checkout/sessions/${sessionId}`);
        if (session.status === "complete") subscription = stripeId(session.subscription, "sub") ?? undefined;
      }
    }
    if (!subscription) return NextResponse.json({ reconciled: false, reason: "checkout_not_completed" });
    const result = await syncStripeSubscription(subscription, `reconcile_${randomUUID()}`, "account.reconcile", sessionId);
    return NextResponse.json({ reconciled: true, trialEnd: result.trialEnd, accessUntil: result.accessUntil });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "reconcile_unavailable" }, { status: 503 });
  }
}
