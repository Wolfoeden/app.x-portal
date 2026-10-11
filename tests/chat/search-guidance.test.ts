import { describe, expect, it } from "vitest";

import type { StructuredBrief } from "@/components/chat-contract";
import { searchGuidance } from "@/components/chat/search-guidance";

function brief(overrides: Partial<StructuredBrief> = {}): StructuredBrief {
  return {
    projectTitle: "KI-Workflow-Automatisierung",
    summary: "",
    requiredSkills: ["n8n", "Large Language Models"],
    optionalSkills: [],
    languages: [],
    languageSource: null,
    mode: "remote",
    location: null,
    startWindow: null,
    duration: null,
    budgetOrRate: null,
    constraints: [],
    qualifications: [],
    availabilityRequirement: null,
    contractualRequirements: [],
    unknownFields: [],
    requirementGroups: [
      { id: "g1", category: "skill", priority: "hard", operator: "all_of", values: ["n8n", "Large Language Models"] },
    ],
    ...overrides,
  };
}

const base = { profileCount: 0, partialCount: 0, researchAvailable: true };

// Oktober 2026: Wer beim ersten Mal kein passendes Profil sieht, bekommt
// konkrete Hinweise und nächste Schritte statt einer Sackgasse.
describe("search guidance after no reliable match", () => {
  it("names the combination of must-haves, the budget and on-site only", () => {
    const guidance = searchGuidance({ ...base, brief: brief({ budgetOrRate: "500 € pro Tag", mode: "on-site" }), matchingStatus: "no_reliable_match" });
    expect(guidance.tips[0]).toContain("Alle 2 Muss-Kompetenzen zugleich (n8n und Large Language Models)");
    expect(guidance.tips.join(" ")).toContain("Ihr Budget (500 € pro Tag) kann erfahrene Profile ausschließen");
    expect(guidance.tips.join(" ")).toContain("Nur vor Ort");
    expect(guidance.tips.length).toBeLessThanOrEqual(3);
  });

  it("offers ways to keep searching instead of a dead end", () => {
    const guidance = searchGuidance({ ...base, brief: brief({ mode: "hybrid" }), matchingStatus: "no_reliable_match" });
    expect(guidance.suggestions.map((entry) => entry.label)).toEqual([
      "Kriterien lockern",
      "Remote zulassen",
      "Suchauftrag erstellen",
      "Öffentlich weitersuchen",
    ]);
    expect(guidance.suggestions[1]?.action).toEqual({ kind: "prefill", text: "Remote-Arbeit ist auch möglich." });
  });

  it("does not offer the paid research when it is not available", () => {
    const guidance = searchGuidance({ ...base, researchAvailable: false, brief: brief(), matchingStatus: "no_reliable_match" });
    expect(guidance.suggestions.map((entry) => entry.label)).not.toContain("Öffentlich weitersuchen");
  });

  it("speaks about partial matches without promising them", () => {
    const guidance = searchGuidance({ ...base, partialCount: 2, brief: brief({ requirementGroups: [] }), matchingStatus: "no_reliable_match" });
    expect(guidance.tips).toContain("2 Profile erfüllen einen Teil. Ein kurzes Gespräch klärt oft, ob die Lücke wirklich zählt.");
  });
});

describe("search guidance with matches", () => {
  it("asks for the details that sharpen the selection", () => {
    const guidance = searchGuidance({ ...base, profileCount: 2, brief: brief(), matchingStatus: "ranked" });
    expect(guidance.tips).toHaveLength(2);
    expect(guidance.tips[0]).toContain("Startzeitraum");
    expect(guidance.suggestions.map((entry) => entry.label)).toContain("Weitere Anforderung ergänzen");
    expect(guidance.suggestions.find((entry) => entry.label === "Start ergänzen")?.action).toEqual({ kind: "prefill", text: "Start: …" });
  });

  it("asks for role and skills when the request is unclear", () => {
    const guidance = searchGuidance({ ...base, brief: brief(), matchingStatus: "needs_clarification" });
    expect(guidance.suggestions[0]?.label).toBe("Rolle und Kompetenzen nennen");
  });

  it("says nothing before an analysis", () => {
    expect(searchGuidance({ ...base, brief: null, matchingStatus: null })).toEqual({ tips: [], suggestions: [] });
  });
});
