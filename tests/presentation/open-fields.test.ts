import { describe, expect, it } from "vitest";

import { openBriefFields } from "@/components/chat/open-fields";
import { previewBrief } from "@/components/chat/preview-fixtures";

// Audit P2: Die gelbe Liste „Noch offen“ zeigte auch erfasste und rein
// optionale Angaben. Sie soll echte Lücken zeigen, aus dem aktuellen Stand.
describe("open fields in the project overview", () => {
  it("lists only what the selection needs and the current brief lacks", () => {
    expect(openBriefFields(previewBrief)).toEqual(["Dauer", "Budget oder Tagessatz"]);
  });

  it("does not list optional details, even when they are empty", () => {
    const open = openBriefFields({ ...previewBrief, optionalSkills: [], qualifications: [], contractualRequirements: [] });
    expect(open).not.toContain("optionale Kompetenzen");
    expect(open).not.toContain("Qualifikationen");
    expect(open).not.toContain("Vertragsanforderungen");
  });

  it("follows the current values, not the list stored at analysis time", () => {
    const completed = {
      ...previewBrief,
      duration: "3 Monate",
      budgetOrRate: "bis 800 € / Tag",
      unknownFields: ["duration", "budget", "language"],
    };
    expect(openBriefFields(completed)).toEqual([]);
  });

  it("counts a day rate as an answer to budget, and a weekly scope as availability", () => {
    const brief = { ...previewBrief, budgetOrRate: "max. 800 € / Tag", availabilityRequirement: null, constraints: ["3 Tage pro Woche"] };
    expect(openBriefFields(brief)).not.toContain("Budget oder Tagessatz");
    expect(openBriefFields(brief)).not.toContain("Verfügbarkeit");
  });

  it("asks for a place only when the work is not fully remote", () => {
    expect(openBriefFields({ ...previewBrief, mode: "remote", location: null })).not.toContain("Ort");
    expect(openBriefFields({ ...previewBrief, mode: "on-site", location: null })).toContain("Ort");
    expect(openBriefFields({ ...previewBrief, mode: "unknown", location: null })).toEqual(
      expect.arrayContaining(["Arbeitsmodus", "Ort"]),
    );
  });

  it("lists language and required skills when they are missing", () => {
    const open = openBriefFields({ ...previewBrief, languages: [], requiredSkills: [], requirementGroups: [] });
    expect(open).toEqual(expect.arrayContaining(["Sprache", "Pflichtkompetenzen"]));
  });
});
