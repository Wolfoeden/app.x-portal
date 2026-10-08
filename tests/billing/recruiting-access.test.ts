import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), user: vi.fn(), owner: vi.fn(), add: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: mocks.user }));
vi.mock("@/lib/data/plan-teams", () => ({ findOwnerForMember: mocks.owner, addTeamMember: mocks.add, loadTeam: vi.fn(), removeTeamMember: vi.fn() }));
vi.mock("@/lib/email/deliver", () => ({ deliverEmail: vi.fn() }));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: vi.fn() }));
import { userHasPaidAccess } from "@/lib/billing/paid-access";
import { getBillingEntitlement } from "@/lib/billing/entitlements";
import { POST } from "@/app/api/team/members/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "owner", isAnonymous: false });
  mocks.owner.mockResolvedValue(null);
});
describe("server entitlement compatibility and team mutations", () => {
  it.each(["trial", "paid", "legacy"])("honors the centrally confirmed %s entitlement", async source => {
    mocks.rpc.mockResolvedValue({ data: [{ can_run_ai: false, can_use_recruiting: true, source, reason: "insufficient_credits" }], error: null });
    expect(await userHasPaidAccess("owner")).toBe(true);
    expect(await getBillingEntitlement("owner")).toMatchObject({ canRunAi: false, canUseRecruiting: true, source });
    expect(mocks.rpc).toHaveBeenCalledWith("get_recruiting_entitlement", { p_user_id: "owner" });
  });
  it.each([null, [], [{ can_use_recruiting: false, source: "none" }]])("fails closed for missing or expired entitlement %j", async data => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect(await userHasPaidAccess("owner")).toBe(false);
  });
  it("denies a new team member before account lookup or sending when billing expired", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ can_use_recruiting: false }], error: null });
    const response = await POST(new Request("https://x-portal.eu/api/team/members", { method: "POST", headers: { Origin: "https://x-portal.eu", "Content-Type": "application/json" }, body: JSON.stringify({ email: "member@example.invalid" }) }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ reason: "billing_required" });
    expect(mocks.add).not.toHaveBeenCalled();
  });
  it("propagates a failed entitlement lookup instead of granting access", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("database unavailable") });
    await expect(userHasPaidAccess("owner")).rejects.toThrow("database unavailable");
  });
});
