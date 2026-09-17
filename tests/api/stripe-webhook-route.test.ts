import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
  getUserById: vi.fn(),
  deliver: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/deliver", () => ({ deliverEmail: mocks.deliver }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    rpc: mocks.rpc,
    from: mocks.from,
    auth: { admin: { getUserById: mocks.getUserById } },
  }),
}));

import { POST } from "@/app/api/stripe/webhook/route";
import { CREDIT_PLANS } from "@/lib/ai/credit-policy";
import { TERMS_VERSION } from "@/lib/legal/policy";

const SECRET = "whsec_test";
const ACCOUNT = "a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const PERIOD_START = 1_799_000_000;
const PERIOD_END = 1_801_678_400;

function event(type: string, object: Record<string, unknown>, id = "evt_1") {
  return JSON.stringify({ id, type, data: { object } });
}

function checkoutObject(overrides: Record<string, unknown> = {}) {
  return {
    client_reference_id: ACCOUNT,
    payment_link: "plink_pro",
    customer: "cus_1",
    subscription: "sub_1",
    ...overrides,
  };
}

function invoiceObject(overrides: Record<string, unknown> = {}) {
  return {
    id: "in_1",
    customer: "cus_1",
    subscription: "sub_1",
    lines: {
      data: [{ price: { id: "price_pro" }, period: { start: PERIOD_START, end: PERIOD_END } }],
    },
    ...overrides,
  };
}

function request(raw: string, { secret = SECRET, skew = 0 } = {}) {
  const timestamp = Math.floor(Date.now() / 1000) + skew;
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`, "utf8")
    .digest("hex");
  return new Request("https://x-portal.eu/api/stripe/webhook", {
    method: "POST",
    headers: {
      "stripe-signature": `t=${timestamp},v1=${signature}`,
      "Content-Type": "application/json",
    },
    body: raw,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.STRIPE_FIXED_PLANS_ACTIVATION_ENABLED = "true";
  process.env.STRIPE_PRO_PAYMENT_LINK_ID = "plink_pro";
  process.env.STRIPE_PRO_PRICE_ID = "price_pro";

  mocks.rpc.mockImplementation((name: string) => {
    if (name === "link_stripe_subscription_checkout") {
      return Promise.resolve({ data: [{ linked: true }], error: null });
    }
    if (name === "activate_paid_plan") {
      return Promise.resolve({
        data: [{ activated: true, credits_total: 1_250, was_first_payment: true }],
        error: null,
      });
    }
    return Promise.resolve({ data: [{ recorded: true }], error: null });
  });
  mocks.maybeSingle.mockResolvedValue({
    data: { user_id: ACCOUNT, stripe_plan_id: "pro" },
    error: null,
  });
  mocks.from.mockReturnValue({
    select: () => ({
      eq: () => ({ maybeSingle: mocks.maybeSingle }),
    }),
  });
  mocks.getUserById.mockResolvedValue({
    data: { user: { email: "buchhaltung@example.com" } },
    error: null,
  });
  mocks.deliver.mockResolvedValue({ delivered: true });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.STRIPE_FIXED_PLANS_ACTIVATION_ENABLED;
  delete process.env.STRIPE_PRO_PAYMENT_LINK_ID;
  delete process.env.STRIPE_PRO_PRICE_ID;
  vi.restoreAllMocks();
});

describe("POST /api/stripe/webhook", () => {
  it("verknüpft den Checkout, ohne dabei Credits oder eine Bestätigung zu erzeugen", async () => {
    const response = await POST(request(event("checkout.session.completed", checkoutObject())));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("link_stripe_subscription_checkout", {
      p_event_id: "evt_1",
      p_event_type: "checkout.session.completed",
      p_user_id: ACCOUNT,
      p_plan_id: CREDIT_PLANS.pro.id,
      p_stripe_customer_id: "cus_1",
      p_stripe_subscription_id: "sub_1",
      p_terms_version: TERMS_VERSION,
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith("activate_paid_plan", expect.anything());
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("setzt Credits erst nach einer bezahlten Rechnung und verwendet deren Zeitraum", async () => {
    const response = await POST(request(event("invoice.paid", invoiceObject())));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("activate_paid_plan", {
      p_event_id: "evt_1",
      p_event_type: "invoice.paid",
      p_user_id: ACCOUNT,
      p_plan_id: CREDIT_PLANS.pro.id,
      p_plan_allowance: CREDIT_PLANS.pro.monthlyCredits,
      p_period_start: new Date(PERIOD_START * 1_000).toISOString(),
      p_period_end: new Date(PERIOD_END * 1_000).toISOString(),
      p_stripe_customer_id: "cus_1",
      p_stripe_subscription_id: "sub_1",
      p_invoice_id: "in_1",
    });
    expect(mocks.deliver).toHaveBeenCalledTimes(1);
  });

  it("verschickt bei einer Verlängerung keine neue Vertragsbestätigung", async () => {
    mocks.rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === "activate_paid_plan"
        ? [{ activated: true, was_first_payment: false }]
        : [{ recorded: true }],
      error: null,
    }));

    await POST(request(event("invoice.paid", invoiceObject())));

    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("markiert eine fehlgeschlagene Rechnung, ohne Credits neu zu setzen", async () => {
    const response = await POST(request(event("invoice.payment_failed", invoiceObject())));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("record_stripe_subscription_status", {
      p_event_id: "evt_1",
      p_event_type: "invoice.payment_failed",
      p_stripe_subscription_id: "sub_1",
      p_status: "past_due",
      p_cancel_at_period_end: null,
      p_latest_invoice_id: "in_1",
      p_latest_invoice_status: "payment_failed",
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith("activate_paid_plan", expect.anything());
  });

  it.each([
    ["customer.subscription.updated", "active", true],
    ["customer.subscription.deleted", "canceled", false],
  ])("speichert %s als Abonnementstatus", async (type, status, cancelAtPeriodEnd) => {
    const response = await POST(request(event(type, {
      id: "sub_1",
      status: "active",
      cancel_at_period_end: true,
    })));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("record_stripe_subscription_status", {
      p_event_id: "evt_1",
      p_event_type: type,
      p_stripe_subscription_id: "sub_1",
      p_status: status,
      p_cancel_at_period_end: cancelAtPeriodEnd,
      p_latest_invoice_id: null,
      p_latest_invoice_status: null,
    });
  });

  it("wartet per Stripe-Retry auf die Checkout-Zuordnung einer bekannten Rechnung", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    expect((await POST(request(event("invoice.paid", invoiceObject())))).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalledWith("activate_paid_plan", expect.anything());
  });

  it("wartet auch bei einem vorgezogenen Statusereignis auf die Checkout-Zuordnung", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST(request(event("customer.subscription.updated", {
      id: "sub_1",
      status: "active",
      items: { data: [{ price: { id: "price_pro" } }] },
    })));

    expect(response.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("ignoriert Rechnungen mit einer nicht freigegebenen Price-ID", async () => {
    const response = await POST(request(event("invoice.paid", invoiceObject({
      lines: { data: [{ price: { id: "price_fremd" } }] },
    }))));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ignored: "unknown_price" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("schaltet nichts frei, wenn die Signatur nicht stimmt", async () => {
    const response = await POST(request(
      event("checkout.session.completed", checkoutObject()),
      { secret: "whsec_falsch" },
    ));

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("schaltet nichts frei, wenn der Körper nachträglich verändert wurde", async () => {
    const signed = request(event("checkout.session.completed", checkoutObject()));
    const tampered = new Request(signed.url, {
      method: "POST",
      headers: signed.headers,
      body: event("checkout.session.completed", checkoutObject({
        client_reference_id: "00000000-0000-4000-8000-000000000000",
      })),
    });

    expect((await POST(tampered)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("weist Aufrufe ohne Secret oder mit abgelaufener Signatur zurück", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect((await POST(request(event("checkout.session.completed", checkoutObject())))).status).toBe(400);
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    expect((await POST(request(
      event("checkout.session.completed", checkoutObject()),
      { skew: -3_600 },
    ))).status).toBe(400);
  });

  it("bestätigt fremde Ereignisse, statt Stripe sinnlos wiederholen zu lassen", async () => {
    const response = await POST(request(event("charge.refunded", { id: "ch_1" })));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ignored: "charge.refunded" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("verrät nicht, woran die Signaturprüfung gescheitert ist", async () => {
    const response = await POST(request(
      event("checkout.session.completed", checkoutObject()),
      { secret: "whsec_falsch" },
    ));
    const payload = (await response.json()) as { error?: string };

    expect(payload.error).not.toMatch(/mismatch|secret|too_old|malformed/iu);
  });

  it("bestätigt Stripe auch dann, wenn die Vertragsmail nicht rausgeht", async () => {
    mocks.deliver.mockResolvedValue({ delivered: false, reason: "send_failed" });

    const response = await POST(request(event("invoice.paid", invoiceObject())));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ activated: true });
  });
});
