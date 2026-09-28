import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  currentUser: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/security/shared-rate-limit", () => ({ consumeRateLimit: mocks.rateLimit }));

import { POST } from "@/app/api/funnel-events/route";

const EVENT_KEY = "11111111-1111-4111-8111-111111111111";
const FUNNEL_ID = "22222222-2222-4222-8222-222222222222";

function anfrage(event: string, outcome: string | null = null) {
  return new Request("https://x-portal.eu/api/funnel-events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://x-portal.eu",
      "sec-fetch-site": "same-origin",
      "x-forwarded-for": "203.0.113.9",
    },
    body: JSON.stringify({
      eventKey: EVENT_KEY,
      funnelId: FUNNEL_ID,
      event,
      entry: "direct",
      device: "desktop",
      outcome,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.IP_HASH_SECRET = "a-secure-test-secret-that-is-long-enough";
  process.env.NEXT_PUBLIC_SITE_URL = "https://x-portal.eu";
  mocks.audit.mockResolvedValue("trace");
  mocks.currentUser.mockResolvedValue({ id: "user-1", isAnonymous: true });
  mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
});

describe("POST /api/funnel-events", () => {
  it("zählt die Preisseite mit dem Anlass, aus dem sie geöffnet wurde", async () => {
    const response = await POST(anfrage("pricing_viewed", "recherche"));

    expect(response.status).toBe(204);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        action: "signup_funnel_pricing_viewed",
        metadata: expect.objectContaining({ result: "recherche", account: "guest" }),
      }),
    );
  });

  // Von der Startseite aus hat noch niemand einen Gastzugang. Ohne diese
  // Ausnahme fehlten genau die Besucher, die sich erst informieren.
  it("zählt die Preisseite auch ohne Sitzung", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await POST(anfrage("pricing_viewed", "direkt"));

    expect(response.status).toBe(204);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: null,
        metadata: expect.objectContaining({ account: "none" }),
      }),
    );
  });

  it("verlangt für alle anderen Stufen weiterhin eine Sitzung", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await POST(anfrage("search_started"));

    expect(response.status).toBe(401);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  // Der Endpunkt ist für die Preisseite ohne Anmeldung offen. Was dort
  // ankommt, ist deshalb auf die drei Anlässe beschränkt, die die Seite kennt.
  it("nimmt für die Preisseite nur die bekannten Anlässe an", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await POST(anfrage("pricing_viewed", "beliebiger Text"));

    expect(response.status).toBe(400);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("lehnt unbekannte Stufen ab", async () => {
    const response = await POST(anfrage("checkout_completed"));

    expect(response.status).toBe(400);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
