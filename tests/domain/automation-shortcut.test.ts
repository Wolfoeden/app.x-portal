import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { applyBriefPatch, buildShortlist, evaluateProfile, FreelancerProfileSchema, parseFallbackBrief } from "@/lib/domain";
import { buildDeterministicBrief, reconcileAiBrief } from "@/lib/openai/brief";
import { exampleBrief, exampleBriefForText, firstGap, withoutUnfilledPrompts } from "@/components/chat/example-briefs";
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

// Die Anfrage des früheren Shortcuts „KI & Automatisierung“. Sie bleibt der
// Fall der Vorschau (`/chat/preview?scenario=automation`) und ein Prüfstein
// für das Matching, auch seit der Shortcut eine Rolle ist.
describe("automation request semantics", () => {
  it("is the request the preview plays through", () => {
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

describe("the AI agent role shortcut", () => {
  const shortcut = exampleBrief("ai-agenten")!;

  it("writes only a short, editable start with open prompts", () => {
    expect(shortcut.draftPrefix).toBe(
      "Ich suche einen Freelancer für AI Agents. Aufgabe: … Muss-Skills: … Start: … Budget: …",
    );
    // Der erste Platzhalter ist markiert, damit Tippen ihn ersetzt.
    const gap = firstGap(shortcut.draftPrefix)!;
    expect(shortcut.draftPrefix.slice(0, gap.start)).toBe("Ich suche einen Freelancer für AI Agents. Aufgabe: ");
    expect(gap.end - gap.start).toBe(1);
  });

  it("sends no prompt that is still empty and keeps every filled one", () => {
    expect(withoutUnfilledPrompts(shortcut.draftPrefix)).toBe("Ich suche einen Freelancer für AI Agents.");
    expect(
      withoutUnfilledPrompts(
        "Ich suche einen Freelancer für AI Agents. Aufgabe: Support-Agent ans CRM anbinden. Muss-Skills: … Start: November Budget: …",
      ),
    ).toBe("Ich suche einen Freelancer für AI Agents. Aufgabe: Support-Agent ans CRM anbinden. Start: November");
    // Wer hinter den Platzhalter schreibt, hat etwas angegeben.
    expect(withoutUnfilledPrompts("Ich suche Hilfe. Budget: … 800 € pro Tag")).toBe("Ich suche Hilfe. Budget: … 800 € pro Tag");
    expect(withoutUnfilledPrompts("Projekt ohne Vorlage …")).toBe("Projekt ohne Vorlage …");
  });

  it("is recognised as long as its first sentence stands", () => {
    expect(exampleBriefForText("  Ich suche einen Freelancer für AI Agents. Aufgabe: Chatbot")?.key).toBe("ai-agenten");
    expect(exampleBriefForText("Wir suchen einen Freelancer für AI Agents.")).toBeNull();
  });

  it("reads the filled prompts as must-skill, start and rate without adding a role", () => {
    const brief = buildDeterministicBrief({
      originalRequest: withoutUnfilledPrompts(
        "Ich suche einen Freelancer für AI Agents. Aufgabe: Kundenservice-Agent an unser CRM anbinden. Muss-Skills: Python. Start: November. Budget: 800 € pro Tag",
      ),
    }, new Date("2026-10-02T10:00:00.000Z"));
    expect(brief.requiredSkills).toEqual(["AI Agents", "Python"]);
    expect(brief.projectTitle).toBeNull();
    expect(brief.startWindow?.earliest).toBe("2026-11-01");
    if (brief.schemaVersion === 2) {
      expect(brief.requirementGroups.find((group) => group.values.includes("Python"))?.priority).toBe("hard");
    }
  });

  it("recommends agent builders in either language and not workflow automators without agents", () => {
    const brief = buildDeterministicBrief({ originalRequest: withoutUnfilledPrompts(shortcut.draftPrefix) });
    const shortlist = buildShortlist(brief, [
      automationProfile("00000000-0000-4000-8000-0000000000b1", "Agent Englisch", "AI Engineer", ["AI Agents", "LangChain"]),
      automationProfile("00000000-0000-4000-8000-0000000000b2", "Agent Deutsch", "KI-Entwicklung", ["KI-Agenten", "RAG"]),
      automationProfile("00000000-0000-4000-8000-0000000000b3", "Workflow n8n", "Automatisierung & Systemintegration", ["n8n", "Make", "LLM"]),
    ]);
    expect(shortlist.status).toBe("ranked");
    expect(shortlist.matches.map((match) => match.profile.displayName).sort()).toEqual(["Agent Deutsch", "Agent Englisch"]);
    expect(shortlist.matches.every((match) => match.coreCoverage === 100)).toBe(true);
  });
});
