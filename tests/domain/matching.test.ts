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
      "Belegte Pflichtkompetenzen: React.",
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

  it("keeps matching profiles visible while disclosing unconfirmed qualifications", () => {
    const brief = parseFallbackBrief(
      "Requirements Management freelancer, remote. Qualifications: IREB CPRE. Contractual requirements: NDA, EU invoicing.",
      { now },
    );

    const unconfirmed = {
      ...profileFixtures[4]!,
      id: "00000000-0000-4000-8000-000000000009",
      displayName: "Unconfirmed Requirements",
      qualifications: [],
    };
    const shortlist = buildShortlist(brief, [profileFixtures[4]!, unconfirmed]);
    expect(shortlist.matches[0]?.profile.displayName).toBe("Elena Rossi");
    expect(shortlist.matches[1]?.knownGaps.join(" ")).toContain(
      "Qualifikationen noch nicht bestätigt",
    );
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
  });

  it("keeps sensible house-management AI candidates when 100% allocation is an open engagement detail", () => {
    const brief = applyBriefPatch(
      parseFallbackBrief(
        "Senior developer for an AI-supported house-management copilot in Düsseldorf, 40% remote, start 9/2026, EUR 30,000 project budget.",
        { now },
      ),
      {
        requiredSkills: [
          "RAG",
          "Microsoft 365",
          "Document Analysis",
          "Business Process Automation",
        ],
        optionalSkills: ["Python", "FastAPI", "Microsoft Azure"],
        workMode: "hybrid",
        location: "Düsseldorf",
        startWindow: { raw: "9/2026", earliest: null, latest: null },
        budget: { min: 30_000, max: 30_000, currency: "EUR" },
        constraints: ["100% Auslastung"],
      },
    );
    const candidates = [
      {
        ...profileFixtures[2]!,
        id: "00000000-0000-4000-8000-000000000012",
        displayName: "AI Copilot Architect",
        role: "AI Solution Architect",
        skillTags: [
          { value: "RAG", source: "verified" as const },
          { value: "Microsoft 365", source: "verified" as const },
          { value: "Document Analysis", source: "self_reported" as const },
        ],
        location: { value: "Düsseldorf", source: "verified" as const },
        minimumProjectBudget: { amount: 15_000, currency: "EUR" as const },
      },
      {
        ...profileFixtures[2]!,
        id: "00000000-0000-4000-8000-000000000013",
        displayName: "M365 Automation Engineer",
        role: "Microsoft Copilot Developer",
        skillTags: [
          { value: "Microsoft 365", source: "verified" as const },
          { value: "Business Process Automation", source: "verified" as const },
        ],
        location: { value: "Düsseldorf", source: "verified" as const },
        minimumProjectBudget: { amount: 10_000, currency: "EUR" as const },
      },
      {
        ...profileFixtures[2]!,
        id: "00000000-0000-4000-8000-000000000014",
        displayName: "RAG Backend Engineer",
        role: "Senior Python/FastAPI Engineer",
        skillTags: [
          { value: "RAG", source: "self_reported" as const },
          { value: "Python", source: "verified" as const },
          { value: "FastAPI", source: "verified" as const },
        ],
        location: { value: "Düsseldorf", source: "verified" as const },
        minimumProjectBudget: { amount: 8_000, currency: "EUR" as const },
      },
      {
        ...profileFixtures[2]!,
        id: "00000000-0000-4000-8000-000000000015",
        displayName: "Unrelated Frontend Engineer",
        location: { value: "Düsseldorf", source: "verified" as const },
      },
    ];

    const shortlist = buildShortlist(brief, candidates);

    expect(shortlist.matches).toHaveLength(3);
    expect(shortlist.matches.map((match) => match.profile.displayName)).toEqual([
      "AI Copilot Architect",
      "RAG Backend Engineer",
      "M365 Automation Engineer",
    ]);
    expect(
      shortlist.matches.every((match) =>
        match.knownGaps.some((gap) => gap.includes("100% Auslastung")),
      ),
    ).toBe(true);
    expect(
      evaluateProfile(brief, candidates[0]!).rejectionReasons.join(" "),
    ).not.toContain("100% Auslastung");
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

  it("returns the curated SAP consultant for a detailed remote SAP project", () => {
    const brief = applyBriefPatch(
      parseFallbackBrief("SAP consultant in German, 100% remote", { now }),
      {
        requiredSkills: [
          "SAP S/4HANA",
          "SAP MM",
          "SAP PP",
          "Requirements Management",
        ],
        language: "German",
        workMode: "remote",
        location: "Frankfurt am Main",
        startWindow: {
          raw: "15.07.2026",
          earliest: "2026-07-15",
          latest: "2026-07-15",
        },
        duration: { raw: "5 Monate", value: 5, unit: "months" },
        qualifications: ["2 SAP references", "5 years SAP MM/PP"],
      },
    );
    const cordula = {
      ...profileFixtures[4]!,
      id: "d7d4aa69-6e05-465f-a4db-dee557eab5b2",
      displayName: "Cordula Buss",
      role: "SAP S/4HANA & Requirements Management Consultant",
      skillTags: [
        { value: "SAP S/4HANA", source: "self_reported" as const },
        { value: "SAP FICO", source: "self_reported" as const },
        { value: "PPM", source: "self_reported" as const },
        { value: "Requirements Management", source: "self_reported" as const },
      ],
      languages: [{ value: "German", source: "self_reported" as const }],
      workModes: ["remote" as const],
      location: { value: "Germany", source: "self_reported" as const },
      hourlyRate: null,
      dayRate: null,
      minimumProjectBudget: null,
      availability: {
        status: "unknown" as const,
        availableFrom: null,
        checkedAt: "2026-08-12T00:00:00.000Z",
      },
      introPolicy: {
        type: "free" as const,
        label: "Kostenfreies Erstgespräch",
        bookingUrl: "https://calendly.com/cordula-buss-",
      },
    };

    const match = buildShortlist(brief, [cordula]).matches[0];
    expect(match?.profile.displayName).toBe("Cordula Buss");
    expect(match?.matchReasons).toContain(
      "Belegte Pflichtkompetenzen: SAP S/4HANA, Requirements Management.",
    );
    expect(match?.knownGaps).toContain(
      "Weitere Pflichtkompetenzen vor dem Gespräch prüfen: SAP MM, SAP PP.",
    );
    expect(match?.knownGaps.join(" ")).not.toContain("800");
  });

  it("ranks an exact primary SAP skill ahead of generic secondary matches", () => {
    const brief = applyBriefPatch(
      parseFallbackBrief("SAP S/4HANA consultant, German, remote", { now }),
      {
        requiredSkills: [
          "SAP S/4HANA",
          "SAP Integration",
          "Project Management",
          "Requirements Management",
        ],
      },
    );
    const primarySap = {
      ...profileFixtures[4]!,
      id: "00000000-0000-4000-8000-000000000010",
      displayName: "Primary SAP",
      skillTags: [
        { value: "SAP S/4HANA", source: "self_reported" as const },
        { value: "Requirements Management", source: "self_reported" as const },
      ],
    };
    const genericSecondary = {
      ...profileFixtures[4]!,
      id: "00000000-0000-4000-8000-000000000011",
      displayName: "Secondary Skills",
      skillTags: [
        { value: "SAP Integration", source: "self_reported" as const },
        { value: "Project Management", source: "self_reported" as const },
        { value: "Requirements Management", source: "self_reported" as const },
      ],
    };

    const shortlist = buildShortlist(brief, [genericSecondary, primarySap]);
    expect(shortlist.matches[0]?.profile.displayName).toBe("Primary SAP");
    expect(
      shortlist.matches[0]?.orderingEvidence.primaryRequiredSkillExactMatch,
    ).toBe(true);
  });
});
