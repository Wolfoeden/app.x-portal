import {
  CREDIT_PLANS,
  type CreditPlanId,
  type FixedMonthlyPlan,
} from "@/lib/billing/plans";

export const FIXED_PLAN_PAYMENT_LINKS = {
  basic: "https://buy.stripe.com/7sY3cu24xa5z7ey64Ya3u04",
  pro: "https://buy.stripe.com/3cIcN4fVnb9DcyS9haa3u05",
  business: "https://buy.stripe.com/9B614m38Bb9DbuO2SMa3u02",
} as const;

const VERIFIED_PAYMENT_LINK_IDS = {
  basic: "plink_1UG3v2CQxgmYRfmL4ktH8PYg",
  pro: "plink_1UG3wWCQxgmYRfmLPI05Uc7q",
  business: "plink_1UBAWJCQxgmYRfmLtce10O55",
} as const;

export const ENTERPRISE_START_EURO = CREDIT_PLANS.enterprise_legacy.euro;
export const ENTERPRISE_BILLING = {
  model: "fixed_monthly",
  priceNetEuro: CREDIT_PLANS.enterprise_legacy.euro,
  interval: "month",
  invoice: "Stripe-Zahlungsbeleg und XPORTAL-Vertragsbestätigung",
} as const;

export const ENTERPRISE_CONTACT = {
  email: "roman@dering.info",
  phone: "+491758934338",
  phoneDisplay: "+49 175 8934338",
  person: "Roman Dering",
} as const;

type CheckoutPlanId = "basic" | "pro" | "business";

const PAYMENT_LINK_ID_ENV: Record<CheckoutPlanId, string> = {
  basic: "STRIPE_BASIC_PAYMENT_LINK_ID",
  pro: "STRIPE_PRO_PAYMENT_LINK_ID",
  business: "STRIPE_BUSINESS_PAYMENT_LINK_ID",
};

function configuredPublicUrl(planId: CheckoutPlanId): string | null {
  if (process.env.NEXT_PUBLIC_STRIPE_FIXED_PLANS_CHECKOUT_ENABLED !== "true") {
    return null;
  }
  // Direct property access is required so Next.js can inline NEXT_PUBLIC
  // values in the account client component.
  const value = (planId === "basic"
    ? process.env.NEXT_PUBLIC_STRIPE_BASIC_PAYMENT_LINK
    : planId === "pro"
      ? process.env.NEXT_PUBLIC_STRIPE_PRO_PAYMENT_LINK
      : process.env.NEXT_PUBLIC_STRIPE_BUSINESS_PAYMENT_LINK
  )?.trim() || FIXED_PLAN_PAYMENT_LINKS[planId];
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.toLowerCase() === "buy.stripe.com"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function fixedPlanCheckout(
  planId: CheckoutPlanId,
  customerReference: string | null,
): string | null {
  const configured = configuredPublicUrl(planId);
  if (!configured) return null;
  if (!customerReference?.trim() || !/^[\w-]{1,200}$/u.test(customerReference)) {
    return configured;
  }
  const url = new URL(configured);
  url.searchParams.set("client_reference_id", customerReference.trim());
  return url.toString();
}

/** Server-side allow-list: a Stripe session activates only its configured plan. */
export function planForStripePaymentLink(
  paymentLinkId: unknown,
): FixedMonthlyPlan | null {
  if (process.env.STRIPE_FIXED_PLANS_ACTIVATION_ENABLED !== "true") return null;
  if (typeof paymentLinkId !== "string" || !paymentLinkId.trim()) return null;
  for (const planId of Object.keys(PAYMENT_LINK_ID_ENV) as CheckoutPlanId[]) {
    const configuredId = process.env[PAYMENT_LINK_ID_ENV[planId]]?.trim() || VERIFIED_PAYMENT_LINK_IDS[planId];
    if (configuredId === paymentLinkId) {
      return CREDIT_PLANS[planId];
    }
  }
  return null;
}

export function checkoutConfigured(planId: CreditPlanId): boolean {
  return planId === "basic" || planId === "pro" || planId === "business"
    ? configuredPublicUrl(planId) !== null
    : false;
}
