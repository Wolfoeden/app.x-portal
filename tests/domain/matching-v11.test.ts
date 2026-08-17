import { describe, expect, it } from "vitest";

import {
  MINIMUM_CORE_COVERAGE_BASIS_POINTS,
  applyBriefPatch,
  buildShortlist,
  evaluateProfile,
  parseFallbackBrief,
} from "../../lib/domain";
import { profileFixtures } from "./fixtures";

const now = new Date("2026-08-17T10:00:00.000Z");

function profileWithSkills(id: string, displayName: string, skills: string[]) {
  return {
    ...profileFixtures[0]!,
    id,
    displayName,
    skillTags: skills.map((value) => ({
      value,
      source: "verified" as const,
    })),
  };
}

describe("freelancer matching v11 reliability", () => {
  it.each(["Python", "C++"])(
    "lets %s satisfy the Python-or-C++ group without reporting the sibling as a gap",
    (skill) => {
      const brief = parseFallbackBrief(
        "Anforderungsmanagement. Verständnis von Python oder C++. Remote.",
        { now },
      );
      const profile = profileWithSkills(
        skill === "Python"
          ? "00000000-0000-4000-8000-000000000101"
          : "00000000-0000-4000-8000-000000000102",
        `${skill} Engineer`,
        ["Requirements Management", skill],
      );

      const evaluation = evaluateProfile(brief, profile);
      const alternative = skill === "Python" ? "C++" : "Python";
      const alternativeGroup = evaluation.requirementAssessments.find(
        (assessment) =>
          assessment.operator === "any_of" &&
          assessment.values.includes("Python") &&
          assessment.values.includes("C++"),
      );

      expect(alternativeGroup).toMatchObject({
        status: "satisfied",
        matchedValues: [skill],
      });
      expect(evaluation.reliable).toBe(true);
      expect(evaluation.knownGaps.join(" ")).not.toContain(alternative);
    },
  );

  it("counts a three-way alternative chain as one any-of group", () => {
    const brief = applyBriefPatch(
      parseFallbackBrief("Python oder C++ oder React", { now }),
      { requiredSkills: ["Python", "C++", "React"] },
    );
    const profile = profileWithSkills(
      "00000000-0000-4000-8000-000000000108",
      "React alternative",
      ["React"],
    );
    const evaluation = evaluateProfile(brief, profile);

    expect(
      brief.schemaVersion === 2
        ? brief.requirementGroups.filter((group) => group.category === "skill")
        : [],
    ).toEqual([
      expect.objectContaining({
        operator: "any_of",
        values: ["Python", "C++", "React"],
      }),
    ]);
    expect(evaluation.scoreBreakdown.coreCoverageBasisPoints).toBe(10_000);
    expect(evaluation.reliable).toBe(true);
  });

  it("asks for clarification instead of inventing precedence for mixed AND/OR chains", () => {
    const brief = applyBriefPatch(
      parseFallbackBrief("Python oder C++ und React", { now }),
      { requiredSkills: ["Python", "C++", "React"] },
    );
    const profile = profileWithSkills(
      "00000000-0000-4000-8000-000000000109",
      "Ambiguous candidate",
      ["C++", "React"],
    );

    expect(buildShortlist(brief, [profile])).toMatchObject({
      status: "needs_clarification",
      clarificationCode: "ambiguous_requirement_logic",
      matches: [],
    });
  });

  it("asks for clarification for parenthesized mixed logic the flat model cannot represent", () => {
    const brief = applyBriefPatch(
      parseFallbackBrief("Python oder (C++ und React)", { now }),
      { requiredSkills: ["Python", "C++", "React"] },
    );
    const pythonProfile = profileWithSkills(
      "00000000-0000-4000-8000-000000000110",
      "Python branch",
      ["Python"],
    );

    expect(buildShortlist(brief, [pythonProfile])).toMatchObject({
      status: "needs_clarification",
      clarificationCode: "ambiguous_requirement_logic",
      matches: [],
    });
  });

  it("rejects 2/3 core coverage but accepts 3/4 at the 70 percent gate", () => {
    const twoOfThreeBrief = applyBriefPatch(
      parseFallbackBrief("Requirements:\n- Python\n- React\n- PostgreSQL", { now }),
      { requiredSkills: ["Python", "React", "PostgreSQL"] },
    );
    const threeOfFourBrief = applyBriefPatch(
      parseFallbackBrief(
        "Requirements:\n- Python\n- React\n- PostgreSQL\n- Project Management",
        { now },
      ),
      {
        requiredSkills: [
          "Python",
          "React",
          "PostgreSQL",
          "Project Management",
        ],
      },
    );
    const profile = profileWithSkills(
      "00000000-0000-4000-8000-000000000103",
      "Three Skills",
      ["Python", "React", "PostgreSQL"],
    );

    const below = evaluateProfile(twoOfThreeBrief, profileWithSkills(
      "00000000-0000-4000-8000-000000000104",
      "Two Skills",
      ["Python", "React"],
    ));
    const above = evaluateProfile(threeOfFourBrief, profile);

    expect(below.scoreBreakdown.coreCoverageBasisPoints).toBe(6_667);
    expect(below.reliable).toBe(false);
    expect(buildShortlist(twoOfThreeBrief, [profileWithSkills(
      "00000000-0000-4000-8000-000000000105",
      "Still Two Skills",
      ["Python", "React"],
    )]).status).toBe("no_reliable_match");
    expect(above.scoreBreakdown.coreCoverageBasisPoints).toBe(7_500);
    expect(above.scoreBreakdown.coreCoverageBasisPoints).toBeGreaterThanOrEqual(
      MINIMUM_CORE_COVERAGE_BASIS_POINTS,
    );
    expect(above.reliable).toBe(true);
    expect(buildShortlist(threeOfFourBrief, [profile]).status).toBe("ranked");
  });

  it("keeps an unknown hard skill honest and does not recommend the profile", () => {
    const brief = applyBriefPatch(
      parseFallbackBrief("Muss zwingend: Python und C++", { now }),
      { requiredSkills: ["Python", "C++"] },
    );
    const profile = profileWithSkills(
      "00000000-0000-4000-8000-000000000106",
      "Python only",
      ["Python"],
    );
    const evaluation = evaluateProfile(brief, profile);

    expect(evaluation.eligible).toBe(true);
    expect(evaluation.reliable).toBe(false);
    expect(evaluation.requirementAssessments[0]).toMatchObject({
      priority: "hard",
      operator: "all_of",
      status: "unknown",
    });
    expect(buildShortlist(brief, [profile])).toMatchObject({
      status: "no_reliable_match",
      matches: [],
    });
  });

  it("handles project 3003519 without inventing SAP and returns an honest null result for a weak profile", () => {
    const brief = parseFallbackBrief(
      `Business Engineer (m/w/d) // Remote/GR Frankfurt // Juli 2026
Unterstützung des Product Owners bei der Anforderungsklärung.
Analyse, Strukturierung und Dokumentation funktionaler und nicht-funktionaler Anforderungen.
Erstellung und Pflege von Epics, Features und User Stories gemäß SAFe.
Fundierte Kenntnisse im funktionalen Architektur- und Anforderungsmanagement.
Sehr gute Kenntnisse in Geschäftsprozessanalyse und -gestaltung.
Erfahrung in der Erstellung fachlicher Testfälle.
Verständnis von Python oder C++ zur Analyse bestehender Systeme und Schnittstellen.
Sehr gute Deutschkenntnisse in Wort und Schrift.`,
      { now },
    );
    const weakProfile = profileWithSkills(
      "00000000-0000-4000-8000-000000000107",
      "Requirements only",
      ["Requirements Management"],
    );

    expect(brief.requiredSkills).not.toContain("SAP Integration");
    expect(
      brief.schemaVersion === 2
        ? brief.requirementGroups.find(
            (group) => group.operator === "any_of" && group.values.includes("Python"),
          )
        : null,
    ).toMatchObject({ values: ["Python", "C++"] });
    expect(buildShortlist(brief, [weakProfile])).toMatchObject({
      status: "no_reliable_match",
      matches: [],
    });
  });
});
