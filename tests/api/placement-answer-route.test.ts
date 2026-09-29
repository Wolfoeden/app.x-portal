import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  audit: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/placement/engagements", () => ({ recordAnswer: mocks.record }));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/security/shared-rate-limit", () => ({ consumeRateLimit: mocks.rateLimit }));

import { POST } from "@/app/api/placement/answer/route";

function call(body: unknown, origin = "https://x-portal.eu") {
  return POST(
    new Request("https://x-portal.eu/api/placement/answer", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "sec-fetch-site": origin === "https://x-portal.eu" ? "same-origin" : "cross-site",
        "x-forwarded-for": "203.0.113.9",
      },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://x-portal.eu");
  vi.stubEnv("IP_HASH_SECRET", "a-secure-test-secret-that-is-long-enough");
  mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  mocks.audit.mockResolvedValue("trace");
  mocks.record.mockResolvedValue({ recorded: true, requestId: "req-1", clientUserId: "client-1", role: "client" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/placement/answer", () => {
  it("stores the answer and logs it against the request", async () => {
    const response = await call({ token: "token-abcdefgh", answer: "engaged" });

    expect(response.status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith("token-abcdefgh", "engaged", expect.any(String));
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "placement_outcome_reported",
        targetId: "req-1",
        metadata: expect.objectContaining({ role: "client", answer: "engaged", clientUserId: "client-1" }),
      }),
    );
  });

  it("accepts only the three answers", async () => {
    const response = await call({ token: "token-abcdefgh", answer: "maybe" });

    expect(response.status).toBe(400);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("is not reachable from another site", async () => {
    const response = await call({ token: "token-abcdefgh", answer: "engaged" }, "https://evil.example");

    expect(response.status).toBe(403);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("does not exist without the switch", async () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "false");

    const response = await call({ token: "token-abcdefgh", answer: "engaged" });

    expect(response.status).toBe(404);
  });
});
