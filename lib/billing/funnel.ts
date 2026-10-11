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
  trialStarted: "billing_trial_started",
  subscriptionPaid: "billing_subscription_paid",
} as const;

/** Wohin der Klick auf einen Tarif geführt hat. */
export type CheckoutResult = "stripe" | "login_required" | "unavailable";

export async function recordCheckoutStarted(input: {
  userId: string | null;
  plan: string;
  result: CheckoutResult;
  /** Bei „unavailable“: Fehlercode, nie eine Meldung (Stripe nennt darin Teile des Schlüssels). */
  reason?: string;
}): Promise<void> {
  try {
    await writeAuditEvent({
      actorUserId: input.userId,
      action: BILLING_FUNNEL_ACTIONS.checkoutStarted,
      targetType: "billing_checkout",
      outcome: input.result === "unavailable" ? "failed" : "success",
      metadata: { plan: input.plan, result: input.result, ...(input.reason ? { reason: input.reason } : {}) },
    });
  } catch {
    logEvent("billing_funnel_record_failed", { step: "checkout_started" });
  }
}

/**
 * Der Trial ist die Stufe zwischen Checkout und erster Zahlung. Er gehört wie
 * die Zahlung zur Vertragsabwicklung und wird deshalb unabhängig von der
 * Cookie-Einwilligung im Protokoll vermerkt, einmal je Konto.
 */
export async function recordTrialStarted(input: {
  userId: string;
  plan: string;
  via: "stripe" | "voucher";
}): Promise<void> {
  try {
    await writeAuditEvent({
      actorUserId: input.userId,
      action: BILLING_FUNNEL_ACTIONS.trialStarted,
      targetType: "billing_subscription",
      outcome: "success",
      metadata: { plan: input.plan, via: input.via },
    });
  } catch {
    logEvent("billing_funnel_record_failed", { step: "trial_started" });
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
