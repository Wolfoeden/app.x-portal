import { describe, expect, it } from "vitest";

import {
  analysisDisclosure,
  providerModelLabel,
  providerStatusLabel,
} from "@/components/chat/results";
import {
  assistantAttribution,
  normalizeAnalysisTrace,
  sidebarAccountButtonClassName,
} from "@/components/ChatWorkspace";
import type { AiAnalysisTrace } from "@/components/chat-contract";

function trace(
  provider: Partial<AiAnalysisTrace["provider"]>,
): AiAnalysisTrace {
  return {
    provider: {
      configured: false,
      attempted: false,
      succeeded: false,
      fallback: true,
      requestedTransport: "unconfigured",
      actualTransport: null,
      requestedModel: "gpt-requested",
      actualModel: null,
      failureCategory: null,
      ...provider,
    },
    steps: [],
    externalSearchAvailable: false,
  };
}

describe("truthful chat provider status", () => {
  it("rejects the legacy env-only trace that claimed a provider transport", () => {
    expect(normalizeAnalysisTrace({
      provider: {
        transport: "direct_openai",
        mode: "fallback",
        model: "gpt-unconfirmed",
      },
      steps: [],
    })).toBeUndefined();
  });

  it("drops claimed actual provider data when no response succeeded", () => {
    const normalized = normalizeAnalysisTrace({
      provider: {
        configured: true,
        attempted: true,
        succeeded: false,
        fallback: true,
        requestedTransport: "direct_openai",
        actualTransport: "direct_openai",
        requestedModel: "gpt-requested",
        actualModel: "gpt-unconfirmed",
      },
      steps: [],
    });

    expect(normalized?.provider.actualTransport).toBeNull();
    expect(normalized?.provider.actualModel).toBeNull();
  });

  it("labels a failed direct request without presenting the model as used", () => {
    const failed = trace({
      configured: true,
      attempted: true,
      requestedTransport: "direct_openai",
    });

    expect(providerStatusLabel(failed)).toBe(
      "Basisanalyse · OpenAI-Aufruf fehlgeschlagen",
    );
    expect(providerModelLabel(failed)).toBe("Angefordert: gpt-requested");
    expect(analysisDisclosure(failed)).toContain("ohne bestätigte Provider-Antwort");
  });

  it("surfaces a redacted billing or provider-quota failure", () => {
    const failed = trace({
      configured: true,
      attempted: true,
      requestedTransport: "direct_openai",
      failureCategory: "billing_or_quota",
    });

    expect(providerStatusLabel(failed)).toBe(
      "Basisanalyse · OpenAI-Abrechnung oder Provider-Limit blockiert",
    );
  });

  it("distinguishes a configured but skipped provider request", () => {
    const skipped = trace({
      configured: true,
      requestedTransport: "direct_openai",
    });

    expect(providerStatusLabel(skipped)).toBe(
      "Basisanalyse · KI-Aufruf nicht gestartet",
    );
    expect(providerModelLabel(skipped)).toBe("Vorgesehen: gpt-requested");
  });

  it("shows actual transport and response model only after a response", () => {
    const succeeded = trace({
      configured: true,
      attempted: true,
      succeeded: true,
      fallback: false,
      requestedTransport: "direct_openai",
      actualTransport: "direct_openai",
      requestedModel: "gpt-requested",
      actualModel: "gpt-response-snapshot",
    });

    expect(providerStatusLabel(succeeded)).toBe("Direkte OpenAI API");
    expect(providerModelLabel(succeeded)).toBe(
      "Antwortmodell: gpt-response-snapshot",
    );
    expect(analysisDisclosure(succeeded)).toContain("bestätigten Provider-Antwort");
  });

  it("keeps provider success and deterministic fallback independent", () => {
    const invalidOutput = trace({
      configured: true,
      attempted: true,
      succeeded: true,
      requestedTransport: "direct_openai",
      actualTransport: "direct_openai",
      actualModel: "gpt-response-snapshot",
    });

    expect(providerStatusLabel(invalidOutput)).toBe(
      "Basisanalyse · OpenAI-Antwort nicht verwendet",
    );
    expect(providerModelLabel(invalidOutput)).toBe(
      "Antwortmodell: gpt-response-snapshot",
    );
    expect(analysisDisclosure(invalidOutput)).toContain("nicht für die Strukturierung verwendet");
  });
});

describe("chat guest affordance", () => {
  it("highlights the account button only for guests", () => {
    expect(sidebarAccountButtonClassName(false)).toContain("is-guest-login");
    expect(sidebarAccountButtonClassName(true)).toBe("sidebar-account-button");
  });

  it("does not label a deterministic fallback as an AI answer", () => {
    expect(assistantAttribution()).toEqual({
      ariaLabel: "Nachricht von XPORTAL",
      author: "XPORTAL",
      badge: null,
    });
  });
});
