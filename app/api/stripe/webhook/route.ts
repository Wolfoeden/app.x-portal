import { NextResponse } from "next/server";

import { orderConfirmationMessage } from "@/lib/billing/order-confirmation";
import {
  planForStripePaymentLink,
  planForStripePriceId,
} from "@/lib/billing/payment-links";
import type { FixedMonthlyPlan } from "@/lib/billing/plans";
import { verifyStripeSignature } from "@/lib/billing/stripe-signature";
import { deliverEmail } from "@/lib/email/deliver";
import { TERMS_VERSION } from "@/lib/legal/policy";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Der Rückkanal von Stripe.
 *
 * Bezahlt wird über ein Stripe-Monatsabonnement. Der Checkout verknüpft das
 * externe Abo mit dem bestehenden XPORTAL-Konto; ausschließlich invoice.paid
 * setzt anschließend Credits für die echte Stripe-Abrechnungsperiode.
 *
 * `assertSameOrigin` greift bewusst nicht: Stripe ruft aus einem fremden
 * Ursprung auf. Was den Endpunkt schützt, ist ausschließlich die Signatur — und
 * die wird gegen den **rohen** Körper geprüft, nicht gegen ein wieder
 * zusammengesetztes JSON.
 */

const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

type StripeEvent = {
  id?: unknown;
  type?: unknown;
  data?: { object?: unknown } | null;
};

type LinkedAccount = {
  user_id: string;
  stripe_plan_id: string | null;
};

const SUBSCRIPTION_STATUSES = new Set([
  "pending",
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

function stripeId(value: unknown, prefix: string): string | null {
  const direct = typeof value === "string" ? value : record(value)?.id;
  return typeof direct === "string" && direct.startsWith(`${prefix}_`)
    ? direct
    : null;
}

function subscriptionId(object: Record<string, unknown>): string | null {
  const ownId = stripeId(object.id, "sub");
  if (ownId) return ownId;
  const direct = stripeId(object.subscription, "sub");
  if (direct) return direct;
  const parent = record(object.parent);
  const details = record(parent?.subscription_details);
  return stripeId(details?.subscription, "sub");
}

function invoicePriceId(object: Record<string, unknown>): string | null {
  const lines = record(object.lines);
  const data = Array.isArray(lines?.data) ? lines.data : [];
  for (const entry of data) {
    const line = record(entry);
    const legacy = stripeId(line?.price, "price");
    if (legacy) return legacy;
    const pricing = record(line?.pricing);
    const details = record(pricing?.price_details);
    const current = stripeId(details?.price, "price");
    if (current) return current;
  }
  return null;
}

function subscriptionPriceId(object: Record<string, unknown>): string | null {
  const items = record(object.items);
  const data = Array.isArray(items?.data) ? items.data : [];
  for (const entry of data) {
    const item = record(entry);
    const price = stripeId(item?.price, "price");
    if (price) return price;
  }
  return null;
}

function unixInstant(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return null;
  }
  return new Date(value * 1_000).toISOString();
}

function invoicePeriod(object: Record<string, unknown>): {
  start: string;
  end: string;
} | null {
  const lines = record(object.lines);
  const data = Array.isArray(lines?.data) ? lines.data : [];
  const firstLine = record(data[0]);
  const linePeriod = record(firstLine?.period);
  const start = unixInstant(linePeriod?.start ?? object.period_start);
  const end = unixInstant(linePeriod?.end ?? object.period_end);
  return start && end && end > start ? { start, end } : null;
}

function subscriptionStatus(value: unknown, fallback = "pending"): string {
  return typeof value === "string" && SUBSCRIPTION_STATUSES.has(value)
    ? value
    : fallback;
}

/**
 * Die Vertragsbestätigung in Textform, nach der Freischaltung.
 *
 * Sie läuft getrennt von der Freischaltung und kann sie nicht umstoßen: Der
 * Vertrag steht, sobald `activate_paid_plan` durch ist. Würde ein Fehler beim
 * Versand die Antwort auf 5xx setzen, stellte Stripe dasselbe Ereignis erneut
 * zu — und der Kunde bekäme je nach Ursache entweder mehrere Bestätigungen
 * oder weiterhin keine. Ein Fehler wird deshalb protokolliert und nicht
 * weitergereicht.
 *
 * Die Adresse kommt aus dem Konto und nicht aus dem Stripe-Ereignis. Bei einem
 * Unternehmen zahlt oft die Buchhaltung; geschuldet ist die Bestätigung dem
 * Konto, das freigeschaltet wurde.
 */
async function sendOrderConfirmation(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  userId: string,
  eventId: string,
  plan: FixedMonthlyPlan,
): Promise<void> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    const email = data?.user?.email?.trim();
    if (error || !email) {
      logEvent("order_confirmation_skipped", { eventId, reason: "no_email" });
      return;
    }

    const result = await deliverEmail({
      to: email,
      ...orderConfirmationMessage(plan),
      // Geschuldet in Textform. Ein Widerspruch gegen Werbung darf sie
      // nicht aufhalten — wer bestellt hat, bekommt seine Bestaetigung.
      kind: "transactional",
    });
    if (!result.delivered) {
      // `docs/checkout-compliance.md` schuldet diese Bestätigung unverzüglich.
      // Bleibt sie aus, muss das im Protokoll stehen und von Hand nachgeholt
      // werden — still bliebe eine offene Pflicht unbemerkt.
      logEvent("order_confirmation_failed", { eventId, reason: result.reason });
      return;
    }
    logEvent("order_confirmation_sent", { eventId });
  } catch {
    logEvent("order_confirmation_failed", { eventId, reason: "unexpected" });
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const signature = verifyStripeSignature({
    rawBody,
    header: request.headers.get("stripe-signature"),
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  if (!signature.ok) {
    // Kein Grund im Klartext nach außen: eine Antwort, die zwischen "falsches
    // Secret" und "abgelaufen" unterscheidet, hilft beim Ausprobieren.
    logEvent("stripe_webhook_rejected", { reason: signature.reason });
    return NextResponse.json(
      { error: "Signatur konnte nicht bestätigt werden." },
      { status: 400 },
    );
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "Ungültiger Körper." }, { status: 400 });
  }

  const eventId = typeof event.id === "string" ? event.id : null;
  const eventType = typeof event.type === "string" ? event.type : null;
  if (!eventId || !eventType) {
    return NextResponse.json({ error: "Ereignis unvollständig." }, { status: 400 });
  }

  // Fremde Ereignisse werden bestätigt statt abgelehnt: eine Fehlerantwort
  // ließe Stripe ohne Nutzen wiederholen.
  if (!HANDLED_EVENTS.has(eventType)) {
    return NextResponse.json({ received: true, ignored: eventType });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json({ error: "Nicht verfügbar." }, { status: 503 });
  }

  const object = record(event.data?.object);
  if (!object) {
    return NextResponse.json({ error: "Ereignis unvollständig." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  if (eventType === "checkout.session.completed") {
    const reference = object.client_reference_id;
    const plan = planForStripePaymentLink(object.payment_link);
    const customer = stripeId(object.customer, "cus");
    const subscription = stripeId(object.subscription, "sub");
    if (typeof reference !== "string" || !UUID.test(reference) || !plan || !customer || !subscription) {
      logEvent("stripe_webhook_unassigned", {
        eventId,
        eventType,
        reason: !plan ? "unknown_payment_link" : "missing_account_or_subscription",
      });
      return NextResponse.json({ received: true, assigned: false });
    }

    const { data, error } = await admin.rpc("link_stripe_subscription_checkout", {
      p_event_id: eventId,
      p_event_type: eventType,
      p_user_id: reference,
      p_plan_id: plan.id,
      p_stripe_customer_id: customer,
      p_stripe_subscription_id: subscription,
      p_terms_version: TERMS_VERSION,
    });
    if (error) {
      logEvent("stripe_webhook_link_failed", { eventId });
      return NextResponse.json({ error: "Zuordnung fehlgeschlagen." }, { status: 503 });
    }
    const row = (Array.isArray(data) ? data[0] : data) as { linked?: unknown } | null;
    return NextResponse.json({ received: true, linked: row?.linked === true });
  }

  const subscription = subscriptionId(object);
  if (!subscription) {
    logEvent("stripe_webhook_unassigned", { eventId, eventType, reason: "missing_subscription" });
    return NextResponse.json({ received: true, assigned: false });
  }

  const linkedResult = await admin
    .from("user_ai_credit_accounts")
    .select("user_id,stripe_plan_id")
    .eq("stripe_subscription_id", subscription)
    .maybeSingle();
  if (linkedResult.error) {
    return NextResponse.json({ error: "Zuordnung nicht verfügbar." }, { status: 503 });
  }
  const linked = linkedResult.data as LinkedAccount | null;

  if (eventType === "invoice.paid" || eventType === "invoice.payment_failed") {
    const plan = planForStripePriceId(invoicePriceId(object));
    if (!plan) {
      return NextResponse.json({ received: true, ignored: "unknown_price" });
    }
    if (!linked) {
      // A known XPORTAL invoice can arrive milliseconds before the checkout
      // event that creates the subscription mapping. A retry resolves it.
      return NextResponse.json({ error: "Zuordnung noch nicht verfügbar." }, { status: 503 });
    }
    if (linked.stripe_plan_id !== plan.id) {
      logEvent("stripe_webhook_unassigned", { eventId, eventType, reason: "plan_mismatch" });
      return NextResponse.json({ received: true, assigned: false });
    }

    const invoice = stripeId(object.id, "in");
    if (!invoice) {
      return NextResponse.json({ error: "Rechnung unvollständig." }, { status: 400 });
    }

    if (eventType === "invoice.payment_failed") {
      const { error } = await admin.rpc("record_stripe_subscription_status", {
        p_event_id: eventId,
        p_event_type: eventType,
        p_stripe_subscription_id: subscription,
        p_status: "past_due",
        p_cancel_at_period_end: null,
        p_latest_invoice_id: invoice,
        p_latest_invoice_status: "payment_failed",
      });
      if (error) {
        return NextResponse.json({ error: "Zahlungsstatus nicht gespeichert." }, { status: 503 });
      }
      return NextResponse.json({ received: true, recorded: true });
    }

    const customer = stripeId(object.customer, "cus");
    const period = invoicePeriod(object);
    if (!customer || !period) {
      return NextResponse.json({ error: "Rechnungsperiode unvollständig." }, { status: 400 });
    }
    const { data, error } = await admin.rpc("activate_paid_plan", {
      p_event_id: eventId,
      p_event_type: eventType,
      p_user_id: linked.user_id,
      p_plan_id: plan.id,
      p_plan_allowance: plan.monthlyCredits,
      p_period_start: period.start,
      p_period_end: period.end,
      p_stripe_customer_id: customer,
      p_stripe_subscription_id: subscription,
      p_invoice_id: invoice,
    });
    if (error) {
      logEvent("stripe_webhook_activation_failed", { eventId });
      return NextResponse.json({ error: "Freischaltung fehlgeschlagen." }, { status: 503 });
    }
    const row = (Array.isArray(data) ? data[0] : data) as {
      activated?: unknown;
      was_first_payment?: unknown;
    } | null;
    const activated = row?.activated === true;
    logEvent("stripe_webhook_activated", { eventId, repeated: !activated });
    if (activated && row?.was_first_payment === true) {
      await sendOrderConfirmation(admin, linked.user_id, eventId, plan);
    }
    return NextResponse.json({ received: true, activated });
  }

  if (!linked) {
    if (planForStripePriceId(subscriptionPriceId(object))) {
      // Stripe does not guarantee ordering. A known XPORTAL subscription
      // update may beat checkout.session.completed by a few milliseconds.
      return NextResponse.json({ error: "Zuordnung noch nicht verfügbar." }, { status: 503 });
    }
    return NextResponse.json({ received: true, assigned: false });
  }
  const status = eventType === "customer.subscription.deleted"
    ? "canceled"
    : subscriptionStatus(object.status);
  const cancelAtPeriodEnd = eventType === "customer.subscription.deleted"
    ? false
    : object.cancel_at_period_end === true;
  const { error } = await admin.rpc("record_stripe_subscription_status", {
    p_event_id: eventId,
    p_event_type: eventType,
    p_stripe_subscription_id: subscription,
    p_status: status,
    p_cancel_at_period_end: cancelAtPeriodEnd,
    p_latest_invoice_id: null,
    p_latest_invoice_status: null,
  });
  if (error) {
    return NextResponse.json({ error: "Abonnementstatus nicht gespeichert." }, { status: 503 });
  }
  return NextResponse.json({ received: true, recorded: true });
}
