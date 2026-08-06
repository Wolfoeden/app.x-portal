import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { calculateProviderCostCents } from "@/lib/ai/quota";

describe("provider cost reconciliation", () => {
  afterEach(() => {
    delete process.env.OPENAI_INPUT_USD_PER_MILLION;
    delete process.env.OPENAI_OUTPUT_USD_PER_MILLION;
    delete process.env.OPENAI_COST_MULTIPLIER;
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
});
