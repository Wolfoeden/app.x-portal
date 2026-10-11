import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  create: vi.fn(),
  open: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: mocks.user }));
vi.mock("@/lib/placement/mandates", () => ({ createMandate: mocks.create, openMandateForProject: mocks.open }));
vi.mock("@/lib/security/shared-rate-limit", () => ({ consumeRateLimit: mocks.rateLimit }));

import { GET, POST } from "@/app/api/search-mandates/route";
import { SEARCH_MANDATE_CONSENT_VERSION } from "@/lib/placement/mandate-model";

const PROJECT = "22222222-2222-4222-8222-222222222222";

function post(body: unknown) {
  return POST(new Request("https://x-portal.eu/api/search-mandates", {
    method: "POST",
    headers: { origin: "https://x-portal.eu", "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  mocks.user.mockResolvedValue({ id: "guest-1", isAnonymous: true, email: null });
  mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  mocks.create.mockResolvedValue({ created: true, mandate: { id: "mandate-1", status: "open" } });
  mocks.open.mockResolvedValue(null);
});

describe("search mandate route", () => {
  it("keeps an open mandate readable for its project", async () => {
    mocks.open.mockResolvedValue({ id: "historical", status: "open" });
    const response = await GET(new Request(`https://x-portal.eu/api/search-mandates?projectId=${PROJECT}`));
    expect((await response.json()).mandate).toMatchObject({ id: "historical" });
  });

  it("takes a guest's project with only an e-mail address", async () => {
    const response = await post({ projectId: PROJECT, consentVersion: SEARCH_MANDATE_CONSENT_VERSION, guestContact: { email: "Kunde@Firma.de" } });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ created: true, message: expect.stringContaining("48 Stunden") });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: "guest-1", isGuest: true, projectId: PROJECT,
      contact: { email: "kunde@firma.de", company: null, name: null, phone: null },
    }));
  });

  it("uses the account address for a registered user after an analysis", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", isAnonymous: false, email: "Recruiter@Agentur.de" });
    const response = await post({ projectId: PROJECT, consentVersion: SEARCH_MANDATE_CONSENT_VERSION });

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT, contact: expect.objectContaining({ email: "recruiter@agentur.de" }),
    }));
  });

  it("refuses without the consent to be contacted", async () => {
    const response = await post({ projectId: PROJECT, guestContact: { email: "kunde@firma.de" } });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("kontaktieren");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  // Seit Oktober 2026 gibt es keinen Auftrag aus bloß eingefügtem Text mehr.
  it("refuses a pasted text without an analysed project", async () => {
    const response = await post({ brief: "Wir suchen ab November einen React-Entwickler, remote.", consentVersion: SEARCH_MANDATE_CONSENT_VERSION, guestContact: { email: "kunde@firma.de" } });
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("drops a bot that fills the hidden field", async () => {
    const response = await post({ projectId: PROJECT, consentVersion: SEARCH_MANDATE_CONSENT_VERSION, guestContact: { email: "bot@spam.de", website: "https://spam.example" } });
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("asks a guest for an address", async () => {
    const response = await post({ projectId: PROJECT, consentVersion: SEARCH_MANDATE_CONSENT_VERSION });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("E-Mail");
  });
});
