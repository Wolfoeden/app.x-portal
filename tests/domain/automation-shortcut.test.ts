import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { applyBriefPatch, buildShortlist, evaluateProfile, FreelancerProfileSchema, parseFallbackBrief } from "@/lib/domain";
import { buildDeterministicBrief, reconcileAiBrief } from "@/lib/openai/brief";
import { automationRequest } from "@/components/chat/preview-fixtures";
import { profileFixtures } from "./fixtures";

const request = "Wir wollen wiederkehrende Abläufe mit KI automatisieren: Workflow-Automatisierungen bauen und ein LLM an unsere Bestandssysteme anbinden, perspektivisch auch RAG auf unsere eigenen Dokumente. Projektbasis, remote, Start kurzfristig.";

function automationProfile(id: string, displayName: string, role: string, skills: string[]) {
  return FreelancerProfileSchema.parse({
    ...profileFixtures[0],
    id,
    displayName,
    role,
    workModes: ["remote"],
    skillTags: skills.map((value) => ({ value, source: "self_reported" })),
    qualifications: [],
    contractualCapabilities: [],
    hourlyRate: null,
    dayRate: null,
    minimumProjectBudget: null,
  });
}

describe("automation shortcut semantics", () => {
  it("is the brief the chat shortcut writes into the composer", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../../components/chat/welcome.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain(request);
    expect(automationRequest).toBe(request);
  });

  it("names no single workflow tool, keeps the LLM core and future RAG optional", () => {
    const brief = buildDeterministicBrief({ originalRequest: request });
    expect(brief.requiredSkills).toEqual(["Large Language Models"]);
    expect(brief.requiredSkills).not.toContain("RAG");
    expect(brief.optionalSkills).toContain("RAG");
    expect(brief.schemaVersion).toBe(2);
    if (brief.schemaVersion === 2) {
      expect(brief.requirementGroups.some((group) => group.values.includes("n8n"))).toBe(false);
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

  // Mit „n8n-Workflows“ im Brief fiel ein Agenten-Profil ohne n8n auf 50 %
  // Kernabdeckung und damit unter die Empfehlungsschwelle, auch wenn es für
  // KI-Automatisierung angemeldet war.
  it("recommends agent builders and n8n automators alike", () => {
    const brief = buildDeterministicBrief({ originalRequest: request });
    const shortlist = buildShortlist(brief, [
      automationProfile("00000000-0000-4000-8000-0000000000a1", "Agent Englisch", "KI / Full Stack / Cloud", ["AI Agents", "MCP", "LLM", "RAG"]),
      automationProfile("00000000-0000-4000-8000-0000000000a2", "Agent Deutsch", "KI-Entwicklung", ["KI-Agenten", "Large Language Models"]),
      automationProfile("00000000-0000-4000-8000-0000000000a3", "Workflow n8n", "Automatisierung & Systemintegration", ["n8n", "Make", "LLM"]),
      automationProfile("00000000-0000-4000-8000-0000000000a4", "Nur Zapier", "Workflow-Automatisierung", ["Make", "Zapier"]),
    ]);
    expect(shortlist.status).toBe("ranked");
    expect(shortlist.matches.map((match) => match.profile.displayName).sort()).toEqual([
      "Agent Deutsch",
      "Agent Englisch",
      "Workflow n8n",
    ]);
    expect(shortlist.matches.every((match) => match.coreCoverage === 100)).toBe(true);
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
