import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { evaluateProfile, parseFallbackBrief } from "@/lib/domain";
import { AiBriefCandidateSchema, reconcileAiBrief } from "@/lib/openai/brief";
import { isWorkflowInstruction, projectRequirementSource } from "@/lib/domain/workflow-instructions";
import { profileFixtures } from "./fixtures";

describe("workflow controls are separated from freelancer evidence", () => {
  it.each([
    "Nur vorhandene Profile abgleichen, keine externe Recherche oder Kontaktaufnahme.",
    "Bitte nur bestehende Profile vergleichen.",
    "XPORTAL soll keine Kandidaten anschreiben.",
    "No external research or outreach.",
  ])("does not accept an operator command as a grounded AI constraint: %s", (command) => {
    const deterministic = parseFallbackBrief(`React zwingend. ${command}`);
    const candidate = { ...deterministic, constraints: [command] };
    const ai = Object.fromEntries(Object.keys(AiBriefCandidateSchema.shape).map((key) => [key, candidate[key as keyof typeof candidate]]));
    const brief = reconcileAiBrief(deterministic, ai);
    expect(brief.constraints ?? []).not.toContain(command);
    expect(brief.requiredSkills).toContain("React");
    expect("requirementGroups" in brief && brief.requirementGroups.some((group) => group.priority === "hard" && group.values.includes("React"))).toBe(true);
  });

  it("retains real criteria in the same sentence and keeps raw source intact", () => {
    const request = "TypeScript zwingend, keine externe Recherche oder Kontaktaufnahme.";
    expect(projectRequirementSource(request)).toContain("TypeScript zwingend");
    const brief = parseFallbackBrief(request);
    expect(brief.originalRequest).toBe(request);
    expect(brief.requiredSkills).toContain("TypeScript");
  });

  it("retains candidate obligations and real exclusions", () => {
    expect(isWorkflowInstruction("Der Freelancer muss Recherche durchführen.")).toBe(false);
    const brief = parseFallbackBrief("TypeScript Entwickler; keine Angular-Leute.", { skillCatalog: ["TypeScript", "Angular"] });
    expect(brief.excludedSkills).toContain("Angular");
    expect(brief.requiredSkills).toContain("TypeScript");
  });

  it("does not turn a saved operator command into a profile gap", () => {
    const brief = parseFallbackBrief("React Entwickler gesucht.");
    brief.constraints = ["Nur vorhandene Profile abgleichen, keine externe Recherche oder Kontaktaufnahme."];
    brief.unknownFields = brief.unknownFields.filter((field) => field !== "constraints");
    const evaluation = evaluateProfile(brief, profileFixtures[0]!);
    expect(evaluation.knownGaps.join(" ")).not.toMatch(/vorhandene Profile|Kontaktaufnahme/iu);
  });

  it("keeps incomplete profile skill evidence unknown and preserves aliases", () => {
    const brief = parseFallbackBrief("JS zwingend.");
    const profile = { ...profileFixtures[0]!, skillTags: [] };
    const evaluation = evaluateProfile(brief, profile);
    expect(evaluation.requirementAssessments.filter((entry) => entry.category === "skill").every((entry) => entry.status === "unknown")).toBe(true);
    expect(evaluation.rejectionReasons.join(" ")).not.toMatch(/JavaScript.*(?:fehlt|ausgeschlossen)/iu);
  });
});
