import { describe, expect, it } from "vitest";

import { CREDIT_PLANS } from "@/lib/ai/credit-policy";
import { orderConfirmationMessage } from "@/lib/billing/order-confirmation";
import { ENTERPRISE_START_EURO } from "@/lib/billing/payment-links";
import {
  BUSINESS_ONLY_NOTICE,
  IMPRINT_EMAIL,
  TERMS_EFFECTIVE_DATE,
  TERMS_VERSION,
} from "@/lib/legal/policy";

/**
 * `docs/checkout-compliance.md` verlangt nach Abschluss unverzüglich eine
 * Bestätigung in Textform mit fünf Angaben. Jede steht hier als eigener Test:
 * Fällt eine später aus der Vorlage, soll nicht ein Test durchfallen, der
 * "die Bestätigung ist vollständig" heißt, sondern der, der die fehlende
 * Angabe benennt.
 */
describe("Vertragsbestätigung in Textform", () => {
  const message = orderConfirmationMessage();

  it("benennt die Leistung", () => {
    expect(message.text).toContain(CREDIT_PLANS.enterprise.label);
    expect(message.text).toContain("3.000 Credits");
  });

  it("benennt den Preis netto und den Steuerhinweis", () => {
    // XPORTAL richtet sich ausschließlich an Unternehmer, deshalb ist die
    // Nettoangabe zulässig — aber nur zusammen mit dem Hinweis.
    expect(message.text).toContain("1,00");
    expect(message.text).toContain("Umsatzsteuer");
    expect(ENTERPRISE_START_EURO).toBe(1);
  });

  it("benennt die Laufzeit und ihre Verlängerung", () => {
    expect(message.text).toContain("einen Monat");
    expect(message.text).toContain("verlängert sich");
  });

  it("benennt einen Kündigungsweg, den es wirklich gibt", () => {
    expect(message.text).toContain(IMPRINT_EMAIL);
    expect(message.text).toContain("https://x-portal.eu/contact");
  });

  it("benennt die angewendete AGB-Fassung mit Stand und Fundstelle", () => {
    expect(message.text).toContain(TERMS_VERSION);
    expect(message.text).toContain(TERMS_EFFECTIVE_DATE);
    expect(message.text).toContain("https://x-portal.eu/terms");
  });

  it("wiederholt die Beschränkung auf Unternehmer", () => {
    expect(message.text).toContain(BUSINESS_ONLY_NOTICE);
  });

  /**
   * Die Rechnung ist ein eigener Weg mit eigener Aufbewahrung — zehn Jahre
   * nach § 147 AO. Gäbe die Bestätigung sich als Rechnung aus, fehlten ihr
   * die Pflichtangaben nach § 14 UStG.
   */
  it("gibt sich nicht als Rechnung aus, sondern kündigt eine an", () => {
    expect(message.subject).not.toMatch(/rechnung/iu);
    expect(message.text).toContain("erhalten Sie eine Rechnung");
  });
});
