import { describe, expect, it } from "vitest";

import {
  calculateEstimatedProviderCost,
  formatNanoUsdAsUsd,
  MODEL_PRICING_REGISTRY,
  normalizeAiTokenUsage,
  OPENAI_PRICING_SOURCE_URL,
  resolveModelPricing,
} from "@/lib/ai/model-pricing";

describe("model pricing", () => {
  it("stores exact nano-USD rates for Nano and the historical models", () => {
    expect(MODEL_PRICING_REGISTRY).toMatchObject({
      "gpt-5.4-nano": {
        inputNanoUsdPerToken: "200",
        cachedInputNanoUsdPerToken: "20",
        cacheWriteNanoUsdPerToken: "200",
        outputNanoUsdPerToken: "1250",
        sourceCheckedOn: "2026-08-13",
      },
      "gpt-5.5-pro": {
        inputNanoUsdPerToken: "30000",
        cachedInputNanoUsdPerToken: "30000",
        cacheWriteNanoUsdPerToken: "30000",
        outputNanoUsdPerToken: "180000",
        sourceCheckedOn: "2026-08-13",
      },
      "gpt-5.6-luna": {
        inputNanoUsdPerToken: "200",
        cachedInputNanoUsdPerToken: "20",
        cacheWriteNanoUsdPerToken: "250",
        outputNanoUsdPerToken: "1200",
        sourceCheckedOn: "2026-08-12",
      },
      "gpt-5.6-terra": {
        inputNanoUsdPerToken: "2000",
        cachedInputNanoUsdPerToken: "200",
        cacheWriteNanoUsdPerToken: "2500",
        outputNanoUsdPerToken: "12000",
        sourceCheckedOn: "2026-08-12",
      },
    });
  });

  it("calculates the pinned GPT-5.4 Nano snapshot exactly", () => {
    const result = calculateEstimatedProviderCost({
      requestedModel: "gpt-5.4-nano-2026-03-17",
      actualModel: "gpt-5.4-nano-2026-03-17",
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 1_000_000,
    });

    expect(result.estimatedCostNanoUsd).toBe("1450000000");
    expect(result.estimatedCostUsd).toBe("1.45");
    expect(result.pricingModel).toBe("gpt-5.4-nano");
    expect(result.pricingVersion).toBe("openai-model-pricing-2026-08-13");
  });

  it("calculates GPT-5.5 Pro without a cached-input discount", () => {
    const result = calculateEstimatedProviderCost({
      requestedModel: "gpt-5.5-pro",
      actualModel: "gpt-5.5-pro-2026-04-23",
      inputTokens: 1_000_000,
      cachedInputTokens: 250_000,
      outputTokens: 1_000_000,
    });

    expect(result.estimatedCostUsd).toBe("210");
    expect(result.pricingModel).toBe("gpt-5.5-pro");
    expect(result.pricingVersion).toBe("openai-model-pricing-2026-08-13");
  });

  it("calculates the verified GPT-5.6 Luna prices exactly", () => {
    const result = calculateEstimatedProviderCost({
      requestedModel: "gpt-5.6-luna",
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 1_000_000,
    });

    expect(result.estimatedCostNanoUsd).toBe("1400000000");
    expect(result.estimatedCostUsd).toBe("1.4");
    expect(result.pricingModel).toBe("gpt-5.6-luna");
    expect(result.pricingVersion).toBe("openai-model-pricing-2026-08-13");
  });

  it("prices cached tokens as a subset of input tokens", () => {
    const result = calculateEstimatedProviderCost({
      requestedModel: "gpt-5.6-luna",
      inputTokens: 1_000_000,
      cachedInputTokens: 250_000,
      outputTokens: 0,
    });

    expect(result.usage.uncachedInputTokens).toBe(750_000);
    expect(result.usage.totalTokens).toBe(1_000_000);
    expect(result.estimatedCostNanoUsd).toBe("155000000");
    expect(result.estimatedCostUsd).toBe("0.155");
  });

  it("does not double-count a fully cached input", () => {
    const result = calculateEstimatedProviderCost({
      requestedModel: "gpt-5.6-luna",
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 0,
    });

    expect(result.estimatedCostNanoUsd).toBe("20000000");
    expect(result.estimatedCostUsd).toBe("0.02");
  });

  it("prices cache writes at 1.25 times uncached input", () => {
    const result = calculateEstimatedProviderCost({
      requestedModel: "gpt-5.6-luna",
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      cacheWriteTokens: 1_000_000,
      outputTokens: 0,
    });

    expect(result.usage.uncachedInputTokens).toBe(0);
    expect(result.usage.cacheWriteTokens).toBe(1_000_000);
    expect(result.estimatedCostUsd).toBe("0.25");
  });

  it("uses the actual model when the provider returns one", () => {
    const knownActual = calculateEstimatedProviderCost({
      requestedModel: "routing-alias",
      actualModel: "gpt-5.6-luna",
      inputTokens: 10,
      outputTokens: 2,
    });
    const unknownActual = calculateEstimatedProviderCost({
      requestedModel: "gpt-5.6-luna",
      actualModel: "future-model-not-yet-priced",
      inputTokens: 10,
      outputTokens: 2,
    });

    expect(knownActual.meteredModel).toBe("gpt-5.6-luna");
    expect(knownActual.estimatedCostNanoUsd).toBe("4400");
    expect(unknownActual.meteredModel).toBe("future-model-not-yet-priced");
    expect(unknownActual.estimatedCostNanoUsd).toBeNull();
    expect(unknownActual.estimatedCostUsd).toBeNull();
  });

  it("uses the reviewed base price for an explicit dated Luna snapshot", () => {
    const result = calculateEstimatedProviderCost({
      requestedModel: "gpt-5.6-luna",
      actualModel: "gpt-5.6-luna-2026-07-15",
      inputTokens: 10,
      outputTokens: 2,
    });

    expect(result.meteredModel).toBe("gpt-5.6-luna-2026-07-15");
    expect(result.pricingModel).toBe("gpt-5.6-luna");
    expect(result.estimatedCostNanoUsd).toBe("4400");
  });

  it("calculates the verified GPT-5.6 Terra prices exactly", () => {
    const result = calculateEstimatedProviderCost({
      requestedModel: "gpt-5.6-terra",
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 1_000_000,
    });

    expect(result.estimatedCostNanoUsd).toBe("14000000000");
    expect(result.estimatedCostUsd).toBe("14");
    expect(result.pricingModel).toBe("gpt-5.6-terra");
  });

  it("uses the reviewed base price for an explicit dated Terra snapshot", () => {
    const result = calculateEstimatedProviderCost({
      requestedModel: "gpt-5.6-terra",
      actualModel: "gpt-5.6-terra-2026-07-15",
      inputTokens: 10,
      outputTokens: 2,
    });

    expect(result.pricingModel).toBe("gpt-5.6-terra");
    expect(result.estimatedCostNanoUsd).toBe("44000");
  });

  it("returns a null estimate for an unknown model without failing", () => {
    const result = calculateEstimatedProviderCost({
      requestedModel: "unknown-model",
      inputTokens: 123,
      cachedInputTokens: 23,
      outputTokens: 45,
    });

    expect(result.pricingModel).toBeNull();
    expect(result.pricingVersion).toBeNull();
    expect(result.estimatedCostNanoUsd).toBeNull();
    expect(result.usage.totalTokens).toBe(168);
  });

  it("rejects impossible cached-token usage", () => {
    expect(() =>
      normalizeAiTokenUsage({
        inputTokens: 10,
        cachedInputTokens: 11,
        outputTokens: 0,
      }),
    ).toThrow(/cannot be greater than inputTokens/);
  });

  it("keeps source metadata with the price snapshot", () => {
    expect(
      resolveModelPricing({ requestedModel: "gpt-5.6-luna" }),
    ).toMatchObject({
      sourceUrl: OPENAI_PRICING_SOURCE_URL,
      sourceCheckedOn: "2026-08-12",
      effectiveOn: "2026-08-12",
    });
  });

  it("formats nano-USD without floating-point arithmetic", () => {
    expect(formatNanoUsdAsUsd("1")).toBe("0.000000001");
    expect(formatNanoUsdAsUsd(1_400_000_000n)).toBe("1.4");
    expect(formatNanoUsdAsUsd(0n)).toBe("0");
  });
});
