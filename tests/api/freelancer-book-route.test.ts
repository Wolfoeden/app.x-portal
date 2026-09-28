import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  destination: vi.fn(),
  event: vi.fn(),
  rateLimit: vi.fn(),
  currentUser: vi.fn(),
  allowed: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/freelancer/profile-data", () => ({
  loadBookingDestination: mocks.destination,
  recordFreelancerProfileEvent: mocks.event,
}));
vi.mock("@/lib/security/shared-rate-limit", () => ({
  consumeRateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/placement/requests", () => ({ placementBookingAllowed: mocks.allowed }));

import { GET } from "@/app/api/freelancers/[id]/book/route";

const PROFIL_ID = "11111111-1111-4111-8111-111111111111";

function aufruf(query = "") {
  return GET(new Request(`https://x-portal.eu/api/freelancers/${PROFIL_ID}/book${query}`), {
    params: Promise.resolve({ id: PROFIL_ID }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.audit.mockResolvedValue("trace");
  mocks.event.mockResolvedValue(true);
  mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  mocks.destination.mockResolvedValue({
    displayName: "Beispiel",
    url: "https://calendly.com/beispiel",
  });
  mocks.currentUser.mockResolvedValue(null);
  mocks.allowed.mockResolvedValue(false);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/freelancers/[id]/book", () => {
  it("führt ohne Anmeldung zum Kalender und zählt den Klick", async () => {
    const response = await aufruf();

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://calendly.com/beispiel");
    expect(mocks.event).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "booking_click", source: "booking_link" }),
    );
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("ordnet einen Klick aus der Akquise-Mail der Mail zu", async () => {
    const response = await aufruf("?via=lead");

    expect(response.status).toBe(302);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "lead_email_booking_click",
        actorUserId: null,
        targetId: PROFIL_ID,
      }),
    );
  });

  it("zählt nichts, wenn die Klickbremse greift, und leitet trotzdem weiter", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });

    const response = await aufruf("?via=lead");

    expect(response.status).toBe(302);
    expect(mocks.event).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("antwortet mit 404, wenn das Profil nicht mehr buchbar ist", async () => {
    mocks.destination.mockResolvedValue(null);

    const response = await aufruf("?via=lead");

    expect(response.status).toBe(404);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

describe("GET /api/freelancers/[id]/book im Vermittlungsmodell", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
  });

  // Der Kalender vor der Vorstellung wäre der Weg an der Anfrage vorbei.
  it("schickt ohne Vorstellung zur Anfrage statt in den Kalender", async () => {
    const response = await aufruf("?via=lead");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://x-portal.eu/chat?booking=request");
    expect(mocks.destination).not.toHaveBeenCalled();
    expect(mocks.event).not.toHaveBeenCalled();
  });

  it("öffnet den Kalender nach der Vorstellung", async () => {
    const kunde = { id: "kunde", isAdmin: false, isAnonymous: false };
    mocks.currentUser.mockResolvedValue(kunde);
    mocks.allowed.mockResolvedValue(true);

    const response = await aufruf();

    expect(mocks.allowed).toHaveBeenCalledWith(kunde, PROFIL_ID);
    expect(response.headers.get("location")).toBe("https://calendly.com/beispiel");
  });

  it("bleibt ohne Schalter beim direkten Weg", async () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "false");

    const response = await aufruf();

    expect(mocks.allowed).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://calendly.com/beispiel");
  });
});
