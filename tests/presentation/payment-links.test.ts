import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import {
  ENTERPRISE_CONTACT,
  FIXED_PLAN_PAYMENT_LINKS,
  customerPortalUrl,
  fixedPlanCheckout,
  planForStripePaymentLink,
  planForStripePriceId,
} from "@/lib/billing/payment-links";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_STRIPE_FIXED_PLANS_CHECKOUT_ENABLED;
  delete process.env.STRIPE_FIXED_PLANS_ACTIVATION_ENABLED;
  delete process.env.NEXT_PUBLIC_STRIPE_PRO_PAYMENT_LINK;
  delete process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL;
  delete process.env.STRIPE_PRO_PAYMENT_LINK_ID;
  delete process.env.STRIPE_PRO_PRICE_ID;
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
    process.env.STRIPE_PRO_PRICE_ID = "price_pro";
    process.env.NEXT_PUBLIC_STRIPE_FIXED_PLANS_CHECKOUT_ENABLED = "true";
    process.env.STRIPE_FIXED_PLANS_ACTIVATION_ENABLED = "true";

    expect(fixedPlanCheckout("pro", null)).toBe("https://buy.stripe.com/pro");
    expect(fixedPlanCheckout("pro", "account-1")).toBe(
      "https://buy.stripe.com/pro?client_reference_id=account-1",
    );
    expect(planForStripePaymentLink("plink_pro")?.id).toBe("pro");
    expect(planForStripePriceId("price_pro")?.id).toBe("pro");
  });

  it("accepts only Stripe's hosted customer portal", () => {
    process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL =
      "https://billing.stripe.com/p/login/test_123";
    expect(customerPortalUrl()).toBe(
      "https://billing.stripe.com/p/login/test_123",
    );

    process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL =
      "https://billing.stripe.com.attacker.example/p/login/test_123";
    expect(customerPortalUrl()).toBeNull();
  });

  it("rejects hosts that merely end with the Stripe domain name", () => {
    process.env.NEXT_PUBLIC_STRIPE_PRO_PAYMENT_LINK =
      "https://attackerstripe.com/pro";
    process.env.NEXT_PUBLIC_STRIPE_FIXED_PLANS_CHECKOUT_ENABLED = "true";

    expect(fixedPlanCheckout("pro", null)).toBeNull();
  });
});

describe("enterprise contact", () => {
  it("routes both enterprise buttons through one address", () => {
    expect(ENTERPRISE_CONTACT.email).toMatch(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/u);
    for (const file of ["app/(marketing)/preise/page.tsx", "components/chat/account.tsx"]) {
      const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
      expect(source).toContain("ENTERPRISE_CONTACT.email");
      expect(source).not.toMatch(/mailto:[a-z]/u);
    }
  });
});
