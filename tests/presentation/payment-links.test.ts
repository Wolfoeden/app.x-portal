import { afterEach, describe, expect, it } from "vitest";

import {
  ENTERPRISE_CONTACT,
  FIXED_PLAN_PAYMENT_LINKS,
  fixedPlanCheckout,
  planForStripePaymentLink,
} from "@/lib/billing/payment-links";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_STRIPE_FIXED_PLANS_CHECKOUT_ENABLED;
  delete process.env.STRIPE_FIXED_PLANS_ACTIVATION_ENABLED;
  delete process.env.NEXT_PUBLIC_STRIPE_PRO_PAYMENT_LINK;
  delete process.env.STRIPE_PRO_PAYMENT_LINK_ID;
});

describe("new fixed-plan checkout", () => {
  it("keeps the three supplied links assigned to their exact plans", () => {
    expect(FIXED_PLAN_PAYMENT_LINKS).toEqual({
      basic: "https://buy.stripe.com/7sY3cu24xa5z7ey64Ya3u04",
      pro: "https://buy.stripe.com/3cIcN4fVnb9DcyS9haa3u05",
      business: "https://buy.stripe.com/9B614m38Bb9DbuO2SMa3u02",
    });
  });

  it("stays fail-closed when only a URL and id are configured", () => {
    process.env.NEXT_PUBLIC_STRIPE_PRO_PAYMENT_LINK = "https://buy.stripe.com/pro";
    process.env.STRIPE_PRO_PAYMENT_LINK_ID = "plink_pro";

    expect(fixedPlanCheckout("pro", null)).toBeNull();
    expect(planForStripePaymentLink("plink_pro")).toBeNull();
  });

  it("requires independent public and server activation switches", () => {
    process.env.NEXT_PUBLIC_STRIPE_PRO_PAYMENT_LINK = "https://buy.stripe.com/pro";
    process.env.STRIPE_PRO_PAYMENT_LINK_ID = "plink_pro";
    process.env.NEXT_PUBLIC_STRIPE_FIXED_PLANS_CHECKOUT_ENABLED = "true";
    process.env.STRIPE_FIXED_PLANS_ACTIVATION_ENABLED = "true";

    expect(fixedPlanCheckout("pro", null)).toBe("https://buy.stripe.com/pro");
    expect(planForStripePaymentLink("plink_pro")?.id).toBe("pro");
  });

  it("rejects hosts that merely end with the Stripe domain name", () => {
    process.env.NEXT_PUBLIC_STRIPE_PRO_PAYMENT_LINK =
      "https://attackerstripe.com/pro";
    process.env.NEXT_PUBLIC_STRIPE_FIXED_PLANS_CHECKOUT_ENABLED = "true";

    expect(fixedPlanCheckout("pro", null)).toBeNull();
  });
});

describe("enterprise contact", () => {
  it("names a person, an address and a number", () => {
    expect(ENTERPRISE_CONTACT.person).toBe("Roman Dering");
    expect(ENTERPRISE_CONTACT.email).toBe("roman@dering.info");
    // Die Telefonnummer wird als tel:-Link verwendet und muss dafür ohne
    // Leerzeichen vorliegen; angezeigt wird die lesbare Fassung.
    expect(ENTERPRISE_CONTACT.phone).toMatch(/^\+\d+$/u);
    expect(ENTERPRISE_CONTACT.phoneDisplay.replace(/\s/gu, "")).toBe(
      ENTERPRISE_CONTACT.phone,
    );
  });
});
