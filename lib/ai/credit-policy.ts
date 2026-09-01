import {
  normalizeAiTokenUsage,
  resolveMeteredModel,
  type AiModelIdentity,
  type AiTokenUsage,
} from "@/lib/ai/model-pricing";

/**
 * Token-weighted metering for the customer-facing AI balance. Every chat
 * request is charged from this policy against `user_ai_credit_accounts`.
 *
 * The separate `product_credit_accounts` ledger keeps its own pricing for
 * external freelancer research, which is expected to move to a different
 * model, and is deliberately not derived from this policy.
 */
export type AiCreditPolicy = {
  version: string;
  unitLabel: "XPORTAL_AI_CREDIT";
  weightedUnitsPerCredit: number;
  tokenWeights: {
    uncachedInput: number;
    cachedInput: number;
    output: number;
  };
  defaultPurposeMultiplierBasisPoints: number;
  purposeMultiplierBasisPoints: Readonly<Record<string, number>>;
  defaultModelMultiplierBasisPoints: number;
  modelMultiplierBasisPoints: Readonly<Record<string, number>>;
  /**
   * Purposes sold at a fixed price. A purpose listed here ignores the token
   * weighting entirely: a two-line brief and a two-page one cost the same.
   * The weighted units are still computed and reported, so a settlement stays
   * auditable against the metering the flat price replaced.
   */
  flatPriceCredits: Readonly<Record<string, number>>;
};

export const XPORTAL_AI_CREDIT_POLICY_VERSION =
  "xportal-ai-credits-2026-08-26-v5";

/**
 * What one normal search costs. A flat price, not a measurement: the customer
 * is told "3 Credits" before pressing send, and that has to stay true whether
 * the brief is one line or twenty.
 *
 * Token metering priced the same request between 18 and 21 credits and made
 * the remaining balance impossible to predict. The provider cost of a brief is
 * around 0.0007 USD, so a flat price carries the spread comfortably; the
 * per-request provider cost is still recorded in full on the admin side.
 */
export const BRIEF_ANALYSIS_CREDITS = 3;

/**
 * Die Stufen. Jede Stufe ist ein monatliches Kontingent, das sich zum
 * Monatswechsel wieder auffüllt — auch die gekaufte. Ein Plan hebt also die
 * wiederkehrende Zahl, er legt kein zweites Guthaben daneben.
 *
 * `agents` ist die einzige Fähigkeit, die nicht am Guthaben hängt: ein Gast
 * bekommt die Standardanalyse, aber keine Agenten. Damit ist die Anmeldung
 * nicht nur eine größere Zahl, sondern ein anderer Funktionsumfang.
 *
 * Sie stehen hier statt in lib/ai/quota.ts, weil die Oberfläche sie nennt und
 * quota.ts server-only ist.
 */
export const CREDIT_PLANS = {
  guest: {
    id: "guest",
    label: "Gast",
    monthlyCredits: 100,
    agents: false,
    purchasable: false,
    euro: 0,
  },
  free: {
    id: "free",
    label: "Free",
    monthlyCredits: 300,
    agents: true,
    purchasable: false,
    euro: 0,
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    monthlyCredits: 3_000,
    agents: true,
    purchasable: true,
    euro: 25,
  },
} as const;

export type CreditPlanId = keyof typeof CREDIT_PLANS;
export type CreditPlan = (typeof CREDIT_PLANS)[CreditPlanId];

export function isCreditPlanId(value: unknown): value is CreditPlanId {
  return typeof value === "string" && value in CREDIT_PLANS;
}

/** Fällt auf die Gratisstufe zurück, statt an einem unbekannten Wert zu scheitern. */
export function creditPlan(
  planId: string | null | undefined,
  isAnonymous = false,
): CreditPlan {
  if (isCreditPlanId(planId)) return CREDIT_PLANS[planId];
  return isAnonymous ? CREDIT_PLANS.guest : CREDIT_PLANS.free;
}

export const GUEST_MONTHLY_CREDITS = CREDIT_PLANS.guest.monthlyCredits;
export const ACCOUNT_MONTHLY_CREDITS = CREDIT_PLANS.free.monthlyCredits;

/**
 * Token weights:
 * - cached input: 1 weighted unit / token
 * - uncached input: 10 weighted units / token
 * - output: 60 weighted units / token
 * - one credit covers 1,000 weighted units, rounded half-up
 *
 * Calibrated on 30 confirmed `project_brief` settlements measured on
 * 2026-08-20/21 (gpt-5.4-nano): input is near-constant at ~928 tokens because
 * the system prompt dominates, output varies between 93 and 407.
 *
 * `project_brief` no longer meters at all — it is sold at the flat
 * BRIEF_ANALYSIS_CREDITS price. Its multiplier is kept at 1.0x so that a
 * settlement recorded under this version can still be compared against what
 * the metering would have charged.
 *
 * `research` stays at 0.1x. External freelancer search is billed from the
 * separate product-credit ledger under its own pricing.
 *
 * The weights are centrally versioned product policy. Allocation totals are a
 * separate business decision and live in lib/ai/quota.ts.
 */
export const XPORTAL_AI_CREDIT_POLICY = {
  version: XPORTAL_AI_CREDIT_POLICY_VERSION,
  unitLabel: "XPORTAL_AI_CREDIT",
  weightedUnitsPerCredit: 1_000,
  tokenWeights: {
    uncachedInput: 10,
    cachedInput: 1,
    output: 60,
  },
  defaultPurposeMultiplierBasisPoints: 10_000,
  purposeMultiplierBasisPoints: {
    chat: 10_000,
    project_brief: 10_000,
    insight: 10_000,
    router: 10_000,
    research: 1_000,
    analysis: 10_000,
    mesh_agent: 10_000,
    final_synthesis: 10_000,
  },
  defaultModelMultiplierBasisPoints: 10_000,
  flatPriceCredits: {
    project_brief: BRIEF_ANALYSIS_CREDITS,
  },
  modelMultiplierBasisPoints: {
    "gpt-5.4-nano": 10_000,
    "gpt-5.5-pro": 190_000,
    "gpt-5.6-luna": 10_000,
    "gpt-5.6-terra": 100_000,
  },
} as const satisfies AiCreditPolicy;

export type AiCreditCalculation = {
  creditsConsumed: number;
  /** The fixed price applied, or null when the purpose was metered. */
  flatPriceCredits: number | null;
  /** What token weighting would have charged. Equal to creditsConsumed
   * whenever no flat price applies. Kept for reconciliation. */
  meteredCredits: number;
  policyVersion: string;
  unitLabel: "XPORTAL_AI_CREDIT";
  meteredModel: string;
  purpose: string;
  baseWeightedUnits: string;
  purposeMultiplierBasisPoints: number;
  modelMultiplierBasisPoints: number;
  usedDefaultPurposeMultiplier: boolean;
  usedDefaultModelMultiplier: boolean;
};

const BASIS_POINTS = 10_000n;

function assertPositiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function validatePolicy(policy: AiCreditPolicy): void {
  assertPositiveSafeInteger(
    "weightedUnitsPerCredit",
    policy.weightedUnitsPerCredit,
  );
  assertPositiveSafeInteger(
    "tokenWeights.uncachedInput",
    policy.tokenWeights.uncachedInput,
  );
  assertPositiveSafeInteger(
    "tokenWeights.cachedInput",
    policy.tokenWeights.cachedInput,
  );
  assertPositiveSafeInteger(
    "tokenWeights.output",
    policy.tokenWeights.output,
  );
  assertPositiveSafeInteger(
    "defaultPurposeMultiplierBasisPoints",
    policy.defaultPurposeMultiplierBasisPoints,
  );
  assertPositiveSafeInteger(
    "defaultModelMultiplierBasisPoints",
    policy.defaultModelMultiplierBasisPoints,
  );
  for (const [purpose, price] of Object.entries(policy.flatPriceCredits)) {
    assertPositiveSafeInteger(`flatPriceCredits.${purpose}`, price);
  }
}

/**
 * Commercial rounding. `ceil` billed a request costing 2.01 credits as 3,
 * a systematic 20.1% overcharge at the old resolution. Half-up keeps the
 * rounding error symmetric and below 2.5% at current prices.
 *
 * Any real usage still costs at least one credit, so a request can never be
 * metered as free.
 */
function divideAndRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator === 0n) return 0n;
  const rounded = (2n * numerator + denominator) / (2n * denominator);
  return rounded === 0n ? 1n : rounded;
}

export function calculateCreditsConsumed(
  input: AiModelIdentity &
    AiTokenUsage & {
      purpose: string;
    },
  policy: AiCreditPolicy = XPORTAL_AI_CREDIT_POLICY,
): AiCreditCalculation {
  validatePolicy(policy);

  const usage = normalizeAiTokenUsage(input);
  const meteredModel = resolveMeteredModel(input);
  const purpose = input.purpose.trim() || "unknown";

  const configuredPurposeMultiplier =
    policy.purposeMultiplierBasisPoints[purpose];
  const purposeMultiplierBasisPoints =
    configuredPurposeMultiplier ??
    policy.defaultPurposeMultiplierBasisPoints;
  assertPositiveSafeInteger(
    "purposeMultiplierBasisPoints",
    purposeMultiplierBasisPoints,
  );

  const configuredModelMultiplier =
    policy.modelMultiplierBasisPoints[meteredModel];
  const modelMultiplierBasisPoints =
    configuredModelMultiplier ?? policy.defaultModelMultiplierBasisPoints;
  assertPositiveSafeInteger(
    "modelMultiplierBasisPoints",
    modelMultiplierBasisPoints,
  );

  const baseWeightedUnits =
    BigInt(usage.uncachedInputTokens + usage.cacheWriteTokens) *
      BigInt(policy.tokenWeights.uncachedInput) +
    BigInt(usage.cachedInputTokens) *
      BigInt(policy.tokenWeights.cachedInput) +
    BigInt(usage.outputTokens) * BigInt(policy.tokenWeights.output);

  const numerator =
    baseWeightedUnits *
    BigInt(purposeMultiplierBasisPoints) *
    BigInt(modelMultiplierBasisPoints);
  const denominator =
    BigInt(policy.weightedUnitsPerCredit) * BASIS_POINTS * BASIS_POINTS;
  const meteredCredits = divideAndRoundHalfUp(numerator, denominator);

  if (meteredCredits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("creditsConsumed exceeds the safe integer range");
  }

  // A request that never reached the provider stays free even at a flat price.
  // Otherwise a failed attempt would bill the customer for nothing.
  const flatPrice = policy.flatPriceCredits[purpose];
  const creditsConsumed =
    flatPrice === undefined
      ? Number(meteredCredits)
      : baseWeightedUnits === 0n
        ? 0
        : flatPrice;

  return {
    creditsConsumed,
    flatPriceCredits: flatPrice ?? null,
    meteredCredits: Number(meteredCredits),
    policyVersion: policy.version,
    unitLabel: policy.unitLabel,
    meteredModel,
    purpose,
    baseWeightedUnits: baseWeightedUnits.toString(),
    purposeMultiplierBasisPoints,
    modelMultiplierBasisPoints,
    usedDefaultPurposeMultiplier: configuredPurposeMultiplier === undefined,
    usedDefaultModelMultiplier: configuredModelMultiplier === undefined,
  };
}
