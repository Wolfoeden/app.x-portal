import { describe, expect, it } from "vitest";

import {
  calculateProcessEconomics,
  parseNonNegativeDecimal,
} from "@/lib/agent-grid/economics";

describe("Agent Grid economics", () => {
  it("does not present empty inputs as zero cost", () => {
    expect(parseNonNegativeDecimal("")).toBeNull();
    expect(
      calculateProcessEconomics({
        volumePerMonth: "",
        minutesPerCase: "",
        hourlyCost: "",
      }),
    ).toEqual({ hoursPerMonth: null, currentProcessCost: null });
  });

  it("calculates hours and current costs from the documented formula", () => {
    expect(
      calculateProcessEconomics({
        volumePerMonth: "240",
        minutesPerCase: "15",
        hourlyCost: "48,50",
      }),
    ).toEqual({ hoursPerMonth: 60, currentProcessCost: 2_910 });
  });

  it("accepts a known zero value but rejects negative or non-numeric input", () => {
    expect(parseNonNegativeDecimal("0")).toBe(0);
    expect(parseNonNegativeDecimal("-1")).toBeNull();
    expect(parseNonNegativeDecimal("teuer")).toBeNull();
  });
});
