import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ExtractProjectBriefResult } from "@/lib/openai/brief";
import { briefAnalysisResult } from "@/lib/openai/brief-billing";

const provider = {
  requestedModel: "gpt-5.4-nano",
  model: "gpt-5.4-nano-2026-03-17",
  responseId: "resp_1",
  inputTokens: 900,
  outputTokens: 300,
  totalTokens: 1200,
};

function result(overrides: Partial<ExtractProjectBriefResult>): ExtractProjectBriefResult {
  return { brief: {} as ExtractProjectBriefResult["brief"], mode: "openai", providerAttempted: true, provider, ...overrides } as ExtractProjectBriefResult;
}

describe("billing a project analysis (audit F01)", () => {
  it("charges an analysis the model delivered from its real usage", () => {
    const outcome = briefAnalysisResult(result({}));
    expect(outcome.providerUsageDefinitelyZero).toBe(false);
    expect(outcome.outcome).toBe("succeeded");
    expect(outcome.usage).toMatchObject({ inputTokens: 900, outputTokens: 300 });
  });

  it.each(["provider_timeout", "provider_error", "invalid_output"] as const)(
    "releases the credits when the analysis fell back after %s",
    (fallbackReason) => {
      const outcome = briefAnalysisResult(result({ mode: "fallback", fallbackReason }));
      expect(outcome.providerUsageDefinitelyZero).toBe(true);
      // Ohne `usage` gibt der Gateway die Reservierung vollständig frei.
      expect(outcome.usage).toBeUndefined();
      expect(outcome.outcome).toBe(fallbackReason === "provider_timeout" ? "timeout" : "provider_error");
    },
  );
});
