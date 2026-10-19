import { CREDIT_PLANS, type FixedMonthlyPlan } from "@/lib/billing/plans";

/**
 * Welche Stripe-Zahlung zu welchem Tarif gehört, für den Webhook.
 *
 * Bestellt wird seit Oktober 2026 über Checkout Sessions
 * (`/api/billing/checkout`); die früheren öffentlichen Zahlungslinks, das
 * Kundenportal per Link und die Enterprise-Konstanten sind seit 19.10.2026
 * entfernt. Die Zuordnung bleibt, damit Zahlungen über die alten Links und
 * Verlängerungen weiter den richtigen Tarif erhalten.
 */

const VERIFIED_PAYMENT_LINK_IDS = {
  basic: "plink_1UG3v2CQxgmYRfmL4ktH8PYg",
  pro: "plink_1UG3wWCQxgmYRfmLPI05Uc7q",
  business: "plink_1UBAWJCQxgmYRfmLtce10O55",
} as const;

export const VERIFIED_PRICE_IDS = {
  basic: "price_1UGQfrCQxgmYRfmL7z6DURBe",
  pro: "price_1UGQgTCQxgmYRfmLkAttXxUC",
  business: "price_1UBAVPCQxgmYRfmLM6WX4Dax",
} as const;

export type CheckoutPlanId = "basic" | "pro" | "business";

const PAYMENT_LINK_ID_ENV: Record<CheckoutPlanId, string> = {
  basic: "STRIPE_BASIC_PAYMENT_LINK_ID",
  pro: "STRIPE_PRO_PAYMENT_LINK_ID",
  business: "STRIPE_BUSINESS_PAYMENT_LINK_ID",
};

const PRICE_ID_ENV: Record<CheckoutPlanId, string> = {
  basic: "STRIPE_BASIC_PRICE_ID",
  pro: "STRIPE_PRO_PRICE_ID",
  business: "STRIPE_BUSINESS_PRICE_ID",
};

/** Server-side allow-list: a Stripe session activates only its configured plan. */
export function planForStripePaymentLink(
  paymentLinkId: unknown,
): FixedMonthlyPlan | null {
  if (typeof paymentLinkId !== "string" || !paymentLinkId.trim()) return null;
  for (const planId of Object.keys(PAYMENT_LINK_ID_ENV) as CheckoutPlanId[]) {
    const configuredId = process.env[PAYMENT_LINK_ID_ENV[planId]]?.trim() || VERIFIED_PAYMENT_LINK_IDS[planId];
    if (configuredId === paymentLinkId) {
      return CREDIT_PLANS[planId];
    }
  }
  return null;
}

/** A renewal invoice is trusted only when its recurring Price is configured. */
export function planForStripePriceId(priceId: unknown): FixedMonthlyPlan | null {
  if (typeof priceId !== "string" || !priceId.trim()) return null;
  for (const planId of Object.keys(PRICE_ID_ENV) as CheckoutPlanId[]) {
    const configuredId = process.env[PRICE_ID_ENV[planId]]?.trim() || VERIFIED_PRICE_IDS[planId];
    if (configuredId === priceId) {
      return CREDIT_PLANS[planId];
    }
  }
  return null;
}
