import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { FREELANCER_CV_BUCKET } from "@/lib/data/freelancer-cvs";
import {
  mapFreelancerProfileRow,
  type FreelancerProfileRow,
} from "@/lib/data/freelancers";
import { CV_BUCKET, CV_MAX_BYTES, CV_MIME_TYPES } from "@/lib/freelancer/limits";
import {
  applicationInsertFromInput,
  candidateFacts,
  decisionDefaultsFromApplication,
  FreelancerApplicationInputSchema,
  profileInsertFromDecision,
  PublishDecisionSchema,
  slugFromName,
  slugWithAttempt,
  type ApplicationRow,
} from "@/lib/freelancer/application";

function applicationPayload(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Jörg Müller",
    contactEmail: "Joerg@Example.com",
    roleTitle: "Senior Frontend-Entwickler",
    experienceSummary:
      "Seit zwölf Jahren baue ich Frontends für Handelsplattformen, zuletzt eine Bestellstrecke mit React und TypeScript.",
    skills: ["React", "TypeScript"],
    languages: ["Deutsch", "Englisch"],
    workModes: ["remote", "hybrid"],
    hourlyRate: "95.50",
    currency: "EUR",
    bookingUrl: "https://calendly.com/joerg-mueller/30min",
    consent: true,
    ...overrides,
  };
}

function decisionPayload(overrides: Record<string, unknown> = {}) {
  return {
    displayName: "Jörg Müller",
    roleTitle: "Senior Frontend-Entwickler",
    experienceSummary: "Zwölf Jahre Frontend für Handelsplattformen.",
    skills: ["React", "TypeScript"],
    languages: ["Deutsch"],
    qualifications: ["B. Sc. Informatik"],
    industries: ["Fintech"],
    locationText: "Berlin",
    workModes: ["remote"],
    hourlyRate: "95",
    dayRate: "760",
    currency: "EUR",
    availabilityStatus: "available",
    bookingUrl: "https://calendly.com/joerg/30min",
    ...overrides,
  };
}

describe("application CV limits track the published-profile CV store", () => {
  // An applicant CV is uploaded so it can later become the profile CV. If these
  // drift, a file can be accepted at the form and then be impossible to publish.
  it("uses the same bucket, format and size ceiling", () => {
    expect(CV_BUCKET).toBe(FREELANCER_CV_BUCKET);
    expect(CV_MIME_TYPES).toEqual(["application/pdf"]);
    expect(CV_MAX_BYTES).toBe(10_485_760);
  });
});

describe("freelancer application input", () => {
  it("normalises contact data and converts rates to minor units", () => {
    const input = FreelancerApplicationInputSchema.parse(applicationPayload());
    const insert = applicationInsertFromInput(input, {
      submittedByUserId: null,
      consentAt: "2026-08-19T10:00:00.000Z",
    });

    expect(insert.contact_email).toBe("joerg@example.com");
    expect(insert.hourly_rate_minor).toBe(9_550);
    expect(insert.day_rate_minor).toBeNull();
    expect(insert.currency).toBe("EUR");
    expect(insert.status).toBe("submitted");
    expect(insert.booking_url).toBe("https://calendly.com/joerg-mueller/30min");
    expect(insert.cv_storage_path).toBeNull();
  });

  it("stores a declared monthly salary in minor units", () => {
    const input = FreelancerApplicationInputSchema.parse(applicationPayload({ seeking: "employment", monthlySalary: "6500", hourlyRate: "" }));
    const insert = applicationInsertFromInput(input, { submittedByUserId: null, consentAt: "2026-10-10T10:00:00.000Z" });
    expect(insert.monthly_salary_minor).toBe(650_000);
    expect(insert.currency).toBe("EUR");
  });

  it("drops the currency when no rate was given at all", () => {
    // The application table pairs currency with a rate; the reviewer form is
    // what insists on an actual number before publishing.
    const input = FreelancerApplicationInputSchema.parse(
      applicationPayload({ dayRate: "760" }),
    );
    const withoutRates = { ...input, hourlyRate: null, dayRate: null };
    const insert = applicationInsertFromInput(withoutRates, {
      submittedByUserId: null,
      consentAt: "2026-08-19T10:00:00.000Z",
    });

    expect(insert.currency).toBeNull();
  });

  it("rejects a claim that smuggles in a category prefix", () => {
    const result = FreelancerApplicationInputSchema.safeParse(
      applicationPayload({ skills: ["Qualification: Doktortitel"] }),
    );
    expect(result.success).toBe(false);
  });

  it("removes duplicate tags regardless of casing", () => {
    const input = FreelancerApplicationInputSchema.parse(
      applicationPayload({ skills: ["React", "react", "TypeScript"] }),
    );
    expect(input.skills).toEqual(["React", "TypeScript"]);
  });

  it("requires at least one rate and a consent tick", () => {
    expect(
      FreelancerApplicationInputSchema.safeParse(
        applicationPayload({ hourlyRate: "", dayRate: "" }),
      ).success,
    ).toBe(false);
    expect(
      FreelancerApplicationInputSchema.safeParse(
        applicationPayload({ consent: false }),
      ).success,
    ).toBe(false);
  });

  it("keeps blank optional fields as null instead of empty strings", () => {
    const input = FreelancerApplicationInputSchema.parse(
      applicationPayload({
        contactPhone: "",
        websiteUrl: "",
        locationText: "  ",
        availabilityFrom: "",
      }),
    );

    expect(input.contactPhone).toBeNull();
    expect(input.websiteUrl).toBeNull();
    expect(input.locationText).toBeNull();
    expect(input.availabilityFrom).toBeNull();
  });

  it("takes the booking link as optional, but only as a complete HTTPS address", () => {
    // Since the placement model a client asks through XPORTAL and the
    // operator introduces by mail, so a calendar is no longer a condition.
    // A link that is given must still work.
    for (const value of ["   ", "calendly.com/joerg", "mailto:j@example.com", "http://calendly.com/joerg"]) {
      expect(
        FreelancerApplicationInputSchema.safeParse(
          applicationPayload({ bookingUrl: value }),
        ).success,
      ).toBe(false);
    }
    const empty = FreelancerApplicationInputSchema.parse(applicationPayload({ bookingUrl: "" }));
    expect(empty.bookingUrl).toBeNull();

    const withoutField = { ...applicationPayload() } as Record<string, unknown>;
    delete withoutField.bookingUrl;
    expect(FreelancerApplicationInputSchema.parse(withoutField).bookingUrl).toBeNull();
  });

  it("refuses a non-HTTPS booking link", () => {
    expect(
      FreelancerApplicationInputSchema.safeParse(
        applicationPayload({ bookingUrl: "http://calendly.com/joerg" }),
      ).success,
    ).toBe(false);
  });

  it("caps the summary at the length the profile schema can read back", () => {
    // A longer summary would pass the column CHECK and then break
    // mapFreelancerProfileRow for every catalogue read, not just this row.
    expect(
      FreelancerApplicationInputSchema.safeParse(
        applicationPayload({ experienceSummary: "a".repeat(2_001) }),
      ).success,
    ).toBe(false);
    expect(
      FreelancerApplicationInputSchema.safeParse(
        applicationPayload({ experienceSummary: "a".repeat(2_000) }),
      ).success,
    ).toBe(true);
  });
});

describe("slugs", () => {
  it("transliterates German characters instead of dropping them", () => {
    expect(slugFromName("Jörg Müller")).toBe("joerg-mueller");
    expect(slugFromName("Anna-Lena Straß")).toBe("anna-lena-strass");
  });

  it("falls back when a name has no usable characters", () => {
    expect(slugFromName("   ")).toBe("freelancer");
  });

  it("numbers repeated attempts without exceeding the column limit", () => {
    expect(slugWithAttempt("jan-schmidt", 0)).toBe("jan-schmidt");
    expect(slugWithAttempt("jan-schmidt", 1)).toBe("jan-schmidt-2");
    expect(slugWithAttempt("a".repeat(60), 1)).toHaveLength(60);
  });
});

describe("candidate facts", () => {
  it("prefixes every claim with the category the catalogue reads back", () => {
    const facts = candidateFacts({
      skills: ["React"],
      languages: ["Deutsch"],
      qualifications: ["B. Sc. Informatik"],
      industries: ["Fintech"],
      locationText: "Berlin",
      experienceSummary: "Zwölf Jahre Frontend.",
    });

    expect(facts.map((entry) => entry.fact)).toEqual([
      "Qualification: B. Sc. Informatik",
      "Location: Berlin",
      "Experience: Zwölf Jahre Frontend.",
      "Industry: Fintech",
      "Language: Deutsch",
      "Skill: React",
    ]);
  });
});

describe("publish decision", () => {
  it("blocks a status that would hide the profile from every shortlist", () => {
    expect(
      PublishDecisionSchema.safeParse(
        decisionPayload({ availabilityStatus: "unavailable" }),
      ).success,
    ).toBe(false);
  });

  it("publishes without a booking link, but never with an insecure one", () => {
    expect(PublishDecisionSchema.parse(decisionPayload({ bookingUrl: "" })).bookingUrl).toBeNull();
    expect(
      PublishDecisionSchema.safeParse(
        decisionPayload({ bookingUrl: "http://calendly.com/joerg" }),
      ).success,
    ).toBe(false);
  });

  it("refuses a profile the catalogue columns could not hold", () => {
    expect(
      PublishDecisionSchema.safeParse(decisionPayload({ skills: [] })).success,
    ).toBe(false);
    expect(
      PublishDecisionSchema.safeParse(decisionPayload({ languages: [] }))
        .success,
    ).toBe(false);
    expect(
      PublishDecisionSchema.safeParse(
        decisionPayload({ experienceSummary: "a".repeat(2_001) }),
      ).success,
    ).toBe(false);
  });

  it("refuses a verified fact that was never claimed", () => {
    const result = PublishDecisionSchema.safeParse(
      decisionPayload({ verifiedFacts: ["Skill: Kubernetes"] }),
    );
    expect(result.success).toBe(false);
  });

  it("publishes as an active, real and bookable catalogue row", () => {
    const decision = PublishDecisionSchema.parse(decisionPayload());
    const insert = profileInsertFromDecision(decision, {
      slug: "joerg-mueller",
      checkedAt: "2026-08-19T10:00:00.000Z",
      ownerUserId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });

    expect(insert.owner_user_id).toBe(
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    );
    expect(insert.profile_status).toBe("active");
    expect(insert.demo_status).toBe("real");
    expect(insert.booking_url).toBe("https://calendly.com/joerg/30min");
    expect(insert.hourly_rate_minor).toBe(9_500);
    expect(insert.day_rate_minor).toBe(76_000);
    expect(insert.skill_tags).toEqual([
      "Skill: React",
      "Skill: TypeScript",
      "Industry: Fintech",
    ]);
  });

  it("splits provenance so a fact is never both verified and self-reported", () => {
    const decision = PublishDecisionSchema.parse(
      decisionPayload({
        verifiedFacts: ["Skill: React", "Qualification: B. Sc. Informatik"],
      }),
    );
    const insert = profileInsertFromDecision(decision, {
      slug: "joerg-mueller",
      checkedAt: "2026-08-19T10:00:00.000Z",
    });

    expect(insert.verified_facts).toEqual([
      "Qualification: B. Sc. Informatik",
      "Skill: React",
    ]);
    expect(insert.self_reported_facts).not.toContain("Skill: React");
    expect(insert.self_reported_facts).toContain("Skill: TypeScript");
  });
});

describe("published profile as the catalogue reads it back", () => {
  function publishedRow(overrides: Record<string, unknown> = {}) {
    const decision = PublishDecisionSchema.parse(
      decisionPayload({
        verifiedFacts: ["Skill: React", "Qualification: B. Sc. Informatik"],
        ...overrides,
      }),
    );
    const insert = profileInsertFromDecision(decision, {
      slug: "joerg-mueller",
      checkedAt: "2026-08-19T10:00:00.000Z",
    });

    return {
      ...insert,
      id: "11111111-2222-4333-8444-555555555555",
      version: 1,
    } satisfies FreelancerProfileRow;
  }

  it("labels only the reviewer-ticked claims as verified", () => {
    const profile = mapFreelancerProfileRow(publishedRow());

    expect(profile.skillTags).toContainEqual({
      value: "React",
      source: "verified",
    });
    expect(profile.skillTags).toContainEqual({
      value: "TypeScript",
      source: "self_reported",
    });
    expect(profile.qualifications).toContainEqual({
      value: "B. Sc. Informatik",
      source: "verified",
    });
  });

  it("keeps an industry out of the searchable skills", () => {
    const profile = mapFreelancerProfileRow(publishedRow());

    expect(profile.skillTags.map((entry) => entry.value)).toEqual([
      "React",
      "TypeScript",
    ]);
    expect(profile.contextEvidence.map((entry) => entry.value)).toEqual([
      "Industry: Fintech",
    ]);
  });

  it("carries rates, availability and the booking link through", () => {
    const profile = mapFreelancerProfileRow(publishedRow());

    expect(profile.hourlyRate).toEqual({ amount: 95, currency: "EUR" });
    expect(profile.dayRate).toEqual({ amount: 760, currency: "EUR" });
    expect(profile.availability.status).toBe("available");
    expect(profile.introPolicy.bookingUrl).toBe(
      "https://calendly.com/joerg/30min",
    );
    expect(profile.profileStatus).toBe("active");
    expect(profile.demoStatus).toBe("real");
  });
});

describe("reviewer defaults", () => {
  const row: ApplicationRow = {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    status: "submitted",
    submitted_by_user_id: null,
    full_name: "Jörg Müller",
    contact_email: "joerg@example.com",
    contact_phone: null,
    website_url: null,
    role_title: "Senior Frontend-Entwickler",
    experience_summary: "Zwölf Jahre Frontend.",
    skills: ["React"],
    languages: ["Deutsch"],
    qualifications: [],
    industries: [],
    location_text: null,
    work_modes: ["remote"],
    hourly_rate_minor: 9_550,
    day_rate_minor: null,
    currency: "EUR",
    availability_status: "available",
    availability_from: null,
    booking_url: "https://calendly.com/joerg-mueller/30min",
    applicant_note: null,
    cv_storage_path: null,
    cv_original_filename: null,
    cv_mime_type: null,
    cv_size_bytes: null,
    consent_at: "2026-08-19T10:00:00.000Z",
    source: "apply_form",
    seeking: "projects",
    referral: null,
    review_notes: null,
    reviewed_by_user_id: null,
    reviewed_at: null,
    published_profile_id: null,
    created_at: "2026-08-19T10:00:00.000Z",
    updated_at: "2026-08-19T10:00:00.000Z",
  };

  it("prefills euro amounts and never pre-ticks a verified fact", () => {
    const defaults = decisionDefaultsFromApplication(row);

    expect(defaults.hourlyRate).toBe("95.5");
    expect(defaults.dayRate).toBe("");
    expect(defaults.verifiedFacts).toEqual([]);
    expect(defaults.slug).toBe("joerg-mueller");
    expect(defaults.bookingUrl).toBe("https://calendly.com/joerg-mueller/30min");
  });
});

describe("what an applicant is looking for", () => {
  it("defaults to freelance projects and keeps the source of the application", () => {
    const parsed = FreelancerApplicationInputSchema.parse(applicationPayload({ referral: " Arbeitsagentur " }));
    expect(parsed.seeking).toBe("projects");
    expect(parsed.referral).toBe("arbeitsagentur");
    const insert = applicationInsertFromInput(parsed, { submittedByUserId: null, consentAt: "2026-09-30T08:00:00.000Z" });
    expect(insert).toMatchObject({ seeking: "projects", referral: "arbeitsagentur" });
  });

  it("drops a source that is not a plain key instead of refusing the application", () => {
    const parsed = FreelancerApplicationInputSchema.parse(applicationPayload({ referral: "<script>" }));
    expect(parsed.referral).toBeNull();
  });

  it("does not ask someone looking for a permanent job for a day rate", () => {
    const withoutRates = applicationPayload({ hourlyRate: "", dayRate: "" });
    expect(FreelancerApplicationInputSchema.safeParse(withoutRates).success).toBe(false);
    const employment = FreelancerApplicationInputSchema.parse({ ...withoutRates, seeking: "employment" });
    expect(employment.seeking).toBe("employment");
    const insert = applicationInsertFromInput(employment, { submittedByUserId: null, consentAt: "2026-09-30T08:00:00.000Z" });
    expect(insert).toMatchObject({ hourly_rate_minor: null, day_rate_minor: null, currency: null });
  });

  it("carries the choice into the published profile", () => {
    const decision = PublishDecisionSchema.parse(decisionPayload({ seeking: "both" }));
    expect(profileInsertFromDecision(decision, { slug: "joerg-mueller", checkedAt: "2026-09-30T08:00:00.000Z" }).seeking).toBe("both");
  });
});
