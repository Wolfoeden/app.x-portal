import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sync: vi.fn(), rpc: vi.fn(), deliver: vi.fn(), audit: vi.fn(), placement: vi.fn(), user: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/deliver", () => ({ deliverEmail: mocks.deliver }));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/placement/invoices", () => ({ recordPlacementInvoicePaid: mocks.placement }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: () => ({ rpc: mocks.rpc, auth: { admin: { getUserById: mocks.user } } }) }));
vi.mock("@/lib/billing/subscription", async (original) => ({ ...await original<typeof import("@/lib/billing/subscription")>(), syncStripeSubscription: mocks.sync }));
import { POST } from "@/app/api/stripe/webhook/route";
import { CREDIT_PLANS } from "@/lib/billing/plans";

const secret = "whsec_test";
function signed(type: string, object: Record<string, unknown>, wrong = false) {
  const body = JSON.stringify({ id: "evt_Test", type, data: { object } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", wrong ? "wrong" : secret).update(`${timestamp}.${body}`).digest("hex");
  return new Request("https://x-portal.eu/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": `t=${timestamp},v1=${signature}` }, body });
}
beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
  mocks.sync.mockResolvedValue({ userId: "10000000-0000-4000-8000-000000000001", plan: CREDIT_PLANS.pro,
    isRecruiting: true, trialActivated: false, paidActivated: false, firstPayment: false, cancelled: false });
  mocks.rpc.mockResolvedValue({ data: [{ linked: true }], error: null });
  mocks.user.mockResolvedValue({ data: { user: { email: "test@example.com" } }, error: null });
  mocks.deliver.mockResolvedValue({ delivered: true });
  mocks.audit.mockResolvedValue("audit");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("signed subscription webhook routing", () => {
  it("rejects signature before canonical fetch or database call", async () => {
    expect((await POST(signed("invoice.paid", { id: "in_Test", subscription: "sub_Test" }, true))).status).toBe(400);
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("passes new completed Checkout to server verification, never activating from URL", async () => {
    const response = await POST(signed("checkout.session.completed", { id: "cs_live_a1B2c3", subscription: "sub_Test", metadata: { xportal_kind: "recruiting_subscription_v1" } }));
    expect(response.status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith("sub_Test", "evt_Test", "checkout.session.completed", "cs_live_a1B2c3");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.trial_will_end"])("re-fetches canonical state for %s", async (type) => {
    expect((await POST(signed(type, { id: "sub_Test", status: "active", cancel_at_period_end: false }))).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith("sub_Test", "evt_Test", type, undefined);
  });
  it.each(["invoice.paid", "invoice.payment_failed", "invoice.payment_action_required", "invoice.finalization_failed"])("uses shared reconciliation for %s", async (type) => {
    expect((await POST(signed(type, { id: "in_Test", subscription: "sub_Test" }))).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith("sub_Test", "evt_Test", type, undefined);
  });
  it("does not count zero/repeated invoices when canonical sync granted no period", async () => {
    await POST(signed("invoice.paid", { id: "in_Zero", amount_paid: 0, subscription: "sub_Test" }));
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("records actual first paid activation and sends SaaS terms confirmation", async () => {
    mocks.sync.mockResolvedValue({ userId: "account", plan: CREDIT_PLANS.pro, isRecruiting: true, paidActivated: true, firstPayment: true });
    expect((await POST(signed("invoice.paid", { id: "in_Paid", subscription: "sub_Test" }))).status).toBe(200);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "billing_subscription_paid", metadata: expect.objectContaining({ first: true }) }));
    expect(mocks.deliver).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("saas-2026-10-1") }));
  });
  it("keeps failures retryable until canonical persistence succeeds", async () => {
    mocks.sync.mockRejectedValue(new Error("db down"));
    expect((await POST(signed("invoice.paid", { id: "in_Test", subscription: "sub_Test" }))).status).toBe(503);
  });
  it("preserves historical placement invoice settlement", async () => {
    mocks.placement.mockResolvedValue({ introId: "intro", clientUserId: "user", feeMinor: 100 });
    expect((await POST(signed("invoice.paid", { id: "in_Historic", metadata: { xportal_kind: "placement_fee" } }))).status).toBe(200);
    expect(mocks.placement).toHaveBeenCalledWith("in_Historic");
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("acknowledges unrelated events without work", async () => {
    expect((await POST(signed("charge.refunded", { id: "ch_Test" }))).status).toBe(200);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
});
