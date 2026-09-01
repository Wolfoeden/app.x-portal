import { NextResponse } from "next/server";

import { CREDIT_PLANS } from "@/lib/ai/credit-policy";
import { verifyStripeSignature } from "@/lib/billing/stripe-signature";
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
  logEvent("stripe_webhook_activated", {
    eventId,
    repeated: row?.activated === false,
  });

  return NextResponse.json({ received: true, activated: row?.activated === true });
}
