import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), change: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: mocks.user }));
vi.mock("@/lib/freelancer/profile-data", () => ({ changeOwnedProfileState: mocks.change }));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: vi.fn().mockResolvedValue("trace") }));

import { POST } from "@/app/api/freelancer/profile/status/route";
import { FreelancerDashboard } from "@/app/bewerber-portal/apply/FreelancerPortal";
import { freelancerActions, parseFreelancerPresence } from "@/lib/freelancer/presence";
import type { EditableFreelancerProfile } from "@/lib/freelancer/portal";

const PROFILE = "a10f78f8-e6ec-47d2-aee9-7fd97b86c9d4";
const labels = (presence: Parameters<typeof freelancerActions>[0]) => freelancerActions(presence).map((action) => action.label);

// Oktober 2026: Wer schon Freelancer ist, sieht sein Profil, nicht die
// Aufforderung, sich zu bewerben.
describe("freelancer actions by state", () => {
  it("invites to apply only without application or profile", () => {
    expect(labels({ kind: "none" })).toEqual(["Als Freelancer bewerben"]);
    expect(labels({ kind: "application", status: "in_review" })).toEqual(["Bewerbung ansehen"]);
    expect(labels({ kind: "application", status: "rejected" })).toEqual(["Bewerbung überarbeiten"]);
  });

  it("offers view, edit and push for a visible profile", () => {
    const actions = freelancerActions({ kind: "profile", profileId: PROFILE, visible: true });
    expect(actions.map((action) => action.label)).toEqual(["Profil ansehen", "Profil bearbeiten", "Profil pushen"]);
    expect(actions[0]).toMatchObject({ href: `/profil/${PROFILE}?via=share` });
    expect(actions.map((action) => action.label)).not.toContain("Als Freelancer bewerben");
  });

  it("offers publishing for a paused profile", () => {
    expect(labels({ kind: "profile", profileId: PROFILE, visible: false })).toEqual(["Profil veröffentlichen", "Profil bearbeiten"]);
  });

  it("reads only well-formed presence from a session answer", () => {
    expect(parseFreelancerPresence({ kind: "profile", profileId: PROFILE, visible: true })).toEqual({ kind: "profile", profileId: PROFILE, visible: true });
    expect(parseFreelancerPresence({ kind: "application", status: "hacked" })).toEqual({ kind: "none" });
    expect(parseFreelancerPresence(undefined)).toEqual({ kind: "none" });
  });
});

describe("freelancer dashboard", () => {
  const profile = {
    id: PROFILE, displayName: "Anna Beispiel", roleTitle: "UX Consultant", experienceSummary: "x".repeat(60),
    skills: ["Figma"], languages: ["Deutsch"], qualifications: [], industries: [], locationText: "Berlin",
    workModes: ["remote"], monthlySalary: null, hourlyRate: null, dayRate: 900, currency: "EUR",
    availabilityStatus: "available", availabilityFrom: null, bookingUrl: "", profileStatus: "active",
    verificationStatus: "operator_verified", avatarUrl: null, version: 3,
  } as unknown as EditableFreelancerProfile;
  const metrics = { profileViewsTotal: 0, profileViews30Days: 0, bookingClicksTotal: 0, bookingClicks30Days: 0 };

  it("shows the profile actions instead of the old Aktiv/Pausiert switch", () => {
    const html = renderToStaticMarkup(createElement(FreelancerDashboard, { initialProfile: profile, metrics, preview: true }));
    for (const label of ["Profil ansehen", "Profil bearbeiten", "Profil pushen", "Pausieren"]) expect(html).toContain(label);
    expect(html).toContain('id="profil-bearbeiten"');
    expect(html).not.toContain("Als Freelancer bewerben");
  });

  it("offers publishing first when paused", () => {
    const html = renderToStaticMarkup(createElement(FreelancerDashboard, { initialProfile: { ...profile, profileStatus: "paused" }, metrics, preview: true }));
    expect(html).toContain("Profil veröffentlichen");
    expect(html).not.toContain("Profil pushen");
  });
});

describe("profile status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "user-1", isAnonymous: false });
    mocks.change.mockResolvedValue({ profileStatus: "active", version: 5, availabilityUpdatedAt: "2026-10-11T10:00:00.000Z" });
  });
  const post = (body: unknown) => POST(new Request("https://x-portal.eu/api/freelancer/profile/status", {
    method: "POST", headers: { origin: "https://x-portal.eu", "content-type": "application/json" }, body: JSON.stringify(body),
  }));

  it("pushes the profile and returns the new version", async () => {
    const response = await post({ command: "push" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ version: 5, message: expect.stringContaining("Verfügbarkeit bestätigt") });
    expect(mocks.change).toHaveBeenCalledWith("user-1", "push");
  });

  it("refuses guests and unknown commands", async () => {
    mocks.user.mockResolvedValue({ id: "guest", isAnonymous: true });
    expect((await post({ command: "publish" })).status).toBe(403);
    mocks.user.mockResolvedValue({ id: "user-1", isAnonymous: false });
    expect((await post({ command: "delete" })).status).toBe(400);
    expect(mocks.change).not.toHaveBeenCalled();
  });
});
