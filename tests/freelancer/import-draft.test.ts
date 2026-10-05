import { describe, expect, it } from "vitest";

import { FreelancerApplicationInputSchema } from "@/lib/freelancer/application";
import {
  addProvenance,
  EMPTY_PROVENANCE,
  emptyDraft,
  finalProvenance,
  mergeDraft,
  sourcesOf,
  type DraftTarget,
  type ProfileDraft,
} from "@/lib/freelancer/import/draft";
import { MAX_SKILLS } from "@/lib/freelancer/limits";
import type { ProfileProject } from "@/lib/profile/project-limits";

const EMPTY: DraftTarget = {
  roleTitle: "",
  experienceSummary: "",
  locationText: "",
  skills: [],
  languages: [],
  qualifications: [],
  industries: [],
  projects: [],
};

function project(title: string, overrides: Partial<ProfileProject> = {}): ProfileProject {
  return {
    title,
    client: null,
    industry: null,
    role: null,
    startedOn: null,
    endedOn: null,
    ongoing: false,
    technologies: [],
    outcome: null,
    link: null,
    isPublic: true,
    verified: false,
    source: "application",
    sourceUrl: null,
    ...overrides,
  };
}

function draft(overrides: Partial<ProfileDraft> = {}): ProfileDraft {
  return { ...emptyDraft("cv", "2026-10-05T10:00:00.000Z"), ...overrides };
}

// Oktober 2026: Ein Import füllt das Bewerbungsformular vor. Er überschreibt
// nichts, was die Person eingetragen hat, und macht nichts „geprüft“.
describe("profile draft merge", () => {
  it("fills empty fields and leaves typed values alone", () => {
    const current = { ...EMPTY, roleTitle: "Data Engineer", skills: ["Python"] };
    const { next, taken } = mergeDraft(current, draft({
      roleTitle: "Senior Data Scientist",
      experienceSummary: "Ich baue Datenplattformen für Versicherer und Händler.",
      skills: ["python", "SQL", "dbt"],
    }));
    expect(next.roleTitle).toBe("Data Engineer");
    expect(next.experienceSummary).toBe("Ich baue Datenplattformen für Versicherer und Händler.");
    expect(next.skills).toEqual(["Python", "SQL", "dbt"]);
    expect(taken).toEqual([
      { field: "experienceSummary", value: "", source: "cv" },
      { field: "skills", value: "SQL", source: "cv" },
      { field: "skills", value: "dbt", source: "cv" },
    ]);
  });

  it("respects the list limits and strips the catalogue prefix colon", () => {
    const many = Array.from({ length: MAX_SKILLS + 5 }, (_, index) => `Skill ${index}`);
    const { next } = mergeDraft(EMPTY, draft({ skills: ["Skill: React", ...many] }));
    expect(next.skills).toHaveLength(MAX_SKILLS);
    expect(next.skills[0]).toBe("Skill React");
    expect(next.skills.every((value) => !value.includes(":"))).toBe(true);
  });

  it("adds projects as unverified application entries and skips short or duplicate titles", () => {
    const { next, taken } = mergeDraft(
      { ...EMPTY, projects: [project("Bestehendes Projekt")] },
      draft({
        projects: [
          project("bestehendes projekt"),
          project("AB"),
          project("Neue Plattform", { verified: true, source: "research", sourceUrl: "https://example.com", technologies: ["Kubernetes: EKS"], outcome: "kurz" }),
        ],
      }),
    );
    expect(next.projects.map((entry) => entry.title)).toEqual(["Bestehendes Projekt", "Neue Plattform"]);
    const added = next.projects[1]!;
    expect(added).toMatchObject({ verified: false, source: "application", sourceUrl: null, outcome: null });
    expect(added.technologies).toEqual(["Kubernetes EKS"]);
    expect(taken).toEqual([{ field: "projects", value: "Neue Plattform", source: "cv" }]);
  });

  it("keeps provenance only for values still in the form", () => {
    const source = draft({ skills: ["SQL", "dbt"], roleTitle: "Data Engineer" });
    const { next, taken } = mergeDraft(EMPTY, source);
    const provenance = addProvenance(EMPTY_PROVENANCE, source, taken);
    expect(sourcesOf(provenance, "skills", "sql")).toEqual(["cv"]);

    const final = finalProvenance(provenance, { ...next, skills: ["SQL"], roleTitle: "" });
    expect(final?.values).toEqual([{ field: "skills", value: "SQL", source: "cv" }]);
    expect(final?.imports).toEqual([{ source: "cv", importedAt: "2026-10-05T10:00:00.000Z" }]);
    expect(finalProvenance(EMPTY_PROVENANCE, next)).toBeNull();
  });

  it("is accepted by the application schema and never marks anything verified", () => {
    const source = draft({ source: "github", skills: ["Go"], github: { login: "octocat", linked: true } });
    const { next, taken } = mergeDraft(EMPTY, source);
    const importProvenance = finalProvenance(addProvenance(EMPTY_PROVENANCE, source, taken), next);
    const parsed = FreelancerApplicationInputSchema.safeParse({
      fullName: "Kim Beispiel",
      contactEmail: "kim@example.com",
      roleTitle: "Backend Engineer",
      experienceSummary: "Baut seit sechs Jahren Backends und Datenpipelines für Händler.",
      skills: next.skills,
      languages: ["Deutsch"],
      workModes: ["remote"],
      dayRate: 800,
      capacityDaysPerWeek: "4",
      desiredProjects: "Plattformprojekte, remote",
      importProvenance,
      consent: true,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.capacityDaysPerWeek).toBe(4);
    expect(parsed.data.importProvenance?.imports[0]?.github).toEqual({ login: "octocat", linked: true });
    expect(JSON.stringify(parsed.data.importProvenance)).not.toContain("verified");
  });

  it("rejects capacity outside one to five days and overlong wishes", () => {
    const base = {
      fullName: "Kim Beispiel",
      contactEmail: "kim@example.com",
      roleTitle: "Backend Engineer",
      experienceSummary: "Baut seit sechs Jahren Backends und Datenpipelines für Händler.",
      skills: ["Go"],
      languages: ["Deutsch"],
      workModes: ["remote"],
      dayRate: 800,
      consent: true,
    };
    expect(FreelancerApplicationInputSchema.safeParse({ ...base, capacityDaysPerWeek: 6 }).success).toBe(false);
    expect(FreelancerApplicationInputSchema.safeParse({ ...base, desiredProjects: "x".repeat(501) }).success).toBe(false);
    const empty = FreelancerApplicationInputSchema.parse({ ...base, capacityDaysPerWeek: "", desiredProjects: "" });
    expect(empty.capacityDaysPerWeek).toBeNull();
    expect(empty.desiredProjects).toBeNull();
    expect(empty.importProvenance).toBeNull();
  });
});
