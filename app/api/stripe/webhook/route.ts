import { NextResponse } from "next/server";

import { CREDIT_PLANS } from "@/lib/ai/credit-policy";
import { orderConfirmationMessage } from "@/lib/billing/order-confirmation";
import { verifyStripeSignature } from "@/lib/billing/stripe-signature";
import { deliverEmail } from "@/lib/email/deliver";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Der Rückkanal von Stripe.
 *
 * Bezahlt wird über einen Payment Link; hier kommt die Bestätigung an und
 * schaltet die Stufe frei. Ohne diese Route bliebe ein zahlender Kunde auf der
 * Gratisstufe stehen, bis jemand von Hand nachbucht.
 *
 * `assertSameOrigin` greift bewusst nicht: Stripe ruft aus einem fremden
 * Ursprung auf. Was den Endpunkt schützt, ist ausschließlich die Signatur — und
 * die wird gegen den **rohen** Körper geprüft, nicht gegen ein wieder
 * zusammengesetztes JSON.
 */

/** Nur diese Ereignisse schalten frei. Alles andere wird bestätigt und verworfen. */
const ACTIVATING_EVENTS = new Set(["checkout.session.completed"]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

type StripeEvent = {
  id?: unknown;
  type?: unknown;
  data?: { object?: { client_reference_id?: unknown } } | null;
};

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
      ...orderConfirmationMessage(),
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

  // Alles, was nicht freischaltet, wird bestätigt statt abgelehnt: eine
  // Fehlerantwort ließe Stripe endlos wiederholen.
  if (!ACTIVATING_EVENTS.has(eventType)) {
    return NextResponse.json({ received: true, ignored: eventType });
  }

  const reference = event.data?.object?.client_reference_id;
  if (typeof reference !== "string" || !UUID.test(reference)) {
    // Eine Zahlung ohne zuordenbares Konto ist nichts, was sich durch
    // Wiederholen löst — deshalb 200 und ein Protokolleintrag, damit sie von
    // Hand zugeordnet werden kann statt still zu verschwinden.
    logEvent("stripe_webhook_unassigned", { eventId, eventType });
    return NextResponse.json({ received: true, assigned: false });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    // 503 statt 200: hier hilft ein erneuter Zustellversuch tatsächlich.
    return NextResponse.json({ error: "Nicht verfügbar." }, { status: 503 });
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("activate_paid_plan", {
    p_event_id: eventId,
    p_event_type: eventType,
    p_user_id: reference,
    p_plan_id: CREDIT_PLANS.enterprise.id,
    p_plan_allowance: CREDIT_PLANS.enterprise.monthlyCredits,
  });

  if (error) {
    logEvent("stripe_webhook_activation_failed", { eventId });
    return NextResponse.json({ error: "Freischaltung fehlgeschlagen." }, { status: 503 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as { activated?: unknown } | null;
  const activated = row?.activated === true;
  logEvent("stripe_webhook_activated", {
    eventId,
    repeated: row?.activated === false,
  });

  // Nur beim ersten Mal. Stripe stellt dasselbe Ereignis mehrfach zu, und
  // `activate_paid_plan` meldet die Wiederholung mit `activated: false`. Eine
  // zweite Bestätigung zu demselben Vertrag wäre keine Dopplung, sondern die
  // Auskunft über einen Abschluss, den es nicht gegeben hat.
  if (activated) {
    await sendOrderConfirmation(admin, reference, eventId);
  }

  return NextResponse.json({ received: true, activated });
}
