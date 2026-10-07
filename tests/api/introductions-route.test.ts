import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ access: true, anonymous: false, allowed: true, create: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: async () => ({ id: "11111111-1111-4111-8111-111111111111", email: state.anonymous ? null : "client@example.invalid", isAnonymous: state.anonymous, isAdmin: false }) }));
vi.mock("@/lib/billing/entitlements", () => ({ userHasRecruitingAccess: async () => state.access }));
vi.mock("@/lib/placement/recruiting-contacts", () => ({ createRecruitingContact: state.create }));
vi.mock("@/lib/security/shared-rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: state.allowed, retryAfterSeconds: 60 }) }));
import { POST } from "@/app/api/introductions/route";
function request(extra: Record<string, unknown> = {}, origin = "https://x-portal.eu") {
  return new Request("https://x-portal.eu/api/introductions", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ projectId: "22222222-2222-4222-8222-222222222222", profileId: "33333333-3333-4333-8333-333333333333", idempotencyKey: "recruiting-test-key", contactConsent: true, ...extra }) });
}
beforeEach(() => { vi.clearAllMocks(); state.access = true; state.anonymous = false; state.allowed = true; state.create.mockResolvedValue({ created: true, introduction: { commercialModel: "no_fee", status: "requested" } }); });
describe("new recruiting contact authorization", () => {
  it("accepts an active trial or paid account with explicit contact consent", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect((await response.json()).introduction.commercialModel).toBe("no_fee");
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ contactConsent: true }));
  });
  it("requires explicit contact consent independently of historical fee wording", async () => {
    expect((await POST(request({ contactConsent: false, placementTermsVersion: "vermittlung-2026-09-1" }))).status).toBe(400);
    expect(state.create).not.toHaveBeenCalled();
  });
  it("denies anonymous, expired, and over-limit new requests", async () => {
    state.anonymous = true; expect((await POST(request())).status).toBe(401);
    state.anonymous = false; state.access = false; expect((await POST(request())).status).toBe(402);
    state.access = true; state.allowed = false; expect((await POST(request())).status).toBe(429);
    expect(state.create).not.toHaveBeenCalled();
  });
  it("blocks cross-origin mutation", async () => {
    expect((await POST(request({}, "https://foreign.invalid"))).status).toBe(403);
    expect(state.create).not.toHaveBeenCalled();
  });
  it("preserves idempotent existing responses and downstream ownership checks", async () => {
    state.create.mockResolvedValue({ created: false, introduction: { commercialModel: "legacy_placement", status: "ready_to_book" } });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).introduction.commercialModel).toBe("legacy_placement");
    state.create.mockRejectedValue(new Response("Projekt nicht gefunden.", { status: 404 }));
    expect((await POST(request())).status).toBe(404);
  });
});
