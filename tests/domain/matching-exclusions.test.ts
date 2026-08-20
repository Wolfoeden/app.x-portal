import { describe, expect, it } from "vitest";

import {
  buildShortlist,
  evaluateProfile,
  parseFallbackBrief,
  type FreelancerProfile,
} from "../../lib/domain";
import { profileFixtures } from "./fixtures";

const now = new Date("2026-08-06T12:00:00.000Z");

/**
 * Regression suite for operator feedback, 20 August 2026:
 * "Bei '…keine Angular-Leute' war der Top-Vorschlag (97 %) ausgerechnet ein
 * Profil mit Angular."
 *
 * The brief had no field for an exclusion, so the only place an extractor
 * could put the negated term was requiredSkills — turning "no Angular" into
 * "Angular required".
 *
 * The reported sentence used Angular, which the shipped vocabulary does not
 * contain; the deterministic parser can only classify terms it knows. These
 * tests therefore prove the mechanism on catalogue terms and pin the reported
 * wording separately with an explicit catalogue. Widening the vocabulary is
 * point 2 of the same feedback and is handled on its own.
 */

const reactDeveloper: FreelancerProfile = {
  ...profileFixtures[0]!,
  displayName: "React Spezialistin",
  skillTags: [
    { value: "React", source: "verified" },
    { value: "TypeScript", source: "verified" },
  ],
};

describe("an excluded skill removes a profile instead of requiring it", () => {
  it("never files a negated skill as a requirement", () => {
    const brief = parseFallbackBrief(
      "TypeScript Entwickler gesucht, keine React-Leute.",
      { now },
    );

    expect(brief.requiredSkills ?? []).not.toContain("React");
    expect(brief.optionalSkills ?? []).not.toContain("React");
    expect(brief.excludedSkills ?? []).toContain("React");
  });

  it("handles the reported wording once the term is in the vocabulary", () => {
    const brief = parseFallbackBrief(
      "TypeScript Entwickler gesucht, keine Angular-Leute.",
      { now, skillCatalog: ["Angular", "TypeScript"] },
    );

    expect(brief.excludedSkills ?? []).toContain("Angular");
    expect(brief.requiredSkills ?? []).not.toContain("Angular");
    expect(brief.requiredSkills ?? []).toContain("TypeScript");
  });

  it("rejects a profile that carries the excluded skill", () => {
    const brief = parseFallbackBrief(
      "TypeScript Entwickler gesucht, keine React-Leute.",
      { now },
    );
    const evaluation = evaluateProfile(brief, reactDeveloper);

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.rejectionReasons.join(" ")).toContain("Ausgeschlossen");
  });

  it("keeps the excluded profile out of the shortlist entirely", () => {
    // Ranking it lower would not be enough: on a thin field it surfaces at the
    // top again, which is exactly what was reported.
    const brief = parseFallbackBrief(
      "TypeScript Entwickler gesucht, keine React-Leute.",
      { now },
    );
    const names = buildShortlist(brief, [
      reactDeveloper,
      ...profileFixtures,
    ]).matches.map((match) => match.profile.displayName);

    expect(names).not.toContain("React Spezialistin");
  });

  it("reads the common German and English negations", () => {
    for (const request of [
      "TypeScript Entwickler, kein React.",
      "TypeScript Entwickler, ohne React.",
      "TypeScript developer, no React.",
      "TypeScript developer, without React.",
    ]) {
      const brief = parseFallbackBrief(request, { now });
      expect(brief.excludedSkills ?? [], request).toContain("React");
      expect(brief.requiredSkills ?? [], request).not.toContain("React");
    }
  });

  it("does not mistake an emphasis for an exclusion", () => {
    // "nicht nur X, sondern auch Y" must keep both. A wrong exclusion silently
    // deletes good candidates, so only an adjacent negation counts.
    const brief = parseFallbackBrief(
      "Gesucht wird nicht nur React, sondern auch TypeScript.",
      { now },
    );

    expect(brief.excludedSkills ?? []).toEqual([]);
    expect(brief.requiredSkills ?? []).toContain("React");
  });

  it("leaves a request without any exclusion untouched", () => {
    const brief = parseFallbackBrief("React Entwickler gesucht, remote.", {
      now,
    });

    expect(brief.excludedSkills).toBeNull();
    expect(evaluateProfile(brief, profileFixtures[0]!).eligible).toBe(true);
  });
});
