import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deliver: vi.fn(),
  booking: vi.fn(),
  audit: vi.fn(),
  inserted: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/deliver", () => ({ deliverEmail: mocks.deliver }));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    email: "kundin@example.invalid",
    isAnonymous: false,
    isAdmin: false,
  }),
}));

/**
 * Ein Bauchladen, der auf jede Kettenmethode sich selbst zurückgibt und am
 * Ende das liefert, was für die angefragte Tabelle hinterlegt ist. Die Route
 * stellt fünf verschiedene Abfragen; sie einzeln nachzubauen hieße, die
 * Reihenfolge der Aufrufe mitzutesten, und das ist nicht die Frage hier.
 */
function tabelle(antwort: () => unknown) {
  const kette: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(kette, {
    get(_ziel, name) {
      if (name === "insert") {
        return (zeile: unknown) => {
          mocks.inserted.push(zeile);
          return proxy;
        };
      }
      // Die Kette selbst muss abwartbar sein: Das Update auf `projects`
      // endet auf `.eq()` und wird direkt awaited, ohne `single()`.
      if (name === "then") {
        return (...args: Parameters<Promise<unknown>["then"]>) =>
          Promise.resolve(antwort()).then(...args);
      }
      if (name === "maybeSingle" || name === "single") {
        return async () => antwort();
      }
      return () => proxy;
    },
  });
  return proxy;
}

const PROFIL = {
  id: "22222222-2222-4222-8222-222222222222",
  dataVersion: "2026-01-01",
  demoStatus: "real",
  profileStatus: "active",
  avatarUrl: null,
  displayName: "Mira Falk",
  role: "Senior Data Engineer",
  skillTags: [],
  languages: [],
  locations: [],
  workModes: [],
  availability: { status: "available", availableFrom: null, noticeDays: null },
  rate: { currency: "EUR", hourly: null, daily: null, negotiable: true },
  seniorityYears: 8,
  summary: "Baut Datenstrecken.",
  highlights: [],
  references: [],
  certifications: [],
  contact: { email: null, website: null, linkedin: null },
  introPolicy: { type: "manual_approval" },
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: (name: string) => {
      if (name === "projects") {
        return tabelle(() => ({
          data: { id: "33333333-3333-4333-8333-333333333333" },
          error: null,
        }));
      }
      if (name === "matches") {
        return tabelle(() => ({
          data: { id: "44444444-4444-4444-8444-444444444444", profile_snapshot: PROFIL },
          error: null,
        }));
      }
      if (name === "freelancer_profiles") {
        return tabelle(() => ({
          data: {
            intro_policy: "manual_approval",
            booking_url: null,
            demo_status: "real",
            profile_status: "active",
            availability_status: "available",
          },
          error: null,
        }));
      }
      if (name === "intro_bookings") return tabelle(() => mocks.booking());
      return tabelle(() => ({ data: null, error: null }));
    },
  }),
}));

vi.mock("@/lib/domain", () => ({
  FreelancerProfileSchema: { parse: (wert: unknown) => wert },
}));

import { GET, POST } from "@/app/api/introductions/route";
import { contactInbox } from "@/lib/contact/messages";

function anfrage(extra: Record<string, unknown> = {}) {
  return new Request("https://x-portal.eu/api/introductions", {
    method: "POST",
    headers: {
      origin: "https://x-portal.eu",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      projectId: "33333333-3333-4333-8333-333333333333",
      profileId: "22222222-2222-4222-8222-222222222222",
      idempotencyKey: "wiederholbar-1234",
      ...extra,
    }),
  }) as never;
}

describe("Vorstellungsanfrage meldet sich beim Betreiber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
    process.env.NEXT_PUBLIC_SITE_URL = "https://x-portal.eu";
    mocks.deliver.mockResolvedValue({ delivered: true });
  });

  it("schickt eine Mail, wenn die Vorstellung von Hand freigegeben werden muss", async () => {
    mocks.booking.mockReturnValue({
      data: {
        id: "55555555-5555-4555-8555-555555555555",
        status: "manual_review",
        booking_url: null,
        intro_policy_snapshot: "manual_approval",
        requested_at: new Date().toISOString(),
      },
      error: null,
    });

    const response = await POST(anfrage());
    expect(response.status).toBe(200);

    expect(mocks.deliver).toHaveBeenCalledTimes(1);
    const nachricht = mocks.deliver.mock.calls[0][0];
    expect(nachricht.to).toBe(contactInbox());
    expect(nachricht.kind).toBe("transactional");
    expect(nachricht.subject).toContain("Mira Falk");
    // Ohne die anfragende Person ist die Meldung nutzlos: Der Betreiber
    // antwortet ihr direkt, eine Oberfläche dafür gibt es nicht mehr.
    expect(nachricht.text).toContain("kundin@example.invalid");
    expect(nachricht.text).toContain("Senior Data Engineer");
  });

  it("meldet dieselbe Anfrage kein zweites Mal", async () => {
    // Der Upsert gibt bei einer Wiederholung die alte Zeile zurück — mitsamt
    // ihrem ursprünglichen Zeitpunkt. Daran hängt die Unterscheidung.
    mocks.booking.mockReturnValue({
      data: {
        id: "55555555-5555-4555-8555-555555555555",
        status: "manual_review",
        booking_url: null,
        intro_policy_snapshot: "manual_approval",
        requested_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      },
      error: null,
    });

    const response = await POST(anfrage());
    expect(response.status).toBe(200);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("schweigt, wenn die Vorstellung ohne Freigabe gebucht werden kann", async () => {
    mocks.booking.mockReturnValue({
      data: {
        id: "55555555-5555-4555-8555-555555555555",
        status: "ready_to_book",
        booking_url: "https://calendly.example.invalid/mira",
        intro_policy_snapshot: "free",
        requested_at: new Date().toISOString(),
      },
      error: null,
    });

    const response = await POST(anfrage());
    expect(response.status).toBe(200);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("lässt die Anfrage gelten, auch wenn die Meldung nicht rausgeht", async () => {
    // Die Anfrage steht in der Tabelle. Ein Fehler beim Melden darf die
    // Kundin nicht in eine Fehlerseite laufen lassen, die sie zum zweiten
    // Absenden bringt.
    mocks.deliver.mockResolvedValue({ delivered: false, reason: "smtp_down" });
    mocks.booking.mockReturnValue({
      data: {
        id: "55555555-5555-4555-8555-555555555555",
        status: "manual_review",
        booking_url: null,
        intro_policy_snapshot: "manual_approval",
        requested_at: new Date().toISOString(),
      },
      error: null,
    });

    const response = await POST(anfrage());
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { introduction: { id: string } };
    expect(payload.introduction.id).toBe("55555555-5555-4555-8555-555555555555");
  });
});

describe("Anfrage im Vermittlungsmodell", () => {
  const VERSION = "vermittlung-2026-09-entwurf-1";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inserted.length = 0;
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
    mocks.deliver.mockResolvedValue({ delivered: true });
    mocks.audit.mockResolvedValue("trace");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("nimmt ohne Zustimmung zur aktuellen Fassung keine Anfrage an", async () => {
    const ohne = await POST(anfrage());
    const alt = await POST(anfrage({ placementTermsVersion: "vermittlung-alt" }));

    expect(ohne.status).toBe(409);
    expect(alt.status).toBe(409);
    expect(mocks.inserted).toEqual([]);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("legt die Anfrage zur Vorstellung an und hält die Zustimmung vorher fest", async () => {
    mocks.booking
      .mockReturnValueOnce({ data: null, error: null })
      .mockReturnValueOnce({
        data: { id: "66666666-6666-4666-8666-666666666666", status: "manual_review", requested_at: new Date().toISOString() },
        error: null,
      });

    const response = await POST(anfrage({ placementTermsVersion: VERSION }));
    expect(response.status).toBe(200);

    // Die Zustimmung steht im Protokoll, bevor die Anfrage existiert.
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "placement_terms_accepted",
        targetType: "intro_booking",
        required: true,
        metadata: expect.objectContaining({ version: VERSION, feePercent: 10 }),
      }),
    );
    const zeile = mocks.inserted[0] as Record<string, unknown>;
    expect(zeile).toMatchObject({
      status: "manual_review",
      intro_policy_snapshot: "manual_approval",
      booking_url: null,
    });
    expect(zeile.id).toBe(mocks.audit.mock.calls[0][0].targetId);

    const nachricht = mocks.deliver.mock.calls[0][0];
    expect(nachricht.subject).toBe("Vermittlungsanfrage: Mira Falk");
    expect(nachricht.text).toContain("/chat/admin/vermittlungen");
    expect(nachricht.text).toContain("Freelancer-E-Mail: fehlt");
  });

  // Der bisherige Upsert hätte eine schon vorgestellte Anfrage beim zweiten
  // Klick wieder auf „wartet“ gesetzt.
  it("überschreibt eine bestehende Anfrage nicht", async () => {
    mocks.booking.mockReturnValueOnce({
      data: { id: "66666666-6666-4666-8666-666666666666", status: "ready_to_book", requested_at: "2026-09-20T10:00:00.000Z" },
      error: null,
    });

    const response = await POST(anfrage({ placementTermsVersion: VERSION }));
    const payload = (await response.json()) as { introduction: { status: string } };

    expect(payload.introduction.status).toBe("ready_to_book");
    expect(mocks.inserted).toEqual([]);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("meldet den Stand einer Anfrage für den Dialog", async () => {
    mocks.booking.mockReturnValueOnce({
      data: { id: "66666666-6666-4666-8666-666666666666", status: "manual_review", requested_at: "2026-09-28T10:00:00.000Z", confirmed_at: null },
      error: null,
    });

    const response = await GET(
      new Request(
        "https://x-portal.eu/api/introductions?projectId=33333333-3333-4333-8333-333333333333&profileId=22222222-2222-4222-8222-222222222222",
      ),
    );
    const payload = (await response.json()) as { introduction: { status: string } };

    expect(payload.introduction.status).toBe("manual_review");
  });

  it("gibt es ohne Schalter nicht", async () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "false");

    const response = await GET(
      new Request(
        "https://x-portal.eu/api/introductions?projectId=33333333-3333-4333-8333-333333333333&profileId=22222222-2222-4222-8222-222222222222",
      ),
    );

    expect(response.status).toBe(404);
  });
});
