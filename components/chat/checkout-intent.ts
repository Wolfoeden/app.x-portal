import { CREDIT_PLANS } from "@/lib/billing/plans";
import { placementRequestsEnabled } from "@/lib/placement/config";
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
const number = new Intl.NumberFormat("de-DE");

export function checkoutSummary(planId: CheckoutPlanId) {
  const plan = CREDIT_PLANS[planId];
  return {
    label: plan.label,
    price: `${euro.format(plan.priceNetCents / 100).replace(",00", "")} netto pro Monat`,
    points: [
      `${number.format(plan.monthlyCredits)} Credits pro Monat; nicht genutzte verfallen am Monatsende.`,
      "Läuft einen Monat und verlängert sich jeweils um einen Monat. Kündbar zum Ende des laufenden Monats.",
      "Zuzüglich Umsatzsteuer. Bei Stripe sehen Sie den Gesamtbetrag, bevor Sie zahlen.",
      ...(placementRequestsEnabled()
        ? ["Ein Vermittlungshonorar bei einer Beauftragung über XPORTAL ist davon getrennt."]
        : []),
    ],
  };
}

export function checkoutIntentCopy(planId: CheckoutPlanId) {
  const { label } = CREDIT_PLANS[planId];
  return {
    eyebrow: "Tarif buchen",
    title: `Konto anlegen und ${label} buchen`,
    loginTitle: `Anmelden und ${label} buchen`,
    body: `Für einen Tarif brauchen Sie ein Konto. Danach geht es direkt zur Zahlung bei Stripe; gebucht ist ${label} erst dort.`,
    afterConfirmation: `Danach geht es direkt zur Zahlung für ${label}.`,
  };
}

/** Was der Anmeldedialog für einen Tarif zeigt; fertig berechnet, damit der Dialog die Tarifdaten nicht selbst lädt. */
export function checkoutDialogCopy(planId: CheckoutPlanId) {
  return { ...checkoutIntentCopy(planId), plan: checkoutSummary(planId) };
}

export type CheckoutDialogCopy = ReturnType<typeof checkoutDialogCopy>;
