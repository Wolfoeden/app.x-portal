import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: mocks.currentUser }));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/freelancer/profile-data", () => ({
  updateOwnedFreelancerProfile: mocks.update,
  loadFreelancerPortalState: vi.fn(),
  deleteOwnedFreelancerProfile: vi.fn(),
}));

import { PATCH } from "@/app/api/freelancer/profile/route";

const profile = {
  displayName: "Anna Beispiel",
  roleTitle: "Senior Frontend-Entwicklerin",
  experienceSummary: "Ich baue Frontends für Banken und Versicherungen, zuletzt ein Designsystem.",
  skills: ["React"],
  languages: ["Deutsch"],
  qualifications: [],
  industries: [],
  locationText: null,
  workModes: ["remote"],
  monthlySalary: 6500,
  hourlyRate: null,
  dayRate: null,
  currency: "EUR",
  availabilityStatus: "available",
  availabilityFrom: null,
  bookingUrl: "",
  profileStatus: "active",
  version: 3,
};

function request(body: unknown) {
  return new Request("https://x-portal.eu/api/freelancer/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "https://x-portal.eu", "sec-fetch-site": "same-origin" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://x-portal.eu");
  mocks.currentUser.mockResolvedValue({ id: "owner-1", isAnonymous: false });
  mocks.update.mockImplementation(async (_userId: string, input: Record<string, unknown>) => ({ id: "profile-1", ...input, version: 4 }));
});

// Oktober 2026: Nach der Prüfung pflegt der Freelancer sein Profil selbst,
// etwa das Honorar.
describe("PATCH /api/freelancer/profile", () => {
  it("saves a profile that only states a monthly salary", async () => {
    const response = await PATCH(request(profile));
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith("owner-1", expect.objectContaining({ monthlySalary: 6500, dayRate: null }));
  });

  it("tells the owner why a save failed instead of a generic error", async () => {
    mocks.update.mockRejectedValue(new Response("Das Profil wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu und speichern Sie dann erneut.", { status: 409 }));
    const response = await PATCH(request(profile));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("Bitte laden Sie die Seite neu");
  });

  it("is sent the monthly salary by the dashboard, so a save does not erase it", () => {
    const source = readFileSync("app/bewerber-portal/apply/FreelancerPortal.tsx", "utf8");
    const body = source.slice(source.indexOf('appPath("/api/freelancer/profile"), {\n        method: "PATCH"'));
    expect(body.slice(0, 2_000)).toContain("monthlySalary: profile.monthlySalary");
  });
});
