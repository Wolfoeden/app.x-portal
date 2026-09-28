import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  currentUser: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: mocks.currentUser }));
vi.mock("@/lib/security/shared-rate-limit", () => ({ consumeRateLimit: mocks.rateLimit }));

import { POST } from "@/app/api/profile-feedback/route";

const PROFIL_ID = "11111111-1111-4111-8111-111111111111";

function anfrage(body: unknown, origin = "https://x-portal.eu") {
  return new Request("https://x-portal.eu/api/profile-feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "sec-fetch-site": origin === "https://x-portal.eu" ? "same-origin" : "cross-site",
      "x-forwarded-for": "203.0.113.9",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.IP_HASH_SECRET = "a-secure-test-secret-that-is-long-enough";
  process.env.NEXT_PUBLIC_SITE_URL = "https://x-portal.eu";
  mocks.audit.mockResolvedValue("trace");
  mocks.currentUser.mockResolvedValue({ id: "user-1", isAnonymous: true });
  mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
});

describe("POST /api/profile-feedback", () => {
  it("hält fest, welches Profil aus welchem Grund nicht passte", async () => {
    const response = await POST(anfrage({ profileId: PROFIL_ID, reason: "price", kind: "unsuitable" }));

    expect(response.status).toBe(204);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        action: "profile_feedback_unsuitable",
        targetType: "freelancer_profile",
        targetId: PROFIL_ID,
        metadata: { reason: "price" },
      }),
    );
  });

  it("nimmt eine Rückmeldung zurück", async () => {
    await POST(anfrage({ profileId: PROFIL_ID, reason: "role", kind: "withdrawn" }));

    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "profile_feedback_withdrawn", metadata: { reason: "role" } }),
    );
  });

  it("weist unbekannte Gründe und Zusatzfelder ab", async () => {
    expect((await POST(anfrage({ profileId: PROFIL_ID, reason: "hässlich", kind: "unsuitable" }))).status).toBe(400);
    expect(
      (await POST(anfrage({ profileId: PROFIL_ID, reason: "price", kind: "unsuitable", text: "Projekt" }))).status,
    ).toBe(400);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("weist Aufrufe von fremden Seiten ab", async () => {
    const response = await POST(
      anfrage({ profileId: PROFIL_ID, reason: "price", kind: "unsuitable" }, "https://boese.example"),
    );

    expect(response.status).toBe(403);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("bremst bei zu vielen Rückmeldungen", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 120 });

    const response = await POST(anfrage({ profileId: PROFIL_ID, reason: "price", kind: "unsuitable" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
  });
});
