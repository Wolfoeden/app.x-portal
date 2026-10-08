import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  approve: vi.fn(),
  decline: vi.fn(),
  audit: vi.fn(),
  engagement: vi.fn(),
  noEngagement: vi.fn(),
  feeStatus: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireAdminUser: mocks.admin }));
vi.mock("@/lib/placement/requests", () => ({
  approvePlacementRequest: mocks.approve,
  declinePlacementRequest: mocks.decline,
}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/placement/engagements", () => ({
  recordEngagement: mocks.engagement,
  recordNoEngagement: mocks.noEngagement,
  recordFeeStatus: mocks.feeStatus,
}));

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
  mocks.engagement.mockResolvedValue({ feeMinor: 355_200, termsVersion: "v1", clientUserId: "client-1" });
  mocks.feeStatus.mockResolvedValue({ feeMinor: 355_200, clientUserId: "client-1" });
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

  it("keeps historical administration available without the old deployment flag", async () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "false");
    expect((await call({ action: "approve" })).status).toBe(200);
    expect(mocks.approve).toHaveBeenCalled();
  });

  it("records an engagement in euros and logs the fee with the client", async () => {
    const response = await call({ action: "record_engagement", dayRate: 592, projectDays: 60, startsOn: "2026-11-02" });

    expect(response.status).toBe(200);
    expect(mocks.engagement).toHaveBeenCalledWith(ID, { dayRateMinor: 59_200, projectDays: 60, startsOn: "2026-11-02" });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "placement_engaged",
        metadata: expect.objectContaining({ clientUserId: "client-1", feeMinor: 355_200 }),
      }),
    );
  });

  it("rejects an engagement without a proper start date", async () => {
    const response = await call({ action: "record_engagement", dayRate: 592, projectDays: 60, startsOn: "morgen" });

    expect(response.status).toBe(400);
    expect(mocks.engagement).not.toHaveBeenCalled();
  });

  it("marks a fee as paid", async () => {
    const response = await call({ action: "paid" });

    expect(response.status).toBe(200);
    expect(mocks.feeStatus).toHaveBeenCalledWith(ID, { status: "paid" });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "placement_fee_paid" }));
  });
});
