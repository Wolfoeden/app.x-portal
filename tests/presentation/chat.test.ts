import { describe, expect, it } from "vitest";

import {
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
});
