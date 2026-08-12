import { describe, expect, it } from "vitest";

import {
  MATCHING_ORDER_RULE,
  MATCHING_RULE_VERSION,
  applyBriefPatch,
  buildShortlist,
  evaluateProfile,
  parseFallbackBrief,
} from "../../lib/domain";
import { profileFixtures } from "./fixtures";

const now = new Date("2026-08-06T12:00:00.000Z");

describe("deterministic freelancer matching", () => {
  it("accepts a city request against a curated city-country location", () => {
    const brief = applyBriefPatch(
      parseFallbackBrief("React freelancer on-site in Berlin", { now }),
      { location: "Berlin", workMode: "on_site" },
    );
    const profile = {
      ...profileFixtures[0]!,
      location: { value: "Berlin, Germany", source: "verified" as const },
      workModes: ["on_site" as const],
    };

    expect(evaluateProfile(brief, profile).eligible).toBe(true);
  });

  it("filters skills, language, mode, availability and rate before ordering", () => {
    const brief = parseFallbackBrief(
      "React freelancer in German, remote, next month, max EUR 90 per hour. Optional: Next.js.",
      { now },
    );
    const shortlist = buildShortlist(brief, profileFixtures);

    expect(shortlist.ruleVersion).toBe(MATCHING_RULE_VERSION);
    expect(shortlist.orderingRule).toEqual(MATCHING_ORDER_RULE);
    expect(shortlist.matches.map((match) => match.profile.displayName)).toEqual([
      "Anna Keller",
      "Clara Vogt",
      "Boris Neumann",
    ]);
    expect(shortlist.matches).toHaveLength(3);
    expect(shortlist.matches.every((match) => match.profile.profileStatus === "active")).toBe(true);
    expect(shortlist.matches.every((match) => match.availabilityStatus === "available")).toBe(true);
  });

  it("excludes paused and unavailable profiles immediately", () => {
    const brief = parseFallbackBrief("React freelancer in German, remote", { now });
    const paused = evaluateProfile(brief, profileFixtures[3]!);
    const unavailable = evaluateProfile(
      applyBriefPatch(brief, { requiredSkills: ["Information Security"] }),
      profileFixtures[5]!,
    );

    expect(paused.eligible).toBe(false);
    expect(paused.rejectionReasons).toContain("Profil ist nicht aktiv.");
    expect(unavailable.eligible).toBe(false);
    expect(unavailable.rejectionReasons).toContain("Profil ist als nicht verfügbar markiert.");
  });

  it("allows bookable profiles with unknown project availability and ranks confirmed availability first", () => {
    const brief = parseFallbackBrief("React freelancer in German, remote", { now });
    const unknownProfile = {
      ...profileFixtures[0]!,
      id: "00000000-0000-4000-8000-000000000007",
      displayName: "Aardvark Consulting",
      availability: {
        status: "unknown" as const,
        availableFrom: null,
        checkedAt: "2026-08-08T08:00:00.000Z",
      },
    };

    const shortlist = buildShortlist(brief, [unknownProfile, profileFixtures[0]!]);

    expect(shortlist.matches.map((match) => match.profile.displayName)).toEqual([
      "Anna Keller",
      "Aardvark Consulting",
    ]);
    expect(shortlist.matches[1]?.availabilityStatus).toBe("unknown");
    expect(shortlist.matches[1]?.knownGaps).toContain(
      "Projektverfügbarkeit ist nicht bestätigt; der Booking-Kalender ist verfügbar.",
    );
  });

  it("matches only documented skill-family aliases", () => {
    const brief = parseFallbackBrief("Requirements Management freelancer, remote", { now });
    const requirementsEngineer = {
      ...profileFixtures[0]!,
      skillTags: [{ value: "Requirements Engineering", source: "self_reported" as const }],
    };

    expect(evaluateProfile(brief, requirementsEngineer).eligible).toBe(true);
  });

  it("rejects demo profiles and profiles without a secure booking link", () => {
    const brief = parseFallbackBrief("React freelancer in German, remote", { now });
    const demo = { ...profileFixtures[0]!, demoStatus: "demo" as const };
    const withoutBooking = {
      ...profileFixtures[0]!,
      introPolicy: { ...profileFixtures[0]!.introPolicy, bookingUrl: null },
    };

    expect(evaluateProfile(brief, demo).rejectionReasons).toContain(
      "Profil ist kein reales Produktionsprofil.",
    );
    expect(evaluateProfile(brief, withoutBooking).rejectionReasons).toContain(
      "Profil hat keinen sicheren direkten Booking-Link.",
    );
  });

  it("returns an honest empty result when no profile satisfies hard facts", () => {
    const brief = parseFallbackBrief(
      "Python freelancer in French, on-site in Paris, starting 2026-09-01, max EUR 40 per hour.",
      { now },
    );

    expect(buildShortlist(brief, profileFixtures).matches).toEqual([]);
  });

  it("uses stable reviewable ordering independent of input order", () => {
    const brief = parseFallbackBrief(
      "React and TypeScript freelancer in German, remote, next month. Optional: Next.js.",
      { now },
    );
    const forward = buildShortlist(brief, profileFixtures);
    const reversed = buildShortlist(brief, [...profileFixtures].reverse());

    expect(reversed.matches.map((match) => match.profile.id)).toEqual(
      forward.matches.map((match) => match.profile.id),
    );
    expect(forward.matches).toHaveLength(3);
  });

  it("keeps verified and self-reported facts in separate disclosures", () => {
    const brief = parseFallbackBrief("React freelancer in German, remote", { now });
    const match = buildShortlist(brief, [profileFixtures[1]!]).matches[0]!;

    expect(match.verifiedFacts).toContain("Kompetenz: TypeScript");
    expect(match.selfReportedFacts).toContain("Kompetenz: React");
    expect(match.selfReportedFacts).toContain("Sprache: German");
    expect(match.verifiedFacts).not.toContain("Kompetenz: React");
    expect(match.matchReasons).toEqual(expect.arrayContaining([
      "Pflichtkompetenzen passend: React.",
      "Sprache passend: German.",
      "Arbeitsmodus passend: remote.",
    ]));
    expect(match.profileDataVersion).toBe("seed-2026-08-06.1");
    expect(match.availabilityCheckedAt).toBe("2026-08-06T08:05:00.000Z");
  });

  it("reports only fact-derived optional gaps", () => {
    const brief = parseFallbackBrief(
      "React freelancer, remote. Optional: Information Security.",
      { now },
    );
    const match = buildShortlist(brief, [profileFixtures[0]!]).matches[0]!;

    expect(match.knownGaps).toContain("Optionale Kompetenzen nicht aufgeführt: Information Security.");
    expect(match.knownGaps.join(" ")).not.toMatch(/probably|likely|suitable|best/iu);
  });

  it("keeps unknown commercial facts eligible and discloses the gap", () => {
    const hourlyBrief = parseFallbackBrief(
      "Requirements Management freelancer, remote, max EUR 100 per hour.",
      { now },
    );
    const budgetBrief = parseFallbackBrief(
      "React freelancer, remote, project budget EUR 1000.",
      { now },
    );
    const unknownBudgetProfile = {
      ...profileFixtures[0]!,
      minimumProjectBudget: null,
    };

    const hourlyEvaluation = evaluateProfile(hourlyBrief, profileFixtures[4]!);
    expect(hourlyEvaluation.eligible).toBe(true);
    expect(hourlyEvaluation.commercialConstraintConfidence).toBe("unconfirmed");
    expect(hourlyEvaluation.knownGaps).toContain(
      "Stundensatz noch nicht bestätigt; Preisgrenze vor der Buchung abstimmen.",
    );

    const budgetMatch = buildShortlist(budgetBrief, [unknownBudgetProfile]).matches[0]!;
    expect(budgetMatch.profile.displayName).toBe("Anna Keller");
    expect(budgetMatch.orderingEvidence.commercialConstraintConfidence).toBe("unconfirmed");
    expect(budgetMatch.knownGaps).toContain(
      "Mindestprojektbudget noch nicht bestätigt; Budgetpassung vor der Buchung abstimmen.",
    );
  });

  it("excludes confirmed rates over a supplied maximum and ranks confirmed-compatible rates above unknown", () => {
    const brief = parseFallbackBrief(
      "Requirements Management freelancer, remote, max EUR 800 per day.",
      { now },
    );
    const unknownRate = {
      ...profileFixtures[4]!,
      id: "00000000-0000-4000-8000-000000000007",
      displayName: "Aardvark Requirements",
      dayRate: null,
    };
    const overMaximum = {
      ...profileFixtures[4]!,
      id: "00000000-0000-4000-8000-000000000008",
      displayName: "Budget Overrun",
      dayRate: { amount: 900, currency: "EUR" as const },
    };

    const shortlist = buildShortlist(brief, [unknownRate, overMaximum, profileFixtures[4]!]);

    expect(shortlist.matches.map((match) => match.profile.displayName)).toEqual([
      "Elena Rossi",
      "Aardvark Requirements",
    ]);
    expect(shortlist.matches[0]?.orderingEvidence.commercialConstraintConfidence).toBe(
      "confirmed",
    );
    expect(shortlist.matches[1]?.orderingEvidence.commercialConstraintConfidence).toBe(
      "unconfirmed",
    );
    expect(shortlist.matches[1]?.knownGaps).toContain(
      "Tagessatz noch nicht bestätigt; Preisgrenze vor der Buchung abstimmen.",
    );
    expect(evaluateProfile(brief, overMaximum).rejectionReasons).toContain(
      "Bestätigter Tagessatz von 900 EUR überschreitet die angegebene Obergrenze von 800 EUR.",
    );
  });

  it("does not apply an unstated rate or budget ceiling", () => {
    const brief = parseFallbackBrief("React freelancer in German, remote", { now });
    const expensiveProfile = {
      ...profileFixtures[0]!,
      hourlyRate: { amount: 250, currency: "EUR" as const },
      dayRate: { amount: 2_000, currency: "EUR" as const },
      minimumProjectBudget: { amount: 100_000, currency: "EUR" as const },
    };

    const evaluation = evaluateProfile(brief, expensiveProfile);
    expect(evaluation.eligible).toBe(true);
    expect(evaluation.commercialConstraintConfidence).toBe("not_requested");
  });

  it("applies explicit qualification and contract requirements as hard filters", () => {
    const brief = parseFallbackBrief(
      "Requirements Management freelancer, remote. Qualifications: IREB CPRE. Contractual requirements: NDA, EU invoicing.",
      { now },
    );

    expect(buildShortlist(brief, profileFixtures).matches.map((match) => match.profile.displayName)).toEqual([
      "Elena Rossi",
    ]);
  });

  it("classifies an explicit residency constraint as hard without inferring it from location", () => {
    const brief = parseFallbackBrief(
      "Requirements Management freelancer, remote. Constraints: EU residency.",
      { now },
    );
    const profile = {
      ...profileFixtures[4]!,
      location: { value: "Berlin, Germany", source: "self_reported" as const },
    };

    const evaluation = evaluateProfile(brief, profile);

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.rejectionReasons).toContain(
      "Vertragsanforderungen nicht bestätigt: EU residency.",
    );
    expect(evaluation.matchReasons).not.toContain(
      "Weitere Rahmenbedingung bestätigt: EU residency.",
    );
  });

  it("treats an unconfirmed generic explicit constraint as a hard eligibility filter", () => {
    const brief = parseFallbackBrief(
      "React freelancer in German, remote. Constraints: no travel.",
      { now },
    );

    const evaluation = evaluateProfile(brief, profileFixtures[0]!);

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.rejectionReasons).toContain(
      "Weitere Pflichtbedingung im Profil nicht bestätigt: no travel.",
    );
    expect(evaluation.knownGaps).not.toContain(
      "Weitere Rahmenbedingung im Profil nicht bestätigt: no travel.",
    );
  });

  it("evaluates a constraint only once when it is also a contractual requirement", () => {
    const brief = applyBriefPatch(
      parseFallbackBrief("React freelancer in German, remote", { now }),
      {
        constraints: ["Security clearance"],
        contractualRequirements: ["Security clearance"],
      },
    );

    const evaluation = evaluateProfile(brief, profileFixtures[0]!);

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.rejectionReasons).toContain(
      "Vertragsanforderungen nicht bestätigt: Security clearance.",
    );
    expect(
      evaluation.rejectionReasons.filter((reason) =>
        reason.includes("Security clearance"),
      ),
    ).toHaveLength(1);
  });
});
