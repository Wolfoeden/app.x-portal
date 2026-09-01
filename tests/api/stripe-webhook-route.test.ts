import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

import { POST } from "@/app/api/stripe/webhook/route";
import { CREDIT_PLANS } from "@/lib/ai/credit-policy";

const SECRET = "whsec_test";
const ACCOUNT = "a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

function body(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: "evt_1",
    type: "checkout.session.completed",
    data: { object: { client_reference_id: ACCOUNT } },
    ...overrides,
  });
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
  mocks.rpc.mockResolvedValue({ data: [{ activated: true, credits_total: 3_000 }], error: null });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/stripe/webhook", () => {
  it("schaltet den bezahlten Plan für das genannte Konto frei", async () => {
    const response = await POST(request(body()));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("activate_paid_plan", {
      p_event_id: "evt_1",
      p_event_type: "checkout.session.completed",
      p_user_id: ACCOUNT,
      p_plan_id: CREDIT_PLANS.enterprise.id,
      p_plan_allowance: CREDIT_PLANS.enterprise.monthlyCredits,
    });
  });

  /**
   * Die Signatur ist das Einzige, was diesen Endpunkt schützt — `assertSameOrigin`
   * greift nicht, weil Stripe aus einem fremden Ursprung aufruft. Wer sie
   * umgehen könnte, verschaffte sich ein Enterprise-Konto.
   */
  it("schaltet nichts frei, wenn die Signatur nicht stimmt", async () => {
    const response = await POST(request(body(), { secret: "whsec_falsch" }));

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("schaltet nichts frei, wenn der Körper nachträglich verändert wurde", async () => {
    const signed = request(body());
    const tampered = new Request(signed.url, {
      method: "POST",
      headers: signed.headers,
      body: body({ data: { object: { client_reference_id: "00000000-0000-4000-8000-000000000000" } } }),
    });

    expect((await POST(tampered)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("schaltet nichts frei, wenn kein Secret gesetzt ist", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;

    expect((await POST(request(body()))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("weist einen abgelaufenen Aufruf zurück", async () => {
    expect((await POST(request(body(), { skew: -3_600 }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  // Eine Fehlerantwort liesse Stripe endlos wiederholen.
  it("bestätigt fremde Ereignisse, statt sie abzulehnen", async () => {
    const response = await POST(request(body({ type: "invoice.paid" })));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ignored: "invoice.paid" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  // Eine Zahlung ohne zuordenbares Konto loest sich nicht durch Wiederholen.
  it("bestätigt eine Zahlung ohne Kontokennung, statt sie zu wiederholen", async () => {
    for (const reference of [undefined, "", "kein-uuid", 42]) {
      vi.clearAllMocks();
      const response = await POST(
        request(body({ data: { object: { client_reference_id: reference } } })),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ assigned: false });
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  });

  // Ein zweiter Zustellversuch darf kein zweites Kontingent buchen.
  it("meldet eine Wiederholung als nicht erneut freigeschaltet", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ activated: false, credits_total: 3_000 }], error: null });

    const response = await POST(request(body()));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ activated: false });
  });

  // Hier hilft ein erneuter Zustellversuch tatsaechlich.
  it("bittet um Wiederholung, wenn die Datenbank nicht mitspielt", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "down" } });

    expect((await POST(request(body()))).status).toBe(503);
  });

  it("verrät nicht, woran die Signaturprüfung gescheitert ist", async () => {
    const response = await POST(request(body(), { secret: "whsec_falsch" }));
    const payload = (await response.json()) as { error?: string };

    expect(payload.error).not.toMatch(/mismatch|secret|too_old|malformed/iu);
  });
});
