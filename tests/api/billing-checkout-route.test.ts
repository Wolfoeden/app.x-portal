import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  writeAuditEvent: vi.fn(),
  startCheckout: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.writeAuditEvent }));
vi.mock("@/lib/billing/subscription", () => ({
  BillingError: class extends Error {},
  checkoutPlan: (value: string) => ["basic", "pro", "business"].includes(value) ? value : null,
  startSubscriptionCheckout: mocks.startCheckout,
}));

import { GET } from "@/app/api/billing/checkout/route";

const accountId = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({
    id: accountId,
    isAnonymous: false,
  });
  mocks.writeAuditEvent.mockResolvedValue("trace");
  mocks.startCheckout.mockResolvedValue("https://checkout.stripe.com/c/pay/cs_Test");
});

function recordedCheckout() {
  return mocks.writeAuditEvent.mock.calls.map(([input]) => ({
    actorUserId: input.actorUserId,
    action: input.action,
    metadata: input.metadata,
  }));
}

describe("canonical pricing checkout route", () => {
  it("sends a permanent account directly to the selected Stripe checkout", async () => {
    const response = await GET(
      new Request("https://x-portal.eu/api/billing/checkout?plan=pro"),
    );
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(303);
    expect(`${location.origin}${location.pathname}`).toBe(
      "https://checkout.stripe.com/c/pay/cs_Test",
    );
    expect(mocks.startCheckout).toHaveBeenCalledWith(accountId, "pro", "https://x-portal.eu");
    expect(recordedCheckout()).toEqual([
      {
        actorUserId: accountId,
        action: "billing_checkout_started",
        metadata: { plan: "pro", result: "stripe" },
      },
    ]);
  });

  // Der Messpunkt darf den Weg zu Stripe nie aufhalten.
  it("still sends the account to Stripe when the measurement cannot be written", async () => {
    mocks.writeAuditEvent.mockRejectedValue(new Error("audit down"));

    const response = await GET(
      new Request("https://x-portal.eu/api/billing/checkout?plan=pro"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("https://checkout.stripe.com/");
  });

  it("sends guests through login while retaining the chosen plan", async () => {
    mocks.requireCurrentUser.mockResolvedValue({
      id: accountId,
      isAnonymous: true,
    });

    const response = await GET(
      new Request("https://x-portal.eu/api/billing/checkout?plan=basic"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://x-portal.eu/chat?checkout=basic",
    );
    expect(recordedCheckout()).toEqual([
      {
        actorUserId: accountId,
        action: "billing_checkout_started",
        metadata: { plan: "basic", result: "login_required" },
      },
    ]);
  });

  it("sends signed-out visitors through login while retaining the chosen plan", async () => {
    mocks.requireCurrentUser.mockRejectedValue(
      new Response("Authentication required", { status: 401 }),
    );

    const response = await GET(
      new Request("https://x-portal.eu/api/billing/checkout?plan=business"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://x-portal.eu/chat?checkout=business",
    );
  });

  it("keeps production redirects on x-portal.eu behind Netlify's internal host", async () => {
    mocks.requireCurrentUser.mockRejectedValue(
      new Response("Authentication required", { status: 401 }),
    );

    const response = await GET(
      new Request(
        "https://main--app-x-portal-chat.netlify.app/api/billing/checkout?plan=pro",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://x-portal.eu/chat?checkout=pro",
    );
  });
  it("rejects unknown plan names before checking authentication", async () => {
    const response = await GET(
      new Request("https://x-portal.eu/api/billing/checkout?plan=enterprise"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://x-portal.eu/preise?billing=invalid-plan",
    );
    expect(mocks.requireCurrentUser).not.toHaveBeenCalled();
    expect(mocks.writeAuditEvent).not.toHaveBeenCalled();
  });
});
