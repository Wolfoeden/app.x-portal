import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AnalysisTrace, visibleAnalysisSteps } from "@/components/chat/results";
import { agentLaunchState } from "@/components/chat/agent-launch";
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
    planId: "free",
    lastRequestCost: 24,
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
  it("normalizes the one balance and rejects a partial one", () => {
    expect(normalizeUsageSnapshot({ usage })).toEqual(usage);
    expect(normalizeUsageSnapshot({ credits: usage.credits })).toEqual({
      credits: usage.credits,
    });
    // A partial balance is rejected rather than rendered as a wrong number.
    expect(normalizeUsageSnapshot({ credits: { total: 500, used: 10, remaining: 490 } })).toBeNull();
    // Das zweite Guthaben ist abgeschafft. Eine Antwort, die es noch mitsendet,
    // darf die Normalisierung nicht aus dem Tritt bringen.
    expect(
      normalizeUsageSnapshot({
        credits: usage.credits,
        productCredits: { balance: 42, reserved: 0, available: 42 },
      }),
    ).toEqual({ credits: usage.credits });
  });

  it("merges a partial chat usage update", () => {
    const spent = { ...usage.credits, used: 48, remaining: 1_002, lastRequestCost: 24 };
    expect(mergeUsageSnapshot(usage, { credits: spent })).toEqual({ credits: spent });
  });

  it("reports the balance and an exact floored request count", () => {
    // 1,026 remaining at 21 credits per request floors to 48, never rounds up
    // into a request the balance cannot pay for.
    expect(estimatedRequestsLeft(usage.credits)).toBe(48);
    expect(usageSummary(usage, false)).toBe("Guthaben: 1.026 Credits · 48 Anfragen");
  });

  it("zählt einem angemeldeten Konto die Recherchen aus demselben Guthaben vor", () => {
    // 1.026 Credits, 30 je Recherche: 34 — abgerundet, nie aufgerundet in eine
    // Recherche hinein, die das Guthaben nicht mehr trägt.
    expect(usageSummary(usage, true)).toBe(
      "Guthaben: 1.026 Credits · 48 Anfragen · 34 Recherchen",
    );
  });

  it("uses the singular when exactly one request remains", () => {
    const almostEmpty = { ...usage.credits, remaining: 30, used: 1_020 };
    expect(usageSummary(usage, false)).toContain("Anfragen");
    expect(usageSummary({ credits: almostEmpty }, false)).toBe(
      "Guthaben: 30 Credits · 1 Anfrage",
    );
    expect(usageSummary({ credits: almostEmpty }, true)).toBe(
      "Guthaben: 30 Credits · 1 Anfrage · 1 Recherche",
    );
  });

  it("verlangt Anmeldung und 30 Credits, bevor der Agent startbar ist", () => {
    expect(agentLaunchState(false, 1_026)).toEqual({ kind: "login" });
    expect(agentLaunchState(true, null)).toEqual({ kind: "loading" });
    expect(agentLaunchState(true, 29)).toEqual({
      kind: "insufficient",
      remaining: 29,
    });
    expect(agentLaunchState(true, 30)).toEqual({ kind: "ready", remaining: 30 });
  });

  it("maps provider progress to public milestones instead of exposing arbitrary details", () => {
    expect(publicProgressLabel("hidden chain of thought detail")).toBe("Anfrage wird verarbeitet");
    expect(publicProgressLabel("12 aktive Profile werden regelbasiert abgeglichen …")).toBe(
      "Profile werden nach belegten Kriterien geprüft",
    );
    expect(publicProgressLabel("2 nicht empfohlene Teiltreffer werden transparent aufbereitet …")).toBe(
      "Teiltreffer und offene Muss-Kriterien werden aufbereitet",
    );
  });

  it("renders only the fixed three-step analysis explanation", () => {
    const steps = visibleAnalysisSteps(nanoTrace, 7);
    expect(steps).toHaveLength(3);
    expect(steps.map((step) => step.label)).toEqual([
      "Projektanforderungen strukturiert",
      "Profile nach festen Kriterien geprüft",
      "Ergebnis nach belegter Passung priorisiert",
    ]);
    expect(JSON.stringify(steps)).not.toContain("internal reasoning");
    expect(steps[2]?.detail).toContain("3 von maximal drei Profilen");

    const partialSteps = visibleAnalysisSteps(nanoTrace, 0, 2);
    expect(partialSteps[2]?.detail).toContain("2 nicht empfohlene Teiltreffer");
  });

  it("keeps the public work process collapsed by default", () => {
    const markup = renderToStaticMarkup(createElement(AnalysisTrace, {
      trace: nanoTrace,
      profileCount: 1,
      partialProfileCount: 0,
    }));
    expect(markup).toContain('<details class="analysis-trace">');
    expect(markup).not.toContain('<details class="analysis-trace" open="">');
    expect(markup).toContain("Arbeitsprozess");
    expect(markup).not.toContain("internal reasoning");
  });
});
