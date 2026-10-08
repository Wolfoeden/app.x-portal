import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { stripeRequest } from "@/lib/billing/stripe-api";
import { assertSameOrigin } from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (user.isAnonymous) return NextResponse.json({ error: "login_required" }, { status: 401 });
    const { data, error } = await createAdminSupabaseClient().from("user_ai_credit_accounts")
      .select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    const customer = (data as { stripe_customer_id?: string } | null)?.stripe_customer_id;
    if (!customer) return NextResponse.json({ error: "no_billing_customer" }, { status: 409 });
    // Without an explicit ID the account's default portal is used, checked
    // against the same requirements below.
    let configuration = process.env.STRIPE_RECRUITING_PORTAL_CONFIGURATION_ID?.trim();
    if (!configuration) {
      const defaults = await stripeRequest<{ data?: { id?: string }[] }>("GET", "/billing_portal/configurations", { is_default: true, active: true, limit: 1 });
      configuration = defaults.data?.[0]?.id;
    }
    if (!configuration) return NextResponse.json({ error: "portal_not_configured" }, { status: 503 });
    // Check the actual supplied configuration, not merely an environment flag.
    const config = await stripeRequest<{ active?: boolean; features?: { payment_method_update?: { enabled?: boolean }; invoice_history?: { enabled?: boolean }; subscription_cancel?: { enabled?: boolean; mode?: string } } }>("GET", `/billing_portal/configurations/${configuration}`);
    if (!config.active || !config.features?.payment_method_update?.enabled || !config.features.invoice_history?.enabled
      || !config.features.subscription_cancel?.enabled || config.features.subscription_cancel.mode !== "at_period_end") {
      return NextResponse.json({ error: "portal_configuration_mismatch" }, { status: 503 });
    }
    const origin = new URL(request.url);
    const returnOrigin = origin.hostname.endsWith(".netlify.app") ? new URL(SITE_URL).origin : origin.origin;
    const session = await stripeRequest<{ url?: string }>("POST", "/billing_portal/sessions", {
      customer, configuration, return_url: `${returnOrigin}/konto`,
    });
    if (!session.url?.startsWith("https://billing.stripe.com/")) throw new Error("invalid_portal_url");
    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "portal_unavailable" }, { status: 503 });
  }
}
