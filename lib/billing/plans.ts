/**
 * Commercial plan catalogue.
 *
 * Every customer-facing price and allowance is derived from this module.
 * Database migrations repeat the values only as immutable migration history;
 * UI, checkout, e-mail and quota code must import them from here.
 */

type PlanBase = {
  id: string;
  label: string;
  public: boolean;
  recommended: boolean;
};

export type OneTimeCreditPlan = PlanBase & {
  billingModel: "one_time";
  grantCredits: number;
  monthlyCredits: 0;
  priceNetCents: 0;
  purchasable: false;
  euro: 0;
};

export type FixedMonthlyPlan = PlanBase & {
  billingModel: "fixed_monthly";
  monthlyCredits: number;
  priceNetCents: number;
  purchasable: true;
  euro: number;
};

export type MeteredPlan = PlanBase & {
  billingModel: "metered";
  monthlyCredits: 0;
  monthlyBaseFeeCents: 0;
  euroPerCreditCents: number;
  priceNetCents: 0;
  purchasable: false;
  euro: 0;
};

export type CreditPlan = OneTimeCreditPlan | FixedMonthlyPlan | MeteredPlan;

export const TRIAL_DAYS = 14;
export const TRIAL_CREDITS = 90;

export const CREDIT_PLANS = {
  /**
   * Das Startguthaben ist so bemessen, dass es zum Ausprobieren reicht und
   * die Bezahlschranke erreichbar bleibt. Bis zum 28.09.2026 lagen Gäste bei
   * 100 und Konten bei 300 Credits: Neun von zehn Gästen verbrauchten höchstens
   * 26, und kein Konto hat sein Guthaben je aufgebraucht — der Weg zu einem
   * Tarif kam damit nie in Sicht. Bestehende Konten behalten ihr Guthaben;
   * die Werte gelten für neu angelegte Zugänge.
   */
  guest: {
    id: "guest",
    label: "Gastzugang",
    billingModel: "one_time",
    grantCredits: 0,
    monthlyCredits: 0,
    priceNetCents: 0,
    purchasable: false,
    euro: 0,
    public: false,
    recommended: false,
  },
  trial: {
    id: "trial",
    label: "Testphase mit Karte",
    billingModel: "one_time",
    grantCredits: TRIAL_CREDITS,
    monthlyCredits: 0,
    priceNetCents: 0,
    purchasable: false,
    euro: 0,
    public: false,
    recommended: false,
  },
  starter: {
    id: "starter",
    label: "Kostenlos",
    billingModel: "one_time",
    grantCredits: 9,
    monthlyCredits: 0,
    priceNetCents: 0,
    purchasable: false,
    euro: 0,
    public: true,
    recommended: false,
  },
  basic: {
    id: "basic",
    label: "Basic",
    billingModel: "fixed_monthly",
    monthlyCredits: 500,
    priceNetCents: 900,
    purchasable: true,
    euro: 9,
    public: true,
    recommended: false,
  },
  pro: {
    id: "pro",
    label: "Pro",
    billingModel: "fixed_monthly",
    monthlyCredits: 1_250,
    priceNetCents: 1_900,
    purchasable: true,
    euro: 19,
    public: true,
    recommended: true,
  },
  business: {
    id: "business",
    label: "Business",
    billingModel: "fixed_monthly",
    monthlyCredits: 4_000,
    priceNetCents: 5_000,
    purchasable: true,
    euro: 50,
    public: true,
    recommended: false,
  },
  enterprise_flex: {
    id: "enterprise_flex",
    label: "Enterprise",
    billingModel: "metered",
    monthlyCredits: 0,
    monthlyBaseFeeCents: 0,
    euroPerCreditCents: 2,
    priceNetCents: 0,
    purchasable: false,
    euro: 0,
    public: true,
    recommended: false,
  },
  /** Existing 50 EUR / 3,000-credit contracts. Never reinterpret as Flex. */
  enterprise_legacy: {
    id: "enterprise_legacy",
    label: "Enterprise (Bestand)",
    billingModel: "fixed_monthly",
    monthlyCredits: 3_000,
    priceNetCents: 5_000,
    purchasable: true,
    euro: 50,
    public: false,
    recommended: false,
  },
  /** Read compatibility until every old row has crossed the migration. */
  free: {
    id: "free",
    label: "Startguthaben (Bestand)",
    billingModel: "one_time",
    grantCredits: 300,
    monthlyCredits: 0,
    priceNetCents: 0,
    purchasable: false,
    euro: 0,
    public: false,
    recommended: false,
  },
  /** Read compatibility for pre-migration fixed Enterprise rows. */
  enterprise: {
    id: "enterprise",
    label: "Enterprise (Bestand)",
    billingModel: "fixed_monthly",
    monthlyCredits: 3_000,
    priceNetCents: 5_000,
    purchasable: true,
    euro: 50,
    public: false,
    recommended: false,
  },
} as const satisfies Record<string, CreditPlan>;

export type CreditPlanId = keyof typeof CREDIT_PLANS;

export const PUBLIC_PRICING_PLANS = [
  CREDIT_PLANS.starter,
  CREDIT_PLANS.basic,
  CREDIT_PLANS.pro,
  CREDIT_PLANS.business,
  CREDIT_PLANS.enterprise_flex,
] as const;

/** Three project analyses at three credits each, once per confirmed account. */
export const START_CREDITS = CREDIT_PLANS.starter.grantCredits;
export const GUEST_TRIAL_CREDITS = CREDIT_PLANS.guest.grantCredits;

export function isCreditPlanId(value: unknown): value is CreditPlanId {
  return typeof value === "string" && value in CREDIT_PLANS;
}

export function creditPlan(
  planId: string | null | undefined,
  isAnonymous = false,
): (typeof CREDIT_PLANS)[CreditPlanId] {
  if (isCreditPlanId(planId)) return CREDIT_PLANS[planId];
  return isAnonymous ? CREDIT_PLANS.guest : CREDIT_PLANS.starter;
}

export function effectiveCreditPriceCents(plan: FixedMonthlyPlan): number {
  return plan.priceNetCents / plan.monthlyCredits;
}

export function meteredNetCents(credits: number): number {
  if (!Number.isSafeInteger(credits) || credits < 0) {
    throw new RangeError("credits must be a non-negative safe integer");
  }
  return credits * CREDIT_PLANS.enterprise_flex.euroPerCreditCents;
}
