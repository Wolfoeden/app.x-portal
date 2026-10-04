import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  openFor: vi.fn(),
  assign: vi.fn(),
  updateStatus: vi.fn(),
  requireAdmin: vi.fn(),
  anonymous: true,
  rateAllowed: true,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    email: mocks.anonymous ? null : "Kundin@Example.invalid",
    isAnonymous: mocks.anonymous,
    isAdmin: false,
  }),
  requireAdminUser: mocks.requireAdmin,
}));
vi.mock("@/lib/security/shared-rate-limit", () => ({
  consumeRateLimit: async () => ({ allowed: mocks.rateAllowed, retryAfterSeconds: 60 }),
}));
vi.mock("@/lib/placement/mandates", () => ({
  createMandate: mocks.create,
  openMandateForProject: mocks.openFor,
  assignFreelancer: mocks.assign,
  updateMandateStatus: mocks.updateStatus,
}));

import { PATCH } from "@/app/api/admin/search-mandates/[id]/route";
import { GET, POST } from "@/app/api/search-mandates/route";
import { PLACEMENT_TERMS } from "@/lib/placement/config";
import { MANDATE_CONFIRMATION } from "@/lib/placement/mandate-model";

const PROJECT = "33333333-0000-4000-8000-000000000001";
const MANDATE = "44444444-0000-4000-8000-000000000001";
const PROFILE = "22222222-2222-4222-8222-222222222222";

function request(path: string, method: string, body?: unknown, origin = "https://x-portal.eu"): Request {
  return new Request(`https://x-portal.eu${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin,
      "sec-fetch-site": origin === "https://x-portal.eu" ? "same-origin" : "cross-site",
      "x-forwarded-for": "203.0.113.7",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const guestBody = (extra: Record<string, unknown> = {}) => ({
  projectId: PROJECT,
  placementTermsVersion: PLACEMENT_TERMS.version,
  note: "Start im November",
  guestContact: { email: "Kunde@Firma.invalid", company: "Firma GmbH", name: "Kim", phone: "+49 30 123456" },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://x-portal.eu");
  mocks.anonymous = true;
  mocks.rateAllowed = true;
  mocks.create.mockResolvedValue({ created: true, mandate: { id: MANDATE, status: "open" } });
  mocks.openFor.mockResolvedValue(null);
  mocks.requireAdmin.mockResolvedValue({ id: "admin-1", isAdmin: true });
  mocks.assign.mockResolvedValue({ requestId: "55555555-0000-4000-8000-000000000001" });
  mocks.updateStatus.mockResolvedValue(true);
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/search-mandates", () => {
  it("takes a guest's mandate with contact, phone and note", async () => {
    const response = await POST(request("/api/search-mandates", "POST", guestBody()));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ created: true, message: MANDATE_CONFIRMATION });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "11111111-1111-4111-8111-111111111111",
        isGuest: true,
        projectId: PROJECT,
        note: "Start im November",
        contact: { email: "kunde@firma.invalid", company: "Firma GmbH", name: "Kim", phone: "+49 30 123456" },
      }),
    );
  });

  it("uses the account's address for a signed-in customer", async () => {
    mocks.anonymous = false;
    const response = await POST(
      request("/api/search-mandates", "POST", {
        projectId: PROJECT,
        placementTermsVersion: PLACEMENT_TERMS.version,
        accountContact: { company: "Konto AG" },
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        isGuest: false,
        contact: { email: "kundin@example.invalid", company: "Konto AG", name: null, phone: null },
      }),
    );
  });

  it("answers an existing open mandate without creating a second one", async () => {
    mocks.create.mockResolvedValueOnce({ created: false, mandate: { id: MANDATE, status: "open" }, message: "liegt vor" });
    const response = await POST(request("/api/search-mandates", "POST", guestBody()));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ created: false, message: "liegt vor" });
  });

  it("refuses without consent to the current terms, without guest contact, or with a filled honeypot", async () => {
    expect((await POST(request("/api/search-mandates", "POST", guestBody({ placementTermsVersion: "alt" })))).status).toBe(409);
    expect((await POST(request("/api/search-mandates", "POST", guestBody({ guestContact: undefined })))).status).toBe(400);
    const trap = guestBody({ guestContact: { email: "a@b.invalid", company: "Bot GmbH", website: "http://spam.invalid" } });
    expect((await POST(request("/api/search-mandates", "POST", trap))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("limits guests per address and rejects odd phone numbers and foreign pages", async () => {
    mocks.rateAllowed = false;
    expect((await POST(request("/api/search-mandates", "POST", guestBody()))).status).toBe(429);
    mocks.rateAllowed = true;
    const phone = guestBody({ guestContact: { email: "a@b.invalid", company: "Firma", phone: "<script>" } });
    expect((await POST(request("/api/search-mandates", "POST", phone))).status).toBe(400);
    expect((await POST(request("/api/search-mandates", "POST", guestBody(), "https://evil.invalid"))).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does not exist without the placement model", async () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "false");
    expect((await POST(request("/api/search-mandates", "POST", guestBody()))).status).toBe(404);
    expect((await GET(request(`/api/search-mandates?projectId=${PROJECT}`, "GET"))).status).toBe(404);
  });

  it("reports a failure without details", async () => {
    mocks.create.mockRejectedValueOnce(new Error("relation search_mandates does not exist"));
    const response = await POST(request("/api/search-mandates", "POST", guestBody()));
    expect(response.status).toBe(500);
    expect((await response.json()).error).not.toMatch(/relation/u);
  });
});

describe("GET /api/search-mandates", () => {
  it("tells the chat whether a mandate already exists", async () => {
    mocks.openFor.mockResolvedValueOnce({ id: MANDATE, status: "open" });
    const response = await GET(request(`/api/search-mandates?projectId=${PROJECT}`, "GET"));
    expect((await response.json()).mandate).toMatchObject({ id: MANDATE });
  });
});

describe("PATCH /api/admin/search-mandates/[id]", () => {
  const params = { params: Promise.resolve({ id: MANDATE }) };

  it("assigns a freelancer or sets a status, for admins only", async () => {
    const assigned = await PATCH(request(`/api/admin/search-mandates/${MANDATE}`, "PATCH", { assignProfileId: PROFILE }), params);
    expect(assigned.status).toBe(200);
    expect(mocks.assign).toHaveBeenCalledWith(MANDATE, PROFILE, "admin-1");

    const closed = await PATCH(request(`/api/admin/search-mandates/${MANDATE}`, "PATCH", { status: "closed" }), params);
    expect(closed.status).toBe(200);
    expect(mocks.updateStatus).toHaveBeenCalledWith(MANDATE, "closed", "admin-1");

    mocks.requireAdmin.mockRejectedValueOnce(new Response("Forbidden", { status: 403 }));
    expect((await PATCH(request(`/api/admin/search-mandates/${MANDATE}`, "PATCH", { status: "closed" }), params)).status).toBe(403);
  });

  it("rejects unknown statuses and reports a second open mandate as a conflict", async () => {
    expect((await PATCH(request(`/api/admin/search-mandates/${MANDATE}`, "PATCH", { status: "bezahlt" }), params)).status).toBe(400);
    mocks.updateStatus.mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: "23505" }));
    expect((await PATCH(request(`/api/admin/search-mandates/${MANDATE}`, "PATCH", { status: "open" }), params)).status).toBe(409);
  });
});
