import { CREDIT_PLANS, TRIAL_CREDITS, TRIAL_DAYS } from "@/lib/billing/plans";
import type { CheckoutPlanId } from "@/lib/billing/payment-links";

/**
 * „Basic buchen“ ohne Konto (Audit F03).
 *
 * Bisher landete ein Gast nach dem Klick auf der Preisseite in einem
 * allgemeinen Anmeldedialog: kein Tarif, kein Preis, kein Hinweis, dass es
 * danach zur Zahlung geht. Der Dialog nennt jetzt Tarif, Preis, Laufzeit und
 * den nächsten Schritt. Nach der Anmeldung (auch nach dem Bestätigungslink)
 * geht es über `/chat?checkout=<plan>` direkt zu Stripe weiter.
 */

export function checkoutPlanFrom(value: string | null): CheckoutPlanId | null {
  return value === "basic" || value === "pro" || value === "business" ? value : null;
}

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

export function checkoutSummary(planId: CheckoutPlanId) {
  const plan = CREDIT_PLANS[planId];
  return {
    label: plan.label,
    price: `${euro.format(plan.priceNetCents / 100).replace(",00", "")} netto pro Monat`,
    points: [
      `${TRIAL_DAYS} Tage kostenlos · ${TRIAL_CREDITS} Credits · Karte im nächsten Schritt bei Stripe.`,
      `Danach ${plan.euro} € netto pro Monat, zzgl. USt. Vor Ablauf kündbar.`,
    ],
  };
}

export function checkoutIntentCopy(planId: CheckoutPlanId) {
  const { label } = CREDIT_PLANS[planId];
  return {
    eyebrow: "14 Tage kostenlos testen",
    title: `${label} kostenlos testen`,
    loginTitle: `${label} kostenlos testen`,
    body: "Anmelden. Danach öffnen wir direkt den sicheren Stripe-Checkout.",
    afterConfirmation: "Danach geht es direkt zu Stripe.",
  };
}

/** Was der Anmeldedialog für einen Tarif zeigt; fertig berechnet, damit der Dialog die Tarifdaten nicht selbst lädt. */
export function checkoutDialogCopy(planId: CheckoutPlanId) {
  return { ...checkoutIntentCopy(planId), plan: checkoutSummary(planId) };
}

export type CheckoutDialogCopy = ReturnType<typeof checkoutDialogCopy>;
