import { NextResponse } from "next/server";

import { orderConfirmationMessage } from "@/lib/billing/order-confirmation";
import { planForStripePaymentLink } from "@/lib/billing/payment-links";
import { recordSubscriptionPaid } from "@/lib/billing/funnel";
import { BillingError, RECRUITING_BILLING_KIND, stripeId, stripeObject, syncStripeSubscription } from "@/lib/billing/subscription";
import { verifyStripeSignature } from "@/lib/billing/stripe-signature";
import { deliverEmail } from "@/lib/email/deliver";
import { SAAS_TERMS_VERSION, TERMS_VERSION } from "@/lib/legal/policy";
import { writeAuditEvent } from "@/lib/audit/write";
import { recordPlacementInvoicePaid } from "@/lib/placement/invoices";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HANDLED_EVENTS = new Set([
  "checkout.session.completed", "checkout.session.async_payment_succeeded",
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  "customer.subscription.trial_will_end", "invoice.paid", "invoice.payment_failed",
  "invoice.payment_action_required", "invoice.finalization_failed",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function subscriptionId(object: Record<string, unknown>): string | null {
  return stripeId(object.id, "sub") ?? stripeId(object.subscription, "sub")
    ?? stripeId(stripeObject(stripeObject(object.parent).subscription_details).subscription, "sub");
}

/** Raw body signature is checked before parsing or any external API/database call. */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = verifyStripeSignature({ rawBody, header: request.headers.get("stripe-signature"), secret: process.env.STRIPE_WEBHOOK_SECRET });
  if (!signature.ok) {
    logEvent("stripe_webhook_rejected", { reason: signature.reason });
    return NextResponse.json({ error: "Signatur konnte nicht bestätigt werden." }, { status: 400 });
  }
  let event: { id?: unknown; type?: unknown; data?: { object?: unknown } };
  try { event = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Ungültiger Körper." }, { status: 400 }); }
  if (typeof event.id !== "string" || !/^evt_[A-Za-z0-9_]+$/u.test(event.id) || typeof event.type !== "string") {
    return NextResponse.json({ error: "Ereignis unvollständig." }, { status: 400 });
  }
  const eventId = event.id;
  const eventType = event.type;
  if (!HANDLED_EVENTS.has(eventType)) return NextResponse.json({ received: true, ignored: eventType });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return NextResponse.json({ error: "Nicht verfügbar." }, { status: 503 });
  const object = stripeObject(event.data?.object);
  if (!Object.keys(object).length) return NextResponse.json({ error: "Ereignis unvollständig." }, { status: 400 });
  const admin = createAdminSupabaseClient();

  // Historic invoices remain valid; fee eligibility of new requests is archived separately.
  if (eventType === "invoice.paid" && stripeObject(object.metadata).xportal_kind === "placement_fee") {
    const invoice = stripeId(object.id, "in");
    if (!invoice) return NextResponse.json({ error: "Rechnung unvollständig." }, { status: 400 });
    try {
      const paid = await recordPlacementInvoicePaid(invoice);
      if (paid?.introId) await writeAuditEvent({ actorUserId: null, action: "placement_fee_paid", targetType: "intro_booking", targetId: paid.introId,
        outcome: "success", metadata: { clientUserId: paid.clientUserId, feeMinor: paid.feeMinor, via: "stripe" } });
      return NextResponse.json({ received: true, recorded: Boolean(paid) });
    } catch { return NextResponse.json({ error: "Zahlung nicht verbucht." }, { status: 503 }); }
  }

  const subscription = subscriptionId(object);
  if (!subscription) return NextResponse.json({ received: true, assigned: false });
  let checkoutSession: string | undefined;
  try {
    if (eventType.startsWith("checkout.session.")) {
      if (stripeObject(object.metadata).xportal_kind === RECRUITING_BILLING_KIND) {
        checkoutSession = stripeId(object.id, "cs") ?? undefined;
        if (!checkoutSession) return NextResponse.json({ error: "Checkout unvollständig." }, { status: 400 });
      } else {
        const plan = planForStripePaymentLink(object.payment_link);
        const reference = object.client_reference_id;
        const customer = stripeId(object.customer, "cus");
        if (!plan || typeof reference !== "string" || !UUID.test(reference) || !customer) {
          return NextResponse.json({ received: true, assigned: false });
        }
        const linked = await admin.rpc("link_stripe_subscription_checkout", {
          p_event_id: `${eventId}_link`, p_event_type: "checkout.session.completed", p_user_id: reference,
          p_plan_id: plan.id, p_stripe_customer_id: customer, p_stripe_subscription_id: subscription, p_terms_version: TERMS_VERSION,
        });
        if (linked.error) throw linked.error;
      }
    }
    // Event snapshots only trigger a fresh read. They cannot restore a canceled
    // renewal, replay an old credit period, or turn a zero invoice into revenue.
    const result = await syncStripeSubscription(subscription, eventId, eventType, checkoutSession);
    if (result.paidActivated) await recordSubscriptionPaid({ userId: result.userId, plan: result.plan.id,
      monthlyNetCents: result.plan.priceNetCents, firstPayment: result.firstPayment });
    if (result.paidActivated && result.firstPayment) {
      try {
        const { data, error } = await admin.auth.admin.getUserById(result.userId);
        const email = data.user?.email?.trim();
        if (!error && email) {
          const delivered = await deliverEmail({ to: email, ...orderConfirmationMessage(result.plan, result.isRecruiting ? SAAS_TERMS_VERSION : TERMS_VERSION), kind: "transactional" });
          if (!delivered.delivered) logEvent("order_confirmation_failed", { eventId, reason: delivered.reason });
        } else logEvent("order_confirmation_skipped", { eventId, reason: "no_email" });
      } catch { logEvent("order_confirmation_failed", { eventId, reason: "unexpected" }); }
    }
    return NextResponse.json({ received: true, linked: Boolean(checkoutSession), trialActivated: result.trialActivated,
      activated: result.paidActivated, recorded: true });
  } catch (error) {
    if (error instanceof BillingError && error.code === "unknown_price") return NextResponse.json({ received: true, ignored: "unknown_price" });
    logEvent("stripe_webhook_sync_failed", { eventId, eventType });
    return NextResponse.json({ error: "Abonnementstatus noch nicht bestätigt." }, { status: 503 });
  }
}
