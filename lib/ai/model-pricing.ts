/**
 * Provider pricing is intentionally separate from XPORTAL AI credits.
 *
 * Costs are calculated in nano-USD (1 USD = 1,000,000,000 nano-USD), so the
 * current per-token prices can be represented without floating-point math.
 * String amounts are safe to persist in a PostgreSQL bigint/numeric column and
 * to pass through JSON without losing precision.
 */

export type AiTokenUsage = {
  inputTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  outputTokens: number;
};

export type NormalizedAiTokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AiModelIdentity = {
  requestedModel: string;
  actualModel?: string | null;
};

export type ModelPricingSnapshot = {
  modelId: string;
  currency: "USD";
  inputNanoUsdPerToken: string;
  cachedInputNanoUsdPerToken: string;
  cacheWriteNanoUsdPerToken: string;
  outputNanoUsdPerToken: string;
  pricingVersion: string;
  effectiveOn: string;
  sourceUrl: string;
  sourceCheckedOn: string;
};

export const OPENAI_PRICING_SOURCE_URL =
  "https://developers.openai.com/api/docs/models/compare";

export const OPENAI_PRICING_VERSION = "openai-model-pricing-2026-08-12";

/**
 * Official OpenAI prices checked on 2026-08-12. Per-token nano-USD values are
 * exact conversions from the published per-1M-token prices.
 */
export const MODEL_PRICING_REGISTRY = {
  "gpt-5.6-luna": {
    modelId: "gpt-5.6-luna",
    currency: "USD",
    inputNanoUsdPerToken: "200",
    cachedInputNanoUsdPerToken: "20",
    cacheWriteNanoUsdPerToken: "250",
    outputNanoUsdPerToken: "1200",
    pricingVersion: OPENAI_PRICING_VERSION,
    effectiveOn: "2026-08-12",
    sourceUrl: OPENAI_PRICING_SOURCE_URL,
    sourceCheckedOn: "2026-08-12",
  },
  "gpt-5.6-terra": {
    modelId: "gpt-5.6-terra",
    currency: "USD",
    inputNanoUsdPerToken: "2000",
    cachedInputNanoUsdPerToken: "200",
    cacheWriteNanoUsdPerToken: "2500",
    outputNanoUsdPerToken: "12000",
    pricingVersion: OPENAI_PRICING_VERSION,
    effectiveOn: "2026-08-12",
    sourceUrl: OPENAI_PRICING_SOURCE_URL,
    sourceCheckedOn: "2026-08-12",
  },
} as const satisfies Record<string, ModelPricingSnapshot>;

export type ProviderCostEstimate = {
  requestedModel: string;
  actualModel: string | null;
  meteredModel: string;
  pricingModel: string | null;
  pricingVersion: string | null;
  usage: NormalizedAiTokenUsage;
  estimatedCostNanoUsd: string | null;
  estimatedCostUsd: string | null;
};

function normalizeModelId(model: string | null | undefined): string {
  return model?.trim() ?? "";
}

function assertTokenCount(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

export function normalizeAiTokenUsage(
  usage: AiTokenUsage,
): NormalizedAiTokenUsage {
  const cachedInputTokens = usage.cachedInputTokens ?? 0;
  const cacheWriteTokens = usage.cacheWriteTokens ?? 0;

  assertTokenCount("inputTokens", usage.inputTokens);
  assertTokenCount("cachedInputTokens", cachedInputTokens);
  assertTokenCount("cacheWriteTokens", cacheWriteTokens);
  assertTokenCount("outputTokens", usage.outputTokens);

  if (cachedInputTokens + cacheWriteTokens > usage.inputTokens) {
    throw new RangeError(
      "cachedInputTokens plus cacheWriteTokens cannot be greater than inputTokens",
    );
  }

  const totalTokens = usage.inputTokens + usage.outputTokens;
  if (!Number.isSafeInteger(totalTokens)) {
    throw new RangeError("totalTokens exceeds the safe integer range");
  }

  return {
    inputTokens: usage.inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    uncachedInputTokens:
      usage.inputTokens - cachedInputTokens - cacheWriteTokens,
    outputTokens: usage.outputTokens,
    totalTokens,
  };
}

export function resolveMeteredModel(identity: AiModelIdentity): string {
  const requestedModel = normalizeModelId(identity.requestedModel);
  const actualModel = normalizeModelId(identity.actualModel);
  return actualModel || requestedModel;
}

export function resolveModelPricing(
  identity: AiModelIdentity,
): ModelPricingSnapshot | null {
  const meteredModel = resolveMeteredModel(identity);
  const exact =
    MODEL_PRICING_REGISTRY[
      meteredModel as keyof typeof MODEL_PRICING_REGISTRY
    ];
  if (exact) return exact;

  // Responses may identify a dated snapshot. Only these explicit reviewed
  // family patterns inherit their base-model price; other identifiers remain
  // unknown rather than being priced by similarity.
  const datedFamily = /^(gpt-5\.6-(?:luna|terra))-\d{4}-\d{2}-\d{2}$/u.exec(
    meteredModel,
  )?.[1];
  if (datedFamily) {
    return MODEL_PRICING_REGISTRY[
      datedFamily as keyof typeof MODEL_PRICING_REGISTRY
    ];
  }
  return null;
}

export function formatNanoUsdAsUsd(amountNanoUsd: bigint | string): string {
  const amount =
    typeof amountNanoUsd === "bigint"
      ? amountNanoUsd
      : /^[0-9]+$/.test(amountNanoUsd)
        ? BigInt(amountNanoUsd)
        : null;

  if (amount === null || amount < 0n) {
    throw new RangeError("amountNanoUsd must be a non-negative integer");
  }

  const whole = amount / 1_000_000_000n;
  const fraction = (amount % 1_000_000_000n)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function calculateEstimatedProviderCost(
  input: AiModelIdentity & AiTokenUsage,
): ProviderCostEstimate {
  const usage = normalizeAiTokenUsage(input);
  const requestedModel = normalizeModelId(input.requestedModel);
  const actualModel = normalizeModelId(input.actualModel) || null;
  const meteredModel = resolveMeteredModel(input);
  const pricing = resolveModelPricing(input);

  if (!pricing) {
    return {
      requestedModel,
      actualModel,
      meteredModel,
      pricingModel: null,
      pricingVersion: null,
      usage,
      estimatedCostNanoUsd: null,
      estimatedCostUsd: null,
    };
  }

  const estimatedCostNanoUsd =
    BigInt(usage.uncachedInputTokens) *
      BigInt(pricing.inputNanoUsdPerToken) +
    BigInt(usage.cachedInputTokens) *
      BigInt(pricing.cachedInputNanoUsdPerToken) +
    BigInt(usage.cacheWriteTokens) *
      BigInt(pricing.cacheWriteNanoUsdPerToken) +
    BigInt(usage.outputTokens) * BigInt(pricing.outputNanoUsdPerToken);

  return {
    requestedModel,
    actualModel,
    meteredModel,
    pricingModel: pricing.modelId,
    pricingVersion: pricing.pricingVersion,
    usage,
    estimatedCostNanoUsd: estimatedCostNanoUsd.toString(),
    estimatedCostUsd: formatNanoUsdAsUsd(estimatedCostNanoUsd),
  };
}
