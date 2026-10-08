import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { recordCheckoutStarted } from "@/lib/billing/funnel";
import { StripeRequestError } from "@/lib/billing/stripe-api";
import { BillingError, checkoutPlan, startSubscriptionCheckout } from "@/lib/billing/subscription";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fehlercode für das Protokoll; Stripe-Meldungen bleiben draußen. */
function checkoutFailureReason(error: unknown): string {
  if (error instanceof BillingError) return error.code;
  if (error instanceof StripeRequestError) return `stripe_${error.status}_${error.code ?? "error"}`.slice(0, 80);
  return "unexpected";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const redirectBase = requestUrl.hostname.endsWith(".netlify.app")
    ? new URL(SITE_URL)
    : requestUrl;
  const plan = checkoutPlan(requestUrl.searchParams.get("plan"));
  if (!plan) {
    return NextResponse.redirect(new URL("/preise?billing=invalid-plan", redirectBase), 303);
  }

  let userId: string | null = null;
  try {
    const user = await requireCurrentUser();
    userId = user.id;
    if (user.isAnonymous) {
      await recordCheckoutStarted({ userId: user.id, plan, result: "login_required" });
      return NextResponse.redirect(
        new URL(`/chat?checkout=${plan}`, redirectBase),
        303,
      );
    }

    const checkout = await startSubscriptionCheckout(user.id, plan, redirectBase.origin);
    await recordCheckoutStarted({
      userId: user.id,
      plan,
      result: checkout ? "stripe" : "unavailable",
    });
    return NextResponse.redirect(checkout, 303);
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      await recordCheckoutStarted({ userId: null, plan, result: "login_required" });
      return NextResponse.redirect(
        new URL(`/chat?checkout=${plan}`, redirectBase),
        303,
      );
    }
    const code = error instanceof BillingError ? error.code : "unavailable";
    await recordCheckoutStarted({ userId, plan, result: "unavailable", reason: checkoutFailureReason(error) });
    return NextResponse.redirect(
      new URL(`/konto?billing=${encodeURIComponent(code)}`, redirectBase),
      303,
    );
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonWithLimit(request, 1_000) as { plan?: unknown };
    const plan = checkoutPlan(body.plan);
    if (!plan) return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
    const user = await requireCurrentUser();
    if (user.isAnonymous) return NextResponse.json({ error: "login_required" }, { status: 401 });
    const requestUrl = new URL(request.url);
    const origin = requestUrl.hostname.endsWith(".netlify.app") ? new URL(SITE_URL).origin : requestUrl.origin;
    const url = await startSubscriptionCheckout(user.id, plan, origin);
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: error instanceof BillingError ? error.code : "checkout_unavailable" }, {
      status: error instanceof BillingError ? error.status : 503,
    });
  }
}
