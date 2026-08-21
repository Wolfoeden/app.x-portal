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
};

export const XPORTAL_AI_CREDIT_POLICY_VERSION =
  "xportal-ai-credits-2026-08-21-v4";

/**
 * Token weights:
 * - cached input: 1 weighted unit / token
 * - uncached input: 10 weighted units / token
 * - output: 60 weighted units / token
 * - one credit covers 1,000 weighted units, rounded half-up
 *
 * Calibrated on 30 confirmed `project_brief` settlements measured on
 * 2026-08-20/21 (gpt-5.4-nano): input is near-constant at ~928 tokens because
 * the system prompt dominates, output varies between 93 and 407. That puts a
 * typical request at 18-21 credits.
 *
 * `project_brief` previously carried a 0.1x multiplier, which made a request
 * cost 2-4 credits. At that resolution `ceil` overcharged by 20.1% and only
 * three distinct prices existed. It now meters at 1.0x like `chat`: it is the
 * primary customer-facing operation and has no reason to be discounted.
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
  modelMultiplierBasisPoints: {
    "gpt-5.4-nano": 10_000,
    "gpt-5.5-pro": 190_000,
    "gpt-5.6-luna": 10_000,
    "gpt-5.6-terra": 100_000,
  },
} as const satisfies AiCreditPolicy;

export type AiCreditCalculation = {
  creditsConsumed: number;
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
  const creditsConsumed = divideAndRoundHalfUp(numerator, denominator);

  if (creditsConsumed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("creditsConsumed exceeds the safe integer range");
  }

  return {
    creditsConsumed: Number(creditsConsumed),
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
