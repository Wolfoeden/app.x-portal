import { describe, expect, it } from "vitest";

import {
  externalSearchCtaState,
  visibleAnalysisSteps,
} from "@/components/chat/results";
import {
  mergeUsageSnapshot,
  normalizeUsageSnapshot,
  publicProgressLabel,
  usageSummary,
} from "@/components/ChatWorkspace";
import type { AiAnalysisTrace, AiUsageSnapshot } from "@/components/chat-contract";

const usage: AiUsageSnapshot = {
  freeUsage: {
    limit: 10,
    used: 0,
    reserved: 0,
    remaining: 10,
    periodStart: "2026-08-01T00:00:00.000Z",
    periodEnd: "2026-09-01T00:00:00.000Z",
    exhausted: false,
  },
  productCredits: {
    balance: 42,
    reserved: 0,
    available: 42,
    euroPerCredit: "0.0166666667",
  },
};

const nanoTrace: AiAnalysisTrace = {
  provider: {
    configured: true,
    attempted: true,
    succeeded: true,
    fallback: false,
    requestedTransport: "direct_openai",
    actualTransport: "direct_openai",
    requestedModel: "gpt-5.4-nano-2026-03-17",
    actualModel: "gpt-5.4-nano-2026-03-17",
    failureCategory: null,
  },
  steps: [
    {
      label: "internal reasoning",
      detail: "This must never be rendered.",
      status: "completed",
    },
  ],
  externalSearchAvailable: true,
};

describe("chat usage presentation contract", () => {
  it("normalizes monthly usage and purchased credits as separate balances", () => {
    expect(normalizeUsageSnapshot({ usage })).toEqual(usage);
    expect(normalizeUsageSnapshot({
      freeUsage: usage.freeUsage,
      productCredits: null,
    })).toEqual({ freeUsage: usage.freeUsage, productCredits: null });
    expect(normalizeUsageSnapshot({ credits: { total: 500, used: 10, remaining: 490 } })).toBeNull();
  });

  it("merges a partial chat usage update without erasing purchased credits", () => {
    expect(mergeUsageSnapshot(usage, {
      freeUsage: { ...usage.freeUsage, used: 1, remaining: 9 },
    })).toEqual({
      freeUsage: { ...usage.freeUsage, used: 1, remaining: 9 },
      productCredits: usage.productCredits,
    });
  });

  it("shows guests a free-analysis count without guest-credit wording", () => {
    const summary = usageSummary(usage, false);
    expect(summary).toBe("10/10 freie Analysen");
    expect(summary).not.toMatch(/Gast-Credits|Credits/u);
  });

  it("shows account free usage separately from purchased product credits", () => {
    expect(usageSummary(usage, true)).toBe("10/10 freie Analysen · 42 Credits");
  });

  it("requires login and 30 product credits before the explicit search confirmation", () => {
    const productCredits = usage.productCredits!;
    expect(externalSearchCtaState(false, productCredits)).toMatchObject({
      kind: "login",
      disabled: false,
    });
    expect(externalSearchCtaState(true, { ...productCredits, available: 29 })).toEqual({
      kind: "insufficient",
      label: "30 Credits erforderlich · 29 verfügbar",
      disabled: true,
    });
    expect(externalSearchCtaState(true, productCredits)).toEqual({
      kind: "ready",
      label: "Internetsuche starten – 30 Credits / 0,50 €",
      disabled: false,
    });
  });

  it("maps provider progress to public milestones instead of exposing arbitrary details", () => {
    expect(publicProgressLabel("hidden chain of thought detail")).toBe("Anfrage wird verarbeitet …");
    expect(publicProgressLabel("12 aktive Profile werden regelbasiert abgeglichen …")).toBe(
      "Interne Profile werden regelbasiert abgeglichen …",
    );
    expect(publicProgressLabel("2 nicht empfohlene Teiltreffer werden transparent aufbereitet …")).toBe(
      "Nicht empfohlene Teiltreffer werden transparent vorbereitet …",
    );
  });

  it("renders only the fixed three-step analysis explanation", () => {
    const steps = visibleAnalysisSteps(nanoTrace, 7);
    expect(steps).toHaveLength(3);
    expect(steps.map((step) => step.label)).toEqual([
      "Anforderungen mit GPT-5.4 Nano strukturiert",
      "Interne Profile regelbasiert abgeglichen",
      "Ergebnis vorbereitet",
    ]);
    expect(JSON.stringify(steps)).not.toContain("internal reasoning");
    expect(steps[2]?.detail).toContain("3 von maximal drei Profilen");

    const partialSteps = visibleAnalysisSteps(nanoTrace, 0, 2);
    expect(partialSteps[2]?.detail).toContain("2 nicht empfohlene Teiltreffer");
  });
});
