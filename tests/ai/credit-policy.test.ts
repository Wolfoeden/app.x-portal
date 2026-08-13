import { describe, expect, it } from "vitest";

import {
  calculateCreditsConsumed,
  type AiCreditPolicy,
  XPORTAL_AI_CREDIT_POLICY,
} from "@/lib/ai/credit-policy";

describe("XPORTAL AI credit policy", () => {
  it("returns zero credits for zero usage", () => {
    expect(
      calculateCreditsConsumed({
        requestedModel: "gpt-5.6-luna",
        purpose: "chat",
        inputTokens: 0,
        outputTokens: 0,
      }).creditsConsumed,
    ).toBe(0);
  });

  it("uses different internal weights for uncached, cached, and output tokens", () => {
    const uncached = calculateCreditsConsumed({
      requestedModel: "gpt-5.6-luna",
      purpose: "chat",
      inputTokens: 100,
      outputTokens: 0,
    });
    const cached = calculateCreditsConsumed({
      requestedModel: "gpt-5.6-luna",
      purpose: "chat",
      inputTokens: 1_000,
      cachedInputTokens: 1_000,
      outputTokens: 0,
    });
    const output = calculateCreditsConsumed({
      requestedModel: "gpt-5.6-luna",
      purpose: "chat",
      inputTokens: 0,
      outputTokens: 100,
    });

    expect(uncached).toMatchObject({
      creditsConsumed: 1,
      baseWeightedUnits: "1000",
    });
    expect(cached).toMatchObject({
      creditsConsumed: 1,
      baseWeightedUnits: "1000",
    });
    expect(output).toMatchObject({
      creditsConsumed: 6,
      baseWeightedUnits: "6000",
    });
  });

  it("rounds a non-zero partial internal credit up", () => {
    const result = calculateCreditsConsumed({
      requestedModel: "gpt-5.6-luna",
      purpose: "project_brief",
      inputTokens: 1,
      outputTokens: 0,
    });

    expect(result.creditsConsumed).toBe(1);
    expect(result.unitLabel).toBe("XPORTAL_AI_CREDIT");
    expect(result.policyVersion).toBe(
      "xportal-ai-credits-mvp-2026-08-13-v3",
    );
  });

  it("meters the higher-cost Terra model with an explicit multiplier", () => {
    const result = calculateCreditsConsumed({
      requestedModel: "gpt-5.6-terra",
      purpose: "chat",
      inputTokens: 100,
      outputTokens: 0,
    });

    expect(result.creditsConsumed).toBe(10);
    expect(result.modelMultiplierBasisPoints).toBe(100_000);
    expect(result.usedDefaultModelMultiplier).toBe(false);
  });

  it("allows one representative GPT-5.5 Pro brief within the guest allocation", () => {
    const result = calculateCreditsConsumed({
      requestedModel: "gpt-5.5-pro",
      purpose: "project_brief",
      inputTokens: 15_000,
      outputTokens: 1_800,
    });

    expect(result.modelMultiplierBasisPoints).toBe(190_000);
    expect(result.creditsConsumed).toBeLessThanOrEqual(500);
  });

  it("allows one representative Terra project brief within the guest allocation", () => {
    const result = calculateCreditsConsumed({
      requestedModel: "gpt-5.6-terra",
      purpose: "project_brief",
      inputTokens: 15_000,
      outputTokens: 1_800,
    });

    expect(result.creditsConsumed).toBe(258);
    expect(result.purposeMultiplierBasisPoints).toBe(1_000);
    expect(result.creditsConsumed).toBeLessThanOrEqual(500);
  });

  it("uses the actual model identifier when provided", () => {
    const result = calculateCreditsConsumed({
      requestedModel: "routing-alias",
      actualModel: "gpt-5.6-luna",
      purpose: "analysis",
      inputTokens: 100,
      outputTokens: 0,
    });

    expect(result.meteredModel).toBe("gpt-5.6-luna");
    expect(result.usedDefaultModelMultiplier).toBe(false);
  });

  it("meters an unknown model with the explicit fallback policy", () => {
    const result = calculateCreditsConsumed({
      requestedModel: "future-model",
      purpose: "future-purpose",
      inputTokens: 100,
      outputTokens: 0,
    });

    expect(result.creditsConsumed).toBe(1);
    expect(result.usedDefaultModelMultiplier).toBe(true);
    expect(result.usedDefaultPurposeMultiplier).toBe(true);
  });

  it("supports a centrally supplied versioned policy", () => {
    const customPolicy: AiCreditPolicy = {
      ...XPORTAL_AI_CREDIT_POLICY,
      version: "test-policy-v2",
      purposeMultiplierBasisPoints: {
        chat: 20_000,
      },
    };

    const result = calculateCreditsConsumed(
      {
        requestedModel: "gpt-5.6-luna",
        purpose: "chat",
        inputTokens: 100,
        outputTokens: 0,
      },
      customPolicy,
    );

    expect(result.creditsConsumed).toBe(2);
    expect(result.policyVersion).toBe("test-policy-v2");
    expect(result.purposeMultiplierBasisPoints).toBe(20_000);
  });
});
