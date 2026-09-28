import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  approve: vi.fn(),
  decline: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireAdminUser: mocks.admin }));
vi.mock("@/lib/placement/requests", () => ({
  approvePlacementRequest: mocks.approve,
  declinePlacementRequest: mocks.decline,
}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));

import { POST } from "@/app/api/admin/introductions/[id]/route";

const ID = "66666666-6666-4666-8666-666666666666";

function call(body: unknown) {
  return POST(
    new Request(`https://x-portal.eu/api/admin/introductions/${ID}`, {
      method: "POST",
      headers: { origin: "https://x-portal.eu", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ID }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
  process.env.NEXT_PUBLIC_SITE_URL = "https://x-portal.eu";
  mocks.admin.mockResolvedValue({ id: "admin-1", isAdmin: true, isAnonymous: false });
  mocks.approve.mockResolvedValue({ freelancerReachable: true, freelancerNotified: true, clientNotified: true, hasCalendar: true });
  mocks.decline.mockResolvedValue({ clientNotified: true });
  mocks.audit.mockResolvedValue("trace");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/admin/introductions/[id]", () => {
  it("introduces and records who did it", async () => {
    const response = await call({ action: "approve" });

    expect(response.status).toBe(200);
    expect(mocks.approve).toHaveBeenCalledWith(ID, expect.any(String));
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: "admin-1", action: "placement_introduced", targetId: ID }),
    );
  });

  it("declines with the reason for the client", async () => {
    const response = await call({ action: "decline", reason: "  Ausgebucht.  " });

    expect(response.status).toBe(200);
    expect(mocks.decline).toHaveBeenCalledWith(ID, "Ausgebucht.", expect.any(String));
  });

  it("is only for admins", async () => {
    mocks.admin.mockRejectedValue(new Response("Forbidden", { status: 403 }));

    const response = await call({ action: "approve" });

    expect(response.status).toBe(403);
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it("rejects unknown actions", async () => {
    const response = await call({ action: "bill" });

    expect(response.status).toBe(400);
  });

  it("does not exist without the switch", async () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "false");

    const response = await call({ action: "approve" });

    expect(response.status).toBe(404);
    expect(mocks.approve).not.toHaveBeenCalled();
  });
});
