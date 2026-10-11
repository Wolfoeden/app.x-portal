import { describe, expect, it } from "vitest";

import type { ProfileProject } from "@/lib/profile/project-limits";
import { isHiddenProposal, mergeOwnerProjects, sameContent } from "@/lib/profile/project-merge";
import { ProjectListSchema } from "@/lib/profile/project-schema";

const checked: ProfileProject = {
  title: "Wissenssuche",
  client: null,
  industry: "Handel",
  role: "Entwickler",
  startedOn: "2023-02",
  endedOn: "2024-11",
  ongoing: false,
  technologies: ["RAG", "Python"],
  outcome: "Suchzeit im Service halbiert.",
  link: null,
  isPublic: true,
  verified: true,
  source: "operator",
  sourceUrl: null,
};

const proposal: ProfileProject = {
  ...checked,
  title: "Chatbot für Stadtwerke",
  verified: false,
  isPublic: false,
  source: "research",
  sourceUrl: "https://example.com/referenz",
};

const owner = (projects: unknown[]) => ProjectListSchema.parse(projects);

describe("owner project merge", () => {
  // Oktober 2026: Neue oder geänderte Projekte warten auf Freigabe; das
  // übrige Profil pflegt der Freelancer frei.
  it("holds new and changed projects back until XPORTAL approves them", () => {
    const approved = { ...checked, approved: true };
    const [unchanged, changed, added] = mergeOwnerProjects(
      [approved, { ...approved, title: "Altes Projekt" }],
      owner([
        { ...checked, verified: false },
        { ...checked, title: "Altes Projekt", outcome: "Jetzt mit neuem Ergebnis." },
        { title: "Neues Projekt", approved: true },
      ]),
    );
    expect(unchanged).toMatchObject({ title: "Wissenssuche", approved: true, verified: true });
    expect(changed).toMatchObject({ title: "Altes Projekt", approved: false, verified: false });
    expect(added).toMatchObject({ title: "Neues Projekt", approved: false });
  });

  it("keeps a pending project pending until the operator approves it", () => {
    const [project] = mergeOwnerProjects([{ ...checked, verified: false, approved: false }], owner([{ ...checked, verified: false }]));
    expect(project).toMatchObject({ approved: false });
  });

  it("does not ask for a new approval when only the visibility changes", () => {
    const [project] = mergeOwnerProjects([{ ...checked, approved: true }], owner([{ ...checked, isPublic: false }]));
    expect(project).toMatchObject({ approved: true, isPublic: false });
  });

  it("never lets the owner set the check mark", () => {
    const [project] = mergeOwnerProjects([], owner([{ title: "Eigenes Projekt", verified: true, source: "operator" }]));
    expect(project).toMatchObject({ title: "Eigenes Projekt", verified: false, source: "freelancer" });
  });

  it("keeps a check mark only while the content stays the same", () => {
    const unchanged = mergeOwnerProjects([checked], owner([{ ...checked, title: " wissenssuche ", verified: false, isPublic: false }]));
    expect(unchanged[0]).toMatchObject({ verified: true, source: "operator", isPublic: false });

    const edited = mergeOwnerProjects([checked], owner([{ ...checked, outcome: "Suchzeit im Service gedrittelt." }]));
    expect(edited[0]).toMatchObject({ verified: false, source: "operator" });

    const moreTech = mergeOwnerProjects([checked], owner([{ ...checked, technologies: ["RAG", "Python", "Azure"] }]));
    expect(moreTech[0]!.verified).toBe(false);
  });

  it("keeps hidden research proposals at the end without showing them to the owner", () => {
    expect(isHiddenProposal(proposal)).toBe(true);
    expect(isHiddenProposal({ ...proposal, isPublic: true })).toBe(false);
    const merged = mergeOwnerProjects([proposal, checked], owner([{ ...checked, title: "Neu", verified: false }]));
    expect(merged.map((project) => project.title)).toEqual(["Neu", "Chatbot für Stadtwerke"]);
    expect(merged[1]).toEqual(proposal);
  });

  it("does not let an owner title take over a hidden proposal's check or source", () => {
    const merged = mergeOwnerProjects([{ ...proposal, verified: true }], owner([{ title: "Chatbot für Stadtwerke" }]));
    expect(merged[0]).toMatchObject({ source: "freelancer", sourceUrl: null, verified: false, isPublic: true });
  });

  it("compares what clients see, not visibility or origin", () => {
    expect(sameContent(checked, { ...checked, isPublic: false, source: "freelancer" })).toBe(true);
    expect(sameContent(checked, { ...checked, link: "https://example.com" })).toBe(false);
    expect(sameContent(checked, { ...checked, ongoing: true, endedOn: null })).toBe(false);
  });
});
