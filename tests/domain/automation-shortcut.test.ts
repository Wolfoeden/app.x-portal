import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { applyBriefPatch, evaluateProfile, parseFallbackBrief } from "@/lib/domain";
import { buildDeterministicBrief, reconcileAiBrief } from "@/lib/openai/brief";
import { profileFixtures } from "./fixtures";

const request = "Wir wollen wiederkehrende Abläufe mit KI automatisieren: n8n-Workflows bauen und ein LLM an unsere Bestandssysteme anbinden, perspektivisch auch RAG auf unsere eigenen Dokumente. Projektbasis, remote, Start kurzfristig.";
describe("automation shortcut semantics", () => {
  it("keeps n8n and LLM core while treating future RAG as optional", () => {
    const brief = buildDeterministicBrief({ originalRequest: request });
    expect(brief.requiredSkills).toContain("n8n");
    expect(brief.requiredSkills).toContain("Large Language Models");
    expect(brief.requiredSkills).not.toContain("RAG");
    expect(brief.optionalSkills).toContain("RAG");
    expect(brief.schemaVersion).toBe(2);
    if (brief.schemaVersion === 2) {
      expect(brief.requirementGroups.find((group) => group.values.includes("n8n"))?.priority).toBe("core");
      expect(brief.requirementGroups.find((group) => group.values.includes("Large Language Models"))?.priority).toBe("core");
      expect(brief.requirementGroups.find((group) => group.values.includes("RAG"))?.priority).toBe("optional");
    }
    const corrected = reconcileAiBrief(brief, {
      projectTitle: null, summary: request, requiredSkills: ["RAG", "LLM"], optionalSkills: null,
      excludedSkills: null, language: null, workMode: "remote", location: null,
      startWindow: null, duration: null, budget: null, rate: null, constraints: null,
      qualifications: null, availabilityRequirement: null, contractualRequirements: null,
    });
    expect(corrected.requiredSkills).not.toContain("RAG");
    expect(corrected.optionalSkills).toContain("RAG");
  });
  it("assesses structured work mode and start only once without dropping other constraints", () => {
    const brief = parseFallbackBrief("React remote, Start kurzfristig");
    const evaluated = evaluateProfile(applyBriefPatch(brief, {
      startWindow: { raw: "Start kurzfristig", earliest: null, latest: null },
      constraints: ["Remote", "Start kurzfristig", "Projektbasis"],
    }), { ...profileFixtures[0], availability: { ...profileFixtures[0].availability, availableFrom: null } });
    expect(evaluated.matchReasons).toContain("Arbeitsmodus passend: remote.");
    expect(evaluated.knownGaps.filter((gap) => /Startfenster|Start kurzfristig/u.test(gap))).toHaveLength(1);
    expect(evaluated.knownGaps.some((gap) => /nicht bestätigt: Remote/u.test(gap))).toBe(false);
    expect(evaluated.knownGaps.some((gap) => gap.includes("Projektbasis"))).toBe(true);
  });
});
