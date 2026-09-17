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

const VERIFIED_PRICE_IDS = {
  basic: "price_1UGQfrCQxgmYRfmL7z6DURBe",
  pro: "price_1UGQgTCQxgmYRfmLkAttXxUC",
  business: "price_1UBAVPCQxgmYRfmLM6WX4Dax",
} as const;

export const ENTERPRISE_START_EURO = CREDIT_PLANS.enterprise_legacy.euro;
export const ENTERPRISE_BILLING = {
  model: "fixed_monthly",
  priceNetEuro: CREDIT_PLANS.enterprise_legacy.euro,
  interval: "month",
  invoice: "Stripe-Zahlungsbeleg und XPORTAL-Vertragsbestätigung",
} as const;

/** The address behind "Enterprise per E-Mail anfragen"; shown publicly on /preise. */
export const ENTERPRISE_CONTACT = {
  email: "roman@dering.info",
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

function configuredPublicUrl(planId: CheckoutPlanId): string | null {
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

/** Stripe's no-code portal keeps invoices and payment methods out of XPORTAL. */
export function customerPortalUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname.toLowerCase() === "billing.stripe.com" &&
      url.pathname.startsWith("/p/login/")
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function checkoutConfigured(planId: CreditPlanId): boolean {
  return planId === "basic" || planId === "pro" || planId === "business"
    ? configuredPublicUrl(planId) !== null
    : false;
}
