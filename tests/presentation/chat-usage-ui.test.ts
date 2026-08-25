import { describe, expect, it } from "vitest";

import {
  externalSearchCtaState,
  visibleAnalysisSteps,
} from "@/components/chat/results";
import {
  estimatedRequestsLeft,
  mergeUsageSnapshot,
  normalizeUsageSnapshot,
  publicProgressLabel,
  usageSummary,
} from "@/components/ChatWorkspace";
import type { AiAnalysisTrace, AiUsageSnapshot } from "@/components/chat-contract";

const usage: AiUsageSnapshot = {
  credits: {
    total: 1_050,
    used: 24,
    reserved: 0,
    remaining: 1_026,
    periodEnd: "2026-09-01T00:00:00.000Z",
    exhausted: false,
    creditsPerRequest: 21,
    lastRequestCost: 24,
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
  it("normalizes the credit balance and purchased credits as separate ledgers", () => {
    expect(normalizeUsageSnapshot({ usage })).toEqual(usage);
    expect(normalizeUsageSnapshot({
      credits: usage.credits,
      productCredits: null,
    })).toEqual({ credits: usage.credits, productCredits: null });
    // A partial balance is rejected rather than rendered as a wrong number.
    expect(normalizeUsageSnapshot({ credits: { total: 500, used: 10, remaining: 490 } })).toBeNull();
  });

  it("merges a partial chat usage update without erasing purchased credits", () => {
    const spent = { ...usage.credits, used: 48, remaining: 1_002, lastRequestCost: 24 };
    expect(mergeUsageSnapshot(usage, { credits: spent })).toEqual({
      credits: spent,
      productCredits: usage.productCredits,
    });
  });

  it("reports the balance and a floored request estimate", () => {
    // 1,026 remaining at 21 credits per request floors to 48, never rounds up
    // into a request the balance cannot pay for.
    expect(estimatedRequestsLeft(usage.credits)).toBe(48);
    expect(usageSummary(usage, false)).toBe("1.026 Credits · ca. 48 Anfragen");
  });

  it("keeps the research credits distinct from the monthly balance", () => {
    expect(usageSummary(usage, true)).toBe(
      "1.026 Credits · ca. 48 Anfragen · 42 Recherche-Credits",
    );
  });

  it("uses the singular when exactly one request remains", () => {
    const almostEmpty = { ...usage.credits, remaining: 30, used: 1_020 };
    expect(usageSummary({ ...usage, productCredits: null }, false)).toContain("Anfragen");
    expect(usageSummary({ credits: almostEmpty, productCredits: null }, false)).toBe(
      "30 Credits · ca. 1 Anfrage",
    );
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
    // Kein Festpreis mehr: die Beschriftung nennt die geschätzten Suchkosten
    // und muss als Schätzung erkennbar bleiben.
    const ready = externalSearchCtaState(true, productCredits);
    expect(ready.kind).toBe("ready");
    expect(ready.disabled).toBe(false);
    expect(ready.label).toMatch(/^Internetsuche starten – ca\. \d+,\d ct geschätzt$/u);
    expect(ready.label).not.toContain("0,50");
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
