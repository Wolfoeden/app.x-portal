import {
  normalizeAiTokenUsage,
  resolveMeteredModel,
  type AiModelIdentity,
  type AiTokenUsage,
} from "@/lib/ai/model-pricing";

/**
 * XPORTAL AI credits are internal product-metering units. They are neither
 * OpenAI tokens nor currency and have no 1:1 relationship with either.
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
  "xportal-ai-credits-mvp-2026-08-12";

/**
 * Simple MVP policy:
 * - cached input: 1 weighted unit / token
 * - uncached input: 10 weighted units / token
 * - output: 60 weighted units / token
 * - one internal credit covers 1,000 weighted units, rounded up
 *
 * The weights are centrally versioned product policy. Allocation totals are a
 * separate business decision and intentionally do not live in this module.
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
    research: 10_000,
    analysis: 10_000,
    mesh_agent: 10_000,
    final_synthesis: 10_000,
  },
  defaultModelMultiplierBasisPoints: 10_000,
  modelMultiplierBasisPoints: {
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

function divideAndRoundUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator === 0n) return 0n;
  return (numerator + denominator - 1n) / denominator;
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
  const creditsConsumed = divideAndRoundUp(numerator, denominator);

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
