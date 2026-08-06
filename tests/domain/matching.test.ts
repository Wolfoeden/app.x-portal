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
    expect(paused.rejectionReasons).toContain("Profile is not active.");
    expect(unavailable.eligible).toBe(false);
    expect(unavailable.rejectionReasons).toContain("Profile is not marked available.");
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

    expect(match.verifiedFacts).toContain("Skill: TypeScript");
    expect(match.selfReportedFacts).toContain("Skill: React");
    expect(match.selfReportedFacts).toContain("Language: German");
    expect(match.verifiedFacts).not.toContain("Skill: React");
    expect(match.matchReasons).toEqual(expect.arrayContaining([
      "Required skills matched: React.",
      "Language matched: German.",
      "Work mode matched: remote.",
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

    expect(match.knownGaps).toContain("Optional skills not listed: Information Security.");
    expect(match.knownGaps.join(" ")).not.toMatch(/probably|likely|suitable|best/iu);
  });

  it("fails closed when a supplied commercial constraint cannot be confirmed", () => {
    const hourlyBrief = parseFallbackBrief(
      "Requirements Management freelancer, remote, max EUR 100 per hour.",
      { now },
    );
    const budgetBrief = parseFallbackBrief(
      "React freelancer, remote, project budget EUR 1000.",
      { now },
    );

    expect(evaluateProfile(hourlyBrief, profileFixtures[4]!).eligible).toBe(false);
    expect(buildShortlist(budgetBrief, profileFixtures).matches).toEqual([]);
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
});
