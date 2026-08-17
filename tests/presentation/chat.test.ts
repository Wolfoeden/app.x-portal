import { describe, expect, it } from "vitest";

import {
  applyBriefPatch,
  buildShortlist,
  deriveUnknownFields,
  parseFallbackBrief,
  ProjectBriefSchema,
  type ProjectBrief,
} from "@/lib/domain";
import { presentBrief, presentMatch } from "@/lib/presentation/chat";

import { profileFixtures } from "../domain/fixtures";

function makeBrief(patch: Partial<ProjectBrief> = {}): ProjectBrief {
  const fallback = parseFallbackBrief("React freelancer, German, remote");
  const candidate = { ...fallback, ...patch };
  return ProjectBriefSchema.parse({
    ...candidate,
    unknownFields: deriveUnknownFields(candidate),
  });
}

describe("chat presentation", () => {
  it("builds the visible summary only from accepted structured fields", () => {
    const brief = makeBrief({
      summary: "Untrusted raw prompt that must not be repeated",
      requiredSkills: ["React"],
      language: "German",
      workMode: "remote",
      duration: { value: 6, unit: "weeks", raw: "sechs Wochen" },
      rate: { min: null, max: 800, currency: "EUR", unit: "day" },
      constraints: ["EU residency"],
    });

    const result = presentBrief(brief);

    expect(result.summary).toContain("Kernkompetenzen: React");
    expect(result.summary).toContain("Dauer: sechs Wochen");
    expect(result.summary).toContain("800");
    expect(result.summary).toContain("EU residency");
    expect(result.summary).not.toContain("Untrusted raw prompt");
  });

  it("keeps unknown facts explicit in the UI contract", () => {
    const brief = makeBrief({ projectTitle: null, location: null });
    const result = presentBrief(brief);

    expect(result.projectTitle).toBe("Freelancer-Anfrage");
    expect(result.location).toBeNull();
    expect(result.unknownFields).toContain("location");
    expect(result.qualifications).toEqual([]);
    expect(result.availabilityRequirement).toBeNull();
    expect(result.contractualRequirements).toEqual([]);
  });

  it("exposes the detailed, source-grounded analysis fields", () => {
    const result = presentBrief(makeBrief({
      qualifications: ["IREB CPRE"],
      availabilityRequirement: "ab September 2026",
      contractualRequirements: ["NDA"],
      constraints: ["EU residency"],
    }));

    expect(result).toMatchObject({
      qualifications: ["IREB CPRE"],
      availabilityRequirement: "ab September 2026",
      contractualRequirements: ["NDA"],
      constraints: ["EU residency"],
    });
  });

  it("presents V2 alternatives as one OR group without exposing source excerpts", () => {
    const brief = parseFallbackBrief(
      "Anforderungsmanagement mit Verständnis von Python oder C++.",
    );

    const result = presentBrief(brief);
    const alternatives = result.requirementGroups.find(
      (group) => group.operator === "any_of",
    );

    expect(alternatives).toEqual(
      expect.objectContaining({ values: ["Python", "C++"] }),
    );
    expect(alternatives).not.toHaveProperty("sourceText");
    expect(result.summary).toContain("Python oder C++");
  });

  it("shows provenance and the direct booking link", () => {
    const brief = makeBrief({
      requiredSkills: ["React"],
      language: "German",
      workMode: "remote",
    });
    const premiumProfile = {
      ...profileFixtures[0],
      introPolicy: {
        type: "premium",
        label: "Freigabe durch Roman Dering",
        bookingUrl: "https://calendly.com/example/anna",
      },
    } as const;
    const match = buildShortlist(brief, [premiumProfile]).matches[0];

    expect(match).toBeDefined();
    const result = presentMatch(match!);
    expect(result.facts.some((fact) => fact.verification === "verified")).toBe(true);
    expect(result.bookingUrl).toBe("https://calendly.com/example/anna");
    expect(result.introPolicy.manualApprovalRequired).toBe(false);
    expect(result.introPolicy.readyToBook).toBe(true);
    expect(result.recommendationRole).toBe("primary");
    expect(result.fitScore).not.toBeNull();
    expect(result.coreCoverage).toBe(100);
  });

  it("keeps a historical match visible without exposing a stale booking link", () => {
    const brief = makeBrief({ requiredSkills: ["React"], workMode: "remote" });
    const liveMatch = buildShortlist(brief, [profileFixtures[0]!]).matches[0]!;
    const historicalMatch = {
      ...liveMatch,
      profile: {
        ...liveMatch.profile,
        availability: {
          ...liveMatch.profile.availability,
          status: "unavailable" as const,
        },
        introPolicy: {
          ...liveMatch.profile.introPolicy,
          bookingUrl: null,
        },
      },
      availabilityStatus: "unavailable" as const,
    };

    const result = presentMatch(historicalMatch);

    expect(result.bookingUrl).toBeNull();
    expect(result.availabilityStatus).toBe("unavailable");
    expect(result.introPolicy.readyToBook).toBe(false);
  });

  it("never exposes booking or introduction actions for a partial match", () => {
    const brief = applyBriefPatch(
      parseFallbackBrief("Muss-Anforderungen:\n- React\n- C++\n100% remote"),
      { requiredSkills: ["React", "C++"], workMode: "remote" },
    );
    const shortlist = buildShortlist(brief, [profileFixtures[0]!]);
    const partial = shortlist.partialMatches[0];

    expect(shortlist.status).toBe("no_reliable_match");
    expect(partial).toBeDefined();
    expect(presentMatch(partial!)).toMatchObject({
      recommendationRole: "partial",
      bookingUrl: null,
      introPolicy: {
        label: "Nicht empfohlen – keine direkte Buchung",
        manualApprovalRequired: true,
        readyToBook: false,
      },
    });
  });

  it("does not invent v11 scores for a historical match", () => {
    const brief = makeBrief({ requiredSkills: ["React"], workMode: "remote" });
    const liveMatch = buildShortlist(brief, [profileFixtures[0]!]).matches[0]!;
    const historicalMatch = {
      ...liveMatch,
      recommendationRole: undefined,
      fitScore: undefined,
      coreCoverage: undefined,
      requirementAssessments: undefined,
      scoreBreakdown: undefined,
    };

    expect(presentMatch(historicalMatch)).toMatchObject({
      recommendationRole: null,
      fitScore: null,
      coreCoverage: null,
    });
  });
});
