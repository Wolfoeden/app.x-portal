import { describe, expect, it } from "vitest";

import {
  ENTERPRISE_CONTACT,
  ENTERPRISE_PAYMENT_LINK,
  enterprisePaymentLink,
} from "@/lib/billing/payment-links";

describe("enterprise payment link", () => {
  /**
   * Ohne Kennung kommt bei Stripe eine Zahlung an, die sich keinem Konto
   * zuordnen laesst. Ueber die E-Mail zu gehen ist unzuverlaessig: bei Stripe
   * zahlt oft die Buchhaltung, nicht die Person mit dem Konto.
   */
  it("carries the account id so a payment can be matched", () => {
    const url = new URL(enterprisePaymentLink("a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d"));

    expect(url.origin + url.pathname).toBe(ENTERPRISE_PAYMENT_LINK);
    expect(url.searchParams.get("client_reference_id")).toBe(
      "a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    );
  });

  it("still links to Stripe when no account is known", () => {
    expect(enterprisePaymentLink(null)).toBe(ENTERPRISE_PAYMENT_LINK);
    expect(enterprisePaymentLink("   ")).toBe(ENTERPRISE_PAYMENT_LINK);
  });

  // Eine Kennung, die Stripe nicht annimmt, wird weggelassen statt
  // verstuemmelt uebertragen — sonst zeigt sie spaeter auf nichts.
  it("drops a reference Stripe would not accept", () => {
    for (const bad of ["hat leerzeichen", "kaputt/slash", "ümlaut", "a".repeat(201)]) {
      expect(enterprisePaymentLink(bad)).toBe(ENTERPRISE_PAYMENT_LINK);
    }
  });

  it("keeps the link itself untouched", () => {
    expect(ENTERPRISE_PAYMENT_LINK.startsWith("https://buy.stripe.com/")).toBe(true);
  });
});

describe("enterprise contact", () => {
  it("names a person, an address and a number", () => {
    expect(ENTERPRISE_CONTACT.person).toBe("Roman Dering");
    expect(ENTERPRISE_CONTACT.email).toBe("info@x-portal.eu");
    // Die Telefonnummer wird als tel:-Link verwendet und muss dafür ohne
    // Leerzeichen vorliegen; angezeigt wird die lesbare Fassung.
    expect(ENTERPRISE_CONTACT.phone).toMatch(/^\+\d+$/u);
    expect(ENTERPRISE_CONTACT.phoneDisplay.replace(/\s/gu, "")).toBe(
      ENTERPRISE_CONTACT.phone,
    );
  });
});
