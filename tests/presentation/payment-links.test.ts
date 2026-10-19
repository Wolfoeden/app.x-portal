import { afterEach, describe, expect, it } from "vitest";

import { planForStripePaymentLink, planForStripePriceId } from "@/lib/billing/payment-links";

afterEach(() => {
  delete process.env.STRIPE_PRO_PAYMENT_LINK_ID;
  delete process.env.STRIPE_PRO_PRICE_ID;
});

describe("Stripe-Zahlungen den Tarifen zuordnen", () => {
  it("kennt die verifizierten Produktions-IDs ohne Umgebungsvariablen", () => {
    expect(planForStripePaymentLink("plink_1UG3wWCQxgmYRfmLPI05Uc7q")?.id).toBe("pro");
    expect(planForStripePriceId("price_1UGQgTCQxgmYRfmLkAttXxUC")?.id).toBe("pro");
  });

  it("nimmt ausdrücklich gesetzte IDs", () => {
    process.env.STRIPE_PRO_PAYMENT_LINK_ID = "plink_pro";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro";

    expect(planForStripePaymentLink("plink_pro")?.id).toBe("pro");
    expect(planForStripePriceId("price_pro")?.id).toBe("pro");
  });

  it("ordnet Unbekanntes keinem Tarif zu", () => {
    expect(planForStripePaymentLink("plink_unbekannt")).toBeNull();
    expect(planForStripePriceId("")).toBeNull();
    expect(planForStripePriceId(42)).toBeNull();
  });
});
