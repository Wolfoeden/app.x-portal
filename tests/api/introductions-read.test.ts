import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ row: null as Record<string, unknown> | null, from: vi.fn(), contact: vi.fn(), eq: vi.fn(), retry: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: async () => ({ id: "owner" }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/placement/contact-delivery", () => ({ approvedRecruitingContact: mocks.contact }));
import { GET } from "@/app/api/introductions/route";
const url = "https://x-portal.eu/api/introductions?projectId=22222222-2222-4222-8222-222222222222&profileId=33333333-3333-4333-8333-333333333333";
beforeEach(() => {
  vi.clearAllMocks(); mocks.row = null; mocks.retry = false;
  mocks.from.mockImplementation((table: string) => {
    const chain = {
      select: () => chain, eq: (...args: unknown[]) => { mocks.eq(...args); return chain; },
      order: () => chain, in: () => chain,
      limit: () => table === "intro_bookings" ? chain : Promise.resolve({ data: mocks.retry ? [{ id: "delivery" }] : [], error: null }),
      maybeSingle: async () => ({ data: mocks.row, error: null }),
    };
    return chain;
  });
  mocks.contact.mockResolvedValue({ email: "approved@example.invalid", name: "Freelancer", bookingUrl: null });
});
describe("owner-scoped private contact read", () => {
  it("filters ownership and never loads another user's contact", async () => {
    const response = await GET(new Request(url));
    expect(await response.json()).toEqual({ introduction: null });
    expect(mocks.eq).toHaveBeenCalledWith("owner_user_id", "owner");
    expect(mocks.contact).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it.each([
    { commercial_model: "no_fee", status: "requested", freelancer_consented_at: null },
    { commercial_model: "no_fee", status: "cancelled", freelancer_consented_at: "2026-10-08" },
    { commercial_model: "legacy_placement", status: "ready_to_book", freelancer_consented_at: "2026-10-08" },
  ])("does not expose private contact without a current no-fee consent: %j", async row => {
    mocks.row = { id: "intro", ...row };
    expect((await (await GET(new Request(url))).json()).introduction.contact).toBeNull();
    expect(mocks.contact).not.toHaveBeenCalled();
  });
  it("shows approved data and retry status even when the confirmation email failed", async () => {
    mocks.row = { id: "intro", commercial_model: "no_fee", status: "ready_to_book", freelancer_consented_at: "2026-10-08" };
    mocks.retry = true;
    const result = await (await GET(new Request(url))).json();
    expect(result.introduction).toMatchObject({ deliveryNeedsRetry: true, contact: { email: "approved@example.invalid" } });
    expect(mocks.contact).toHaveBeenCalledWith("intro");
    expect(mocks.eq).toHaveBeenCalledWith("intro_booking_id", "intro");
  });
});
