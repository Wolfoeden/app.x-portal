import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  discard: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireAdminUser: mocks.admin }));
vi.mock("@/lib/leadgen/leads-data", () => ({ discardOutreachDraft: mocks.discard }));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));

import { DELETE } from "@/app/api/admin/outreach/[id]/route";

const ID = "b0c04419-c861-4aa5-b64a-6eb84b658d41";

function request() {
  return new Request(`https://x-portal.eu/api/admin/outreach/${ID}`, {
    method: "DELETE",
    headers: { origin: "https://x-portal.eu", "sec-fetch-site": "same-origin" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://x-portal.eu");
  mocks.admin.mockResolvedValue({ id: "admin-1", isAdmin: true, isAnonymous: false });
  mocks.audit.mockResolvedValue(undefined);
});

// Oktober 2026: Wartende Entwürfe ließen sich im Admin nicht entfernen.
describe("DELETE /api/admin/outreach/[id]", () => {
  it("verwirft einen wartenden Entwurf", async () => {
    mocks.discard.mockResolvedValue({ discarded: true, leadId: null });
    const response = await DELETE(request(), { params: Promise.resolve({ id: ID }) });
    expect(response.status).toBe(200);
    expect(mocks.discard).toHaveBeenCalledWith(ID);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "leadgen_draft_discarded", targetId: ID }));
  });

  it("meldet einen Entwurf, der nicht mehr wartet", async () => {
    mocks.discard.mockResolvedValue({ discarded: false, leadId: null });
    const response = await DELETE(request(), { params: Promise.resolve({ id: ID }) });
    expect(response.status).toBe(404);
  });

  it("lässt nur Admins verwerfen", async () => {
    mocks.admin.mockRejectedValue(new Response("Forbidden", { status: 403 }));
    const response = await DELETE(request(), { params: Promise.resolve({ id: ID }) });
    expect(response.status).toBe(403);
    expect(mocks.discard).not.toHaveBeenCalled();
  });
});
