import "server-only";

import { writeAuditEvent } from "@/lib/audit/write";
import { logEvent } from "@/lib/security/request";

/**
 * Die zwei Stufen des Umsatztrichters, die nur der Server sieht.
 *
 * „Checkout gestartet“ zählt den Klick auf einen Tarif, „Abo bezahlt“ die
 * erste bezahlte Rechnung. Zusammen mit den Stufen aus dem Browser (Suche,
 * Ergebnis, Registrierung, Preisseite) zeigt die Nutzer-Ansicht im Admin, an
 * welcher Stelle Kunden verloren gehen.
 *
 * Ein Messpunkt darf den Weg zum Geld nie aufhalten: Fehler werden
 * protokolliert und verschluckt.
 */
export const BILLING_FUNNEL_ACTIONS = {
  checkoutStarted: "billing_checkout_started",
  subscriptionPaid: "billing_subscription_paid",
} as const;

/** Wohin der Klick auf einen Tarif geführt hat. */
export type CheckoutResult = "stripe" | "login_required" | "unavailable";

export async function recordCheckoutStarted(input: {
  userId: string | null;
  plan: string;
  result: CheckoutResult;
}): Promise<void> {
  try {
    await writeAuditEvent({
      actorUserId: input.userId,
      action: BILLING_FUNNEL_ACTIONS.checkoutStarted,
      targetType: "billing_checkout",
      outcome: "success",
      metadata: { plan: input.plan, result: input.result },
    });
  } catch {
    logEvent("billing_funnel_record_failed", { step: "checkout_started" });
  }
}

export async function recordSubscriptionPaid(input: {
  userId: string;
  plan: string;
  monthlyNetCents: number;
  firstPayment: boolean;
}): Promise<void> {
  try {
    await writeAuditEvent({
      actorUserId: input.userId,
      action: BILLING_FUNNEL_ACTIONS.subscriptionPaid,
      targetType: "billing_subscription",
      outcome: "success",
      metadata: {
        plan: input.plan,
        monthlyNetCents: input.monthlyNetCents,
        first: input.firstPayment,
      },
    });
  } catch {
    logEvent("billing_funnel_record_failed", { step: "subscription_paid" });
  }
}
