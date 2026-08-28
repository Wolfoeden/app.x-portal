import { describe, expect, it } from "vitest";

import {
  BRIEF_ANALYSIS_CREDITS,
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
      purpose: "chat",
      inputTokens: 1,
      outputTokens: 0,
    });

    expect(result.creditsConsumed).toBe(1);
    expect(result.unitLabel).toBe("XPORTAL_AI_CREDIT");
    expect(result.policyVersion).toBe("xportal-ai-credits-2026-08-26-v5");
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

  it("charges the same for a short and a long brief", () => {
    // Median and p90 of 30 confirmed settlements on 2026-08-20/21. Under
    // token metering these cost 18 and 21 credits; the customer could not
    // predict either. The advertised price is one number, so both pay it.
    const median = calculateCreditsConsumed({
      requestedModel: "gpt-5.4-nano",
      purpose: "project_brief",
      inputTokens: 920,
      cachedInputTokens: 0,
      outputTokens: 147,
    });
    const p90 = calculateCreditsConsumed({
      requestedModel: "gpt-5.4-nano",
      purpose: "project_brief",
      inputTokens: 949,
      cachedInputTokens: 0,
      outputTokens: 187,
    });

    expect(median.creditsConsumed).toBe(BRIEF_ANALYSIS_CREDITS);
    expect(p90.creditsConsumed).toBe(BRIEF_ANALYSIS_CREDITS);
    expect(BRIEF_ANALYSIS_CREDITS).toBe(3);
    // What the metering would have charged stays on the record.
    expect(median.meteredCredits).toBe(18);
    expect(p90.meteredCredits).toBe(21);
    expect(median.flatPriceCredits).toBe(3);
  });

  it("keeps a flat price flat across models", () => {
    // gpt-5.5-pro carries a 19x model multiplier. A customer who gets routed
    // to it must not discover a 19x bill for the same action.
    const nano = calculateCreditsConsumed({
      requestedModel: "gpt-5.4-nano",
      purpose: "project_brief",
      inputTokens: 900,
      outputTokens: 150,
    });
    const pro = calculateCreditsConsumed({
      requestedModel: "gpt-5.5-pro",
      purpose: "project_brief",
      inputTokens: 15_000,
      outputTokens: 1_800,
    });

    expect(nano.creditsConsumed).toBe(BRIEF_ANALYSIS_CREDITS);
    expect(pro.creditsConsumed).toBe(BRIEF_ANALYSIS_CREDITS);
    expect(pro.meteredCredits).toBe(4_902);
  });

  it("charges nothing for a flat-priced request that never reached the provider", () => {
    const result = calculateCreditsConsumed({
      requestedModel: "gpt-5.4-nano",
      purpose: "project_brief",
      inputTokens: 0,
      outputTokens: 0,
    });

    expect(result.creditsConsumed).toBe(0);
  });

  it("leaves metered purposes untouched by the flat-price table", () => {
    const research = calculateCreditsConsumed({
      requestedModel: "gpt-5.4-nano",
      purpose: "research",
      inputTokens: 920,
      outputTokens: 147,
    });

    expect(research.flatPriceCredits).toBeNull();
    expect(research.creditsConsumed).toBe(research.meteredCredits);
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

  it("meters a GPT-5.5 Pro chat turn at its explicit model multiplier", () => {
    const result = calculateCreditsConsumed({
      requestedModel: "gpt-5.5-pro",
      purpose: "chat",
      inputTokens: 15_000,
      outputTokens: 1_800,
    });

    expect(result.modelMultiplierBasisPoints).toBe(190_000);
    expect(result.creditsConsumed).toBe(4_902);
  });

  it("meters a Terra chat turn at its explicit model multiplier", () => {
    const result = calculateCreditsConsumed({
      requestedModel: "gpt-5.6-terra",
      purpose: "chat",
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
