import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  diagnose: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/auth/current-user", () => ({
  requireAdminUser: mocks.requireAdmin,
}));
vi.mock("@/lib/openai", () => ({
  diagnoseOpenAiProvider: mocks.diagnose,
}));

import { GET } from "@/app/api/admin/ai-provider/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000001",
  });
  mocks.audit.mockResolvedValue("audit-id");
});

describe("admin AI provider diagnostic route", () => {
  it("returns only the redacted, non-generative provider result", async () => {
    mocks.diagnose.mockResolvedValue({
      configured: true,
      transport: "direct_openai",
      requestedModel: "gpt-5.6-terra",
      status: "reachable",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      configured: true,
      transport: "direct_openai",
      requestedModel: "gpt-5.6-terra",
      status: "reachable",
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai_provider_diagnostic_viewed",
        outcome: "success",
        required: true,
      }),
    );
  });

  it("preserves an authorization response without running diagnostics", async () => {
    mocks.requireAdmin.mockRejectedValue(
      new Response("Forbidden", { status: 403 }),
    );

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.diagnose).not.toHaveBeenCalled();
  });

  it("returns a safe failure without provider details", async () => {
    mocks.diagnose.mockResolvedValue({
      configured: true,
      transport: "direct_openai",
      requestedModel: "gpt-5.6-terra",
      status: "billing_or_quota",
      httpStatus: 429,
      requestId: "req_safe",
    });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "billing_or_quota",
      httpStatus: 429,
      requestId: "req_safe",
    });
  });
});
