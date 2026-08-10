import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  calculateProviderCostCents,
  configuredDailyTokenLimit,
  configuredInitialCredits,
  configuredMonthlyProviderBudgetCents,
  configuredUnknownModelEstimatedCostCents,
} from "@/lib/ai/quota";

describe("provider cost reconciliation", () => {
  afterEach(() => {
    delete process.env.OPENAI_INPUT_USD_PER_MILLION;
    delete process.env.OPENAI_OUTPUT_USD_PER_MILLION;
    delete process.env.OPENAI_COST_MULTIPLIER;
    delete process.env.AI_CREDITS_GUEST_TOTAL;
    delete process.env.AI_DAILY_TOKEN_LIMIT_GUEST;
    delete process.env.AI_MONTHLY_PROVIDER_BUDGET_CENTS;
    delete process.env.AI_UNKNOWN_MODEL_ESTIMATED_COST_CENTS;
  });

  it("rounds a non-zero provider use up to the next cent", () => {
    expect(calculateProviderCostCents(10_000, 2_000)).toBe(1);
  });

  it("uses configurable model prices and residency multiplier", () => {
    process.env.OPENAI_INPUT_USD_PER_MILLION = "2";
    process.env.OPENAI_OUTPUT_USD_PER_MILLION = "12";
    process.env.OPENAI_COST_MULTIPLIER = "1.1";
    expect(calculateProviderCostCents(1_000_000, 1_000_000)).toBe(1540);
  });

  it("honors zero as an explicit hard-stop configuration", () => {
    process.env.AI_CREDITS_GUEST_TOTAL = "0";
    process.env.AI_DAILY_TOKEN_LIMIT_GUEST = "0";
    process.env.AI_MONTHLY_PROVIDER_BUDGET_CENTS = "0";
    process.env.AI_UNKNOWN_MODEL_ESTIMATED_COST_CENTS = "0";

    expect(configuredInitialCredits(true)).toBe(0);
    expect(configuredDailyTokenLimit(true)).toBe(0);
    expect(configuredMonthlyProviderBudgetCents()).toBe(0);
    expect(configuredUnknownModelEstimatedCostCents()).toBe(0);
  });
});
