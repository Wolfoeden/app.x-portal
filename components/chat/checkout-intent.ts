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
const number = new Intl.NumberFormat("de-DE");

export function checkoutSummary(planId: CheckoutPlanId) {
  const plan = CREDIT_PLANS[planId];
  return {
    label: plan.label,
    price: `${euro.format(plan.priceNetCents / 100).replace(",00", "")} netto pro Monat`,
    points: [
      `${TRIAL_DAYS} Tage kostenlos, einmalig ${TRIAL_CREDITS} Credits insgesamt. Karte bei Stripe erforderlich.`,
      `Danach automatisch ${plan.euro} € netto im Monat, zzgl. USt., mit ${number.format(plan.monthlyCredits)} Credits je bestätigter bezahlter Periode.`,
      "Vor Trial-Ende selbstständig kündigen, um die erste kostenpflichtige Verlängerung zu vermeiden. Danach monatlich zum Periodenende kündbar.",
      "Kein zusätzliches Bonusguthaben, keine Trial-Auffüllung und keine vorzeitige Abbuchung bei Verbrauch. Kein erneuter Trial bei Tarifwechsel.",
      "Neue Kontaktanfragen und Beauftragungen sind provisionsfrei. Sie bezahlen die Software-Nutzung.",
    ],
  };
}

export function checkoutIntentCopy(planId: CheckoutPlanId) {
  const { label } = CREDIT_PLANS[planId];
  return {
    eyebrow: "14 Tage kostenlos testen",
    title: `Konto anlegen und ${label} testen`,
    loginTitle: `Anmelden und ${label} testen`,
    body: `Bestätigen Sie zuerst Ihre E-Mail. Danach hinterlegen Sie Ihre Karte bei Stripe und bestätigen den ${label}-Trial. Erst der serverseitig verifizierte Abschluss aktiviert die Testphase. Ihr Projekttext bleibt in diesem Browser erhalten.`,
    afterConfirmation: `Danach geht es zur Kartenhinterlegung für ${label}. Der Trial startet erst nach dem bestätigten Stripe-Abschluss.`,
  };
}

/** Was der Anmeldedialog für einen Tarif zeigt; fertig berechnet, damit der Dialog die Tarifdaten nicht selbst lädt. */
export function checkoutDialogCopy(planId: CheckoutPlanId) {
  return { ...checkoutIntentCopy(planId), plan: checkoutSummary(planId) };
}

export type CheckoutDialogCopy = ReturnType<typeof checkoutDialogCopy>;
