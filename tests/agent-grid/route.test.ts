import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  rateLimit: vi.fn(),
  requireAdmin: vi.fn(),
  tracked: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({
  requireAdminUser: mocks.requireAdmin,
}));
vi.mock("@/lib/security/shared-rate-limit", () => ({
  consumeRateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/agent-grid/ai", () => ({
  AGENT_GRID_MODEL: "test-model",
  analyzeProcessWithAi: mocks.analyze,
  estimateAgentGridTokens: () => ({
    inputTokens: 200,
    outputTokens: 400,
    expectedOutputTokens: 160,
  }),
}));
vi.mock("@/lib/ai/gateway", () => ({
  executeTrackedAiRequest: mocks.tracked,
}));

import { POST } from "@/app/api/agent-grid/analyze/route";
import { DEMO_CURRENT_BLUEPRINT } from "@/lib/agent-grid/blueprint";

const VALID_BODY = {
  requestId: "request-12345678",
  mode: "current",
  useCase: "Mieter-Service",
  company: "Beispiel GmbH",
  cards: [],
  newNote: "Mieteranfragen kommen per Outlook.",
  currentBlueprint: null,
};

function request(body: unknown, origin = "https://x-portal.eu") {
  return new Request("https://x-portal.eu/api/agent-grid/analyze", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "sec-fetch-site": origin === "https://x-portal.eu" ? "same-origin" : "cross-site",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000001",
  });
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.analyze.mockResolvedValue({
    ok: true,
    value: { blueprint: DEMO_CURRENT_BLUEPRINT, suggestedCards: [] },
    providerAttempted: true,
    usage: {
      requestedModel: "test-model",
      actualModel: "test-model",
      providerResponseId: "resp_test",
      inputTokens: 10,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 10,
      totalTokens: 20,
    },
  });
  mocks.tracked.mockImplementation(async (input: {
    operation: (allowed: boolean) => Promise<{ value: unknown }>;
  }) => {
    const result = await input.operation(true);
    return { value: result.value };
  });
});

describe("agent-grid analysis route", () => {
  it("rejects a cross-site request before authentication or provider work", async () => {
    const response = await POST(request(VALID_BODY, "https://attacker.example"));

    expect(response.status).toBe(403);
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("preserves the existing admin authorization boundary", async () => {
    mocks.requireAdmin.mockRejectedValue(new Response("Forbidden", { status: 403 }));

    const response = await POST(request(VALID_BODY));

    expect(response.status).toBe(403);
    expect(mocks.tracked).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("runs an authorized analysis through the existing usage gateway", async () => {
    const response = await POST(request(VALID_BODY));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      blueprint: DEMO_CURRENT_BLUEPRINT,
      suggestedCards: [],
    });
    expect(mocks.tracked).toHaveBeenCalledWith(
      expect.objectContaining({
        isAdmin: true,
        purpose: "analysis",
        requestedModel: "test-model",
      }),
    );
    expect(mocks.analyze).toHaveBeenCalledWith(
      VALID_BODY,
      expect.any(String),
      true,
    );
  });

  it("keeps the last client state intact by returning a safe invalid-output error", async () => {
    mocks.analyze.mockResolvedValue({
      ok: false,
      code: "invalid_output",
      providerStatus: "provider_error",
      providerAttempted: true,
      providerUsageDefinitelyZero: false,
    });

    const response = await POST(request(VALID_BODY));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      code: "invalid_output",
      error: expect.stringContaining("Eingaben bleiben erhalten"),
    });
  });
});
