import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { recordCheckoutStarted } from "@/lib/billing/funnel";
import {
  fixedPlanCheckout,
  type CheckoutPlanId,
} from "@/lib/billing/payment-links";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkoutPlan(value: string | null): CheckoutPlanId | null {
  return value === "basic" || value === "pro" || value === "business"
    ? value
    : null;
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

  try {
    const user = await requireCurrentUser();
    if (user.isAnonymous) {
      await recordCheckoutStarted({ userId: user.id, plan, result: "login_required" });
      return NextResponse.redirect(
        new URL(`/chat?checkout=${plan}`, redirectBase),
        303,
      );
    }

    const checkout = fixedPlanCheckout(plan, user.id);
    await recordCheckoutStarted({
      userId: user.id,
      plan,
      result: checkout ? "stripe" : "unavailable",
    });
    if (!checkout) {
      return NextResponse.redirect(
        new URL("/preise?billing=unavailable", redirectBase),
        303,
      );
    }
    return NextResponse.redirect(checkout, 303);
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      await recordCheckoutStarted({ userId: null, plan, result: "login_required" });
      return NextResponse.redirect(
        new URL(`/chat?checkout=${plan}`, redirectBase),
        303,
      );
    }
    return NextResponse.redirect(
      new URL("/preise?billing=unavailable", redirectBase),
      303,
    );
  }
}
