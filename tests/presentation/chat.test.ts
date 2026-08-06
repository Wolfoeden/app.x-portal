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
  });

  it("shows provenance and premium manual approval", () => {
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
        bookingUrl: null,
      },
    } as const;
    const match = buildShortlist(brief, [premiumProfile]).matches[0];

    expect(match).toBeDefined();
    const result = presentMatch(match!);
    expect(result.facts.some((fact) => fact.verification === "verified")).toBe(true);
    expect(result.introPolicy.manualApprovalRequired).toBe(true);
  });
});
