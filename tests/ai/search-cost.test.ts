import { describe, expect, it } from "vitest";

import {
  actualSearchCost,
  estimateSearchCost,
  formatCostEstimate,
  MEASURED_RESEARCH_TOKEN_NANO_USD,
  TYPICAL_SEARCH_TOOL_CALLS,
  WEB_SEARCH_CALL_NANO_USD,
} from "@/lib/ai/search-cost";

describe("Kostenschätzung", () => {
  it("rechnet Suchaufrufe mit einem Cent", () => {
    const one = estimateSearchCost(1);
    const two = estimateSearchCost(2);
    expect(two.totalNanoUsd - one.totalNanoUsd).toBe(WEB_SEARCH_CALL_NANO_USD);
  });

  it("nimmt ohne Angabe den typischen Verlauf an", () => {
    expect(estimateSearchCost().toolCalls).toBe(TYPICAL_SEARCH_TOOL_CALLS);
  });

  it("liegt für einen typischen Lauf zwischen 4 und 5 Cent", () => {
    const cost = estimateSearchCost();
    expect(cost.cents).toBeGreaterThanOrEqual(4);
    expect(cost.cents).toBeLessThanOrEqual(5);
  });

  it("beschriftet die Zahl erkennbar als Schätzung", () => {
    expect(formatCostEstimate(estimateSearchCost())).toMatch(/^ca\. \d+,\d ct$/u);
  });
});

describe("Gemessene Kosten", () => {
  it("verrechnet gecachte Eingabe günstiger", () => {
    const cached = actualSearchCost({
      toolCalls: 0,
      inputTokens: 10_000,
      cachedInputTokens: 10_000,
      outputTokens: 0,
    });
    const uncached = actualSearchCost({
      toolCalls: 0,
      inputTokens: 10_000,
      cachedInputTokens: 0,
      outputTokens: 0,
    });
    expect(cached.tokenNanoUsd).toBeLessThan(uncached.tokenNanoUsd);
  });

  it("reproduziert einen echten Lauf", () => {
    // Gemessen: 17.963 Eingabe (4.608 gecacht), 634 Ausgabe, 3 Suchen.
    const cost = actualSearchCost({
      toolCalls: 3,
      inputTokens: 17_963,
      cachedInputTokens: 4_608,
      outputTokens: 634,
    });
    expect(cost.toolNanoUsd).toBe(3 * WEB_SEARCH_CALL_NANO_USD);
    expect(cost.cents).toBeCloseTo(3.4, 1);
  });

  it("fällt ohne belastbare Token auf den Messwert zurück", () => {
    const cost = actualSearchCost({ toolCalls: 2, inputTokens: undefined });
    expect(cost.tokenNanoUsd).toBe(MEASURED_RESEARCH_TOKEN_NANO_USD);
  });

  it("lässt sich nicht durch unsinnige Angaben kleinrechnen", () => {
    const cost = actualSearchCost({
      toolCalls: 2,
      inputTokens: -5,
      outputTokens: -5,
    });
    expect(cost.tokenNanoUsd).toBe(MEASURED_RESEARCH_TOKEN_NANO_USD);
  });

  it("begrenzt gecachte Token auf die Gesamteingabe", () => {
    const cost = actualSearchCost({
      toolCalls: 0,
      inputTokens: 100,
      cachedInputTokens: 999,
      outputTokens: 0,
    });
    expect(cost.tokenNanoUsd).toBe(100 * 20);
  });
});
