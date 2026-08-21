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

  it("never meters real usage as free", () => {
    const result = calculateCreditsConsumed({
      requestedModel: "gpt-5.6-luna",
      purpose: "project_brief",
      inputTokens: 1,
      outputTokens: 0,
    });

    expect(result.creditsConsumed).toBe(1);
    expect(result.unitLabel).toBe("XPORTAL_AI_CREDIT");
    expect(result.policyVersion).toBe("xportal-ai-credits-2026-08-21-v4");
  });

  it("rounds half-up instead of always rounding up", () => {
    // 1,400 weighted units = 1.4 credits -> 1
    const down = calculateCreditsConsumed({
      requestedModel: "gpt-5.6-luna",
      purpose: "chat",
      inputTokens: 140,
      outputTokens: 0,
    });
    // 1,500 weighted units = 1.5 credits -> 2
    const half = calculateCreditsConsumed({
      requestedModel: "gpt-5.6-luna",
      purpose: "chat",
      inputTokens: 150,
      outputTokens: 0,
    });
    // 1,600 weighted units = 1.6 credits -> 2
    const up = calculateCreditsConsumed({
      requestedModel: "gpt-5.6-luna",
      purpose: "chat",
      inputTokens: 160,
      outputTokens: 0,
    });

    expect(down.creditsConsumed).toBe(1);
    expect(half.creditsConsumed).toBe(2);
    expect(up.creditsConsumed).toBe(2);
  });

  it("meters a measured project brief at the calibrated price", () => {
    // Median of 30 confirmed settlements on 2026-08-20/21:
    // 920 input tokens, 147 output tokens, no cache hit.
    const median = calculateCreditsConsumed({
      requestedModel: "gpt-5.4-nano",
      purpose: "project_brief",
      inputTokens: 920,
      cachedInputTokens: 0,
      outputTokens: 147,
    });
    // p90 of the same sample: 949 input, 187 output.
    const p90 = calculateCreditsConsumed({
      requestedModel: "gpt-5.4-nano",
      purpose: "project_brief",
      inputTokens: 949,
      cachedInputTokens: 0,
      outputTokens: 187,
    });

    expect(median.creditsConsumed).toBe(18);
    expect(p90.creditsConsumed).toBe(21);
    // A brief is the primary customer-facing operation and is no longer
    // discounted against a plain chat turn.
    expect(median.purposeMultiplierBasisPoints).toBe(10_000);
  });

  it("keeps external research on its own discounted multiplier", () => {
    const research = calculateCreditsConsumed({
      requestedModel: "gpt-5.4-nano",
      purpose: "research",
      inputTokens: 920,
      outputTokens: 147,
    });

    expect(research.purposeMultiplierBasisPoints).toBe(1_000);
    expect(research.creditsConsumed).toBe(2);
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

  it("meters a GPT-5.5 Pro brief at its explicit model multiplier", () => {
    const result = calculateCreditsConsumed({
      requestedModel: "gpt-5.5-pro",
      purpose: "project_brief",
      inputTokens: 15_000,
      outputTokens: 1_800,
    });

    expect(result.modelMultiplierBasisPoints).toBe(190_000);
    expect(result.creditsConsumed).toBe(4_902);
  });

  it("meters a Terra project brief at its explicit model multiplier", () => {
    const result = calculateCreditsConsumed({
      requestedModel: "gpt-5.6-terra",
      purpose: "project_brief",
      inputTokens: 15_000,
      outputTokens: 1_800,
    });

    expect(result.creditsConsumed).toBe(2_580);
    expect(result.purposeMultiplierBasisPoints).toBe(10_000);
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
