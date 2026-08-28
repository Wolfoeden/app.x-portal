import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ACCOUNT_MONTHLY_CREDITS,
  BRIEF_ANALYSIS_CREDITS,
  GUEST_MONTHLY_CREDITS,
} from "@/lib/ai/credit-policy";
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
    delete process.env.AI_PROVIDER_DAILY_TOKEN_SAFETY_LIMIT_GUEST;
    delete process.env.AI_PROVIDER_DAILY_TOKEN_SAFETY_LIMIT_USER;
    delete process.env.AI_PROVIDER_DAILY_TOKEN_SAFETY_LIMIT_ADMIN;
    delete process.env.AI_MONTHLY_PROVIDER_BUDGET_CENTS;
    delete process.env.AI_UNKNOWN_MODEL_ESTIMATED_COST_CENTS;
  });

  it("rounds a non-zero provider use up to the next cent", () => {
    expect(calculateProviderCostCents(10_000, 2_000)).toBe(5);
  });

  it("keeps a separate internal daily allowance for operators", () => {
    process.env.AI_PROVIDER_DAILY_TOKEN_SAFETY_LIMIT_USER = "5000000";
    process.env.AI_PROVIDER_DAILY_TOKEN_SAFETY_LIMIT_ADMIN = "10000000";

    expect(configuredDailyTokenLimit(false)).toBe(5_000_000);
    expect(configuredDailyTokenLimit(false, true)).toBe(10_000_000);
  });

  it("uses configurable model prices and residency multiplier", () => {
    process.env.OPENAI_INPUT_USD_PER_MILLION = "2";
    process.env.OPENAI_OUTPUT_USD_PER_MILLION = "12";
    process.env.OPENAI_COST_MULTIPLIER = "1.1";
    expect(calculateProviderCostCents(1_000_000, 1_000_000)).toBe(1540);
  });

  it("gives a guest 100 and an account 300 credits a month", () => {
    expect(GUEST_MONTHLY_CREDITS).toBe(100);
    expect(configuredInitialCredits(true)).toBe(100);
    expect(ACCOUNT_MONTHLY_CREDITS).toBe(300);
    expect(configuredInitialCredits(false)).toBe(300);
  });

  it("buys 33 guest and 100 account searches at the flat price", () => {
    // Die Zahl, die in der Oberfläche steht, muss aus den Kontingenten
    // folgen — sonst verspricht die Seite etwas, das die Abrechnung nicht hält.
    expect(Math.floor(GUEST_MONTHLY_CREDITS / BRIEF_ANALYSIS_CREDITS)).toBe(33);
    expect(
      Math.floor(ACCOUNT_MONTHLY_CREDITS / BRIEF_ANALYSIS_CREDITS),
    ).toBe(100);
  });

  it("honors zero as an explicit hard-stop configuration", () => {
    process.env.AI_CREDITS_GUEST_TOTAL = "0";
    process.env.AI_PROVIDER_DAILY_TOKEN_SAFETY_LIMIT_GUEST = "0";
    process.env.AI_MONTHLY_PROVIDER_BUDGET_CENTS = "0";
    process.env.AI_UNKNOWN_MODEL_ESTIMATED_COST_CENTS = "0";

    expect(configuredInitialCredits(true)).toBe(0);
    expect(configuredDailyTokenLimit(true)).toBe(0);
    expect(configuredMonthlyProviderBudgetCents()).toBe(0);
    expect(configuredUnknownModelEstimatedCostCents()).toBe(0);
  });
});
