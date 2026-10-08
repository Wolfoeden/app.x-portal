import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), stripe: vi.fn(), customer: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: mocks.user }));
vi.mock("@/lib/billing/stripe-api", () => ({ stripeRequest: mocks.stripe }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.customer }) }) }),
  }),
}));

import { POST } from "@/app/api/billing/portal/route";

const portalConfiguration = {
  active: true,
  features: {
    payment_method_update: { enabled: true },
    invoice_history: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end" },
  },
};
const request = () => new Request("https://x-portal.eu/api/billing/portal", {
  method: "POST", headers: { origin: "https://x-portal.eu", "content-type": "application/json" }, body: "{}",
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.user.mockResolvedValue({ id: "10000000-0000-4000-8000-000000000001", isAnonymous: false });
  mocks.customer.mockResolvedValue({ data: { stripe_customer_id: "cus_Test" }, error: null });
});

describe("Stripe customer portal", () => {
  it("uses the account's default portal when no configuration ID is set", async () => {
    vi.stubEnv("STRIPE_RECRUITING_PORTAL_CONFIGURATION_ID", "");
    mocks.stripe.mockImplementation(async (method: string, path: string) => {
      if (path === "/billing_portal/configurations") return { data: [{ id: "bpc_Default" }] };
      if (path === "/billing_portal/configurations/bpc_Default") return portalConfiguration;
      if (path === "/billing_portal/sessions") return { url: "https://billing.stripe.com/p/session/test" };
      throw new Error(`unexpected ${method} ${path}`);
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://billing.stripe.com/p/session/test" });
    expect(mocks.stripe).toHaveBeenCalledWith("POST", "/billing_portal/sessions", expect.objectContaining({ configuration: "bpc_Default" }));
  });

  it("still refuses a default portal that cancels immediately", async () => {
    vi.stubEnv("STRIPE_RECRUITING_PORTAL_CONFIGURATION_ID", "");
    mocks.stripe.mockImplementation(async (_method: string, path: string) => {
      if (path === "/billing_portal/configurations") return { data: [{ id: "bpc_Default" }] };
      return { ...portalConfiguration, features: { ...portalConfiguration.features, subscription_cancel: { enabled: true, mode: "immediately" } } };
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "portal_configuration_mismatch" });
  });
});
