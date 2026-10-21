import { afterEach, describe, expect, it, vi } from "vitest";

import { applicationInsertFromInput, FreelancerApplicationInputSchema, profileInsertFromDecision, type ApplicationRow } from "@/lib/freelancer/application";
import { applicationReceivedMessage, profileLiveMessage } from "@/lib/freelancer/application-mails";
import {
  AUTO_PUBLISH_BLOCKER_TEXT,
  autoPublishDecision,
  autoPublishEnabled,
  type AutoPublishBlocker,
} from "@/lib/freelancer/auto-publish";

const COMPLETE: ApplicationRow = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  status: "submitted",
  submitted_by_user_id: "11111111-2222-4333-8444-555555555555",
  full_name: "Lena Berger",
  contact_email: "lena@example.com",
  contact_phone: null,
  website_url: null,
  role_title: "KI-Engineer (LLM, RAG)",
  experience_summary: "Ich baue RAG-Systeme und KI-Agenten für Versicherer und Banken, von der Idee bis zum Betrieb.",
  skills: ["RAG", "LangChain", "Python"],
  languages: ["Deutsch", "Englisch"],
  qualifications: [],
  industries: [],
  location_text: "München",
  work_modes: ["remote", "hybrid"],
  monthly_salary_minor: null,
  hourly_rate_minor: null,
  day_rate_minor: 95_000,
  currency: "EUR",
  availability_status: "available",
  availability_from: null,
  booking_url: null,
  applicant_note: null,
  cv_storage_path: null,
  cv_original_filename: null,
  cv_mime_type: null,
  cv_size_bytes: null,
  consent_at: "2026-10-21T10:00:00.000Z",
  source: "apply_form",
  seeking: "projects",
  referral: null,
  review_notes: null,
  reviewed_by_user_id: null,
  reviewed_at: null,
  published_profile_id: null,
  created_at: "2026-10-21T10:00:00.000Z",
  updated_at: "2026-10-21T10:00:00.000Z",
};

const CONTEXT = { emailConfirmed: true, duplicate: false, rejectedBefore: false };

function blockersFor(overrides: Partial<ApplicationRow>, context = CONTEXT): AutoPublishBlocker[] {
  const outcome = autoPublishDecision({ ...COMPLETE, ...overrides }, context);
  return outcome.ok ? [] : outcome.blockers;
}

// Sofort sichtbar (21.10.2026): Eine vollständige Bewerbung geht ohne
// Sichtung live, als Angabe des Freelancers; alles andere wartet.
describe("self-publishing a complete application", () => {
  it("publishes as an unverified profile without verified facts or a downloadable CV", () => {
    const outcome = autoPublishDecision(COMPLETE, CONTEXT);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.decision.verificationStatus).toBe("unverified");
    expect(outcome.decision.verifiedFacts).toEqual([]);
    expect(outcome.decision.cvDownloadable).toBe(false);
    expect(outcome.decision.usePhoto).toBe(false);
    expect(outcome.decision.dayRate).toBe(950);
    expect(outcome.decision.bookingUrl).toBeNull();
    expect(outcome.decision.reviewNotes).toContain("Automatisch veröffentlicht");

    const row = profileInsertFromDecision(outcome.decision, { slug: "lena-berger", checkedAt: COMPLETE.created_at, ownerUserId: COMPLETE.submitted_by_user_id });
    expect(row.owner_user_id).toBe(COMPLETE.submitted_by_user_id);
    expect(row.verified_facts).toEqual([]);
    expect(row.verification_status).toBe("unverified");
    expect(row.profile_status).toBe("active");
  });

  it("waits for the team when the address is not confirmed", () => {
    expect(blockersFor({}, { ...CONTEXT, emailConfirmed: false })).toEqual(["email_unconfirmed"]);
  });

  it("waits when the name or the account already has a profile", () => {
    expect(blockersFor({}, { ...CONTEXT, duplicate: true })).toEqual(["duplicate"]);
  });

  it("does not let a second submission undo a rejection", () => {
    expect(blockersFor({}, { ...CONTEXT, rejectedBefore: true })).toEqual(["rejected_before"]);
  });

  it("checks the rate against the usual range, in euro only", () => {
    expect(blockersFor({ day_rate_minor: 25_000 })).toEqual(["rate"]);
    expect(blockersFor({ day_rate_minor: 250_000 })).toEqual(["rate"]);
    expect(blockersFor({ day_rate_minor: null, hourly_rate_minor: 9_500 })).toEqual([]);
    expect(blockersFor({ day_rate_minor: null, hourly_rate_minor: 3_000 })).toEqual(["rate"]);
    expect(blockersFor({ currency: "USD" })).toEqual(["currency"]);
  });

  it("leaves people looking for a permanent job to the team", () => {
    expect(blockersFor({ seeking: "employment", day_rate_minor: null, monthly_salary_minor: 650_000 })).toEqual(["employment"]);
  });

  it("needs a role, a short text, a skill, a language and a work mode", () => {
    expect(blockersFor({ role_title: " " })).toEqual(["role"]);
    expect(blockersFor({ experience_summary: "KI." })).toEqual(["summary"]);
    expect(blockersFor({ skills: [] })).toEqual(["skills"]);
    expect(blockersFor({ languages: [] })).toEqual(["languages"]);
    expect(blockersFor({ work_modes: [] })).toEqual(["work_modes"]);
    expect(blockersFor({ availability_status: "unavailable" })).toEqual(["unavailable"]);
  });

  it("names every reason in plain words", () => {
    for (const text of Object.values(AUTO_PUBLISH_BLOCKER_TEXT)) expect(text).toMatch(/\.$/u);
    expect(AUTO_PUBLISH_BLOCKER_TEXT.rate).toContain("320–2.000 € pro Tag");
  });
});

describe("the emergency brake", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is on unless FREELANCER_AUTO_PUBLISH=off", () => {
    vi.stubEnv("FREELANCER_AUTO_PUBLISH", "");
    expect(autoPublishEnabled()).toBe(true);
    vi.stubEnv("FREELANCER_AUTO_PUBLISH", "off");
    expect(autoPublishEnabled()).toBe(false);
  });
});

describe("optional consents", () => {
  const base = {
    fullName: "Lena Berger",
    contactEmail: "lena@example.com",
    roleTitle: "KI-Engineer",
    experienceSummary: "",
    dayRate: "950",
    consent: true,
  };

  it("stay off unless ticked and travel with the application", () => {
    const off = FreelancerApplicationInputSchema.parse(base);
    expect(applicationInsertFromInput(off, { submittedByUserId: null, consentAt: "now" })).toMatchObject({ consent_search_index: false, consent_market_stats: false });
    const on = FreelancerApplicationInputSchema.parse({ ...base, consentSearchIndex: true, consentMarketStats: true });
    expect(applicationInsertFromInput(on, { submittedByUserId: null, consentAt: "now" })).toMatchObject({ consent_search_index: true, consent_market_stats: true });
  });

  it("accept an application without a CV", () => {
    expect(FreelancerApplicationInputSchema.parse(base).cv).toBeNull();
  });
});

describe("mails to applicants", () => {
  it("links the live profile and the portal", () => {
    const mail = profileLiveMessage({ name: "Lena Berger", profileUrl: "https://x-portal.eu/profil/abc", portalUrl: "https://x-portal.eu/bewerber-portal/apply", reviewed: false });
    expect(mail.subject).toBe("Ihr Profil bei XPORTAL ist online");
    expect(mail.text).toContain("Guten Tag Lena Berger,");
    expect(mail.text).toContain("https://x-portal.eu/profil/abc");
    expect(mail.text).toContain("Angaben laut Freelancer");
    expect(profileLiveMessage({ name: "Lena", profileUrl: "u", portalUrl: "p", reviewed: true }).text).toContain("Unser Team hat Ihr Profil gesichtet.");
  });

  it("says why the team looks first, or just that it does", () => {
    const withReasons = applicationReceivedMessage({ name: "Lena", reasons: [AUTO_PUBLISH_BLOCKER_TEXT.summary], portalUrl: "p" });
    expect(withReasons.text).toContain(`- ${AUTO_PUBLISH_BLOCKER_TEXT.summary}`);
    const plain = applicationReceivedMessage({ name: "Lena", reasons: [], portalUrl: "p" });
    expect(plain.text).toContain("sieht es sich jemand aus unserem Team an.");
    expect(plain.text).not.toContain("\n- ");
  });
});
