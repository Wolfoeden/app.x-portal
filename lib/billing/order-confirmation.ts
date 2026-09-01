import { CREDIT_PLANS } from "@/lib/ai/credit-policy";
import { ENTERPRISE_START_EURO } from "@/lib/billing/payment-links";
import {
  BUSINESS_ONLY_NOTICE,
  IMPRINT_EMAIL,
  TERMS_EFFECTIVE_DATE,
  TERMS_VERSION,
} from "@/lib/legal/policy";

/**
 * Die Vertragsbestätigung in Textform.
 *
 * `docs/checkout-compliance.md` verlangt nach Abschluss unverzüglich eine
 * Bestätigung mit fünf Angaben: Leistungsbeschreibung, Preis, Laufzeit,
 * Kündigungsmöglichkeit und der angewendeten AGB-Fassung. Sie stehen hier
 * beieinander und nicht verteilt in der Route, damit der Test sie einzeln
 * nachweisen kann — eine Bestätigung, der eine der fünf fehlt, erfüllt ihren
 * Zweck nicht.
 *
 * Die Zahlen kommen aus derselben Quelle, aus der die Kontoübersicht sie
 * nimmt, und die AGB-Fassung aus derselben, die die AGB-Seite anzeigt. Eine
 * Bestätigung, die einen anderen Preis oder eine andere Fassung nennt als das,
 * was der Kunde beim Bestellen gesehen hat, wäre schlechter als keine.
 *
 * **Das ist nicht die Rechnung.** Die unterliegt § 14 UStG und einer
 * Aufbewahrung von zehn Jahren nach § 147 AO und läuft über einen eigenen Weg.
 */

const euroFormat = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

const creditFormat = new Intl.NumberFormat("de-DE");

export function orderConfirmationMessage(): {
  subject: string;
  text: string;
} {
  const plan = CREDIT_PLANS.enterprise;

  return {
    subject: "Ihre Bestellung bei XPORTAL — Bestätigung in Textform",
    text: [
      "Guten Tag,",
      "",
      "vielen Dank für Ihre Bestellung. Hiermit bestätigen wir den Vertrag in",
      "Textform. Ihr Konto ist freigeschaltet.",
      "",
      "LEISTUNG",
      `XPORTAL ${plan.label} — ${creditFormat.format(plan.monthlyCredits)} Credits monatlich.`,
      "Voller Zugang zur Freelancer-Suche, Websuche nach externen Profilen,",
      "KI-Agenten für Recherche und Planung. Teammitglieder teilen sich das",
      "Guthaben.",
      "",
      "PREIS",
      `${euroFormat.format(ENTERPRISE_START_EURO)} zum Start, zuzüglich der gesetzlichen Umsatzsteuer.`,
      "Die tatsächliche Nutzung wird zum Monatsende abgerechnet. Über",
      "abgerechnete Leistungen erhalten Sie eine Rechnung mit den Pflichtangaben",
      "nach § 14 UStG.",
      "",
      "LAUFZEIT",
      "Der Plan läuft einen Monat und verlängert sich um jeweils einen weiteren",
      "Monat, wenn er nicht bis zum Ende der laufenden Periode gekündigt wird.",
      "",
      "KÜNDIGUNG",
      "In Textform und formlos — eine E-Mail an " + IMPRINT_EMAIL + " genügt,",
      "ebenso das Kontaktformular unter https://x-portal.eu/contact.",
      "",
      "GRUNDLAGE",
      `Es gelten die Allgemeinen Geschäftsbedingungen in der Fassung ${TERMS_VERSION}`,
      `(Stand: ${TERMS_EFFECTIVE_DATE}), abrufbar unter https://x-portal.eu/terms.`,
      BUSINESS_ONLY_NOTICE,
      "",
      "Bei Fragen zur Abrechnung antworten Sie einfach auf diese Nachricht.",
      "",
      "300 – Inhaber Roman Dering, Heilig-Kreuz-Straße 18, 87600 Kaufbeuren",
      `${IMPRINT_EMAIL} · https://x-portal.eu/imprint`,
    ].join("\n"),
  };
}
