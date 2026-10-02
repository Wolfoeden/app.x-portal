import { describe, expect, it } from "vitest";

import { pickHighlight, projectPeriod, projectTeaser, type ProfileProject } from "@/lib/profile/project-limits";
import { ProfileLinksSchema, ProjectInputSchema, ProjectListSchema } from "@/lib/profile/project-schema";

const base: ProfileProject = {
  title: "Service-Agent für Schadenmeldungen",
  client: null,
  industry: "Versicherungen",
  role: "Lead Developer",
  startedOn: "2025-03",
  endedOn: null,
  ongoing: true,
  technologies: ["LangChain", "Azure OpenAI", "Python", "RAG", "n8n"],
  outcome: "Ein Drittel der Meldungen läuft ohne Rückfrage durch.",
  link: null,
  isPublic: true,
  verified: false,
  source: "operator",
  sourceUrl: null,
};

describe("project periods", () => {
  it("reads like a CV line", () => {
    expect(projectPeriod(base)).toBe("seit 03/2025");
    expect(projectPeriod({ startedOn: "2023-02", endedOn: "2024-11", ongoing: false })).toBe("2023 – 2024");
    expect(projectPeriod({ startedOn: "2024-02", endedOn: "2024-11", ongoing: false })).toBe("2024");
    expect(projectPeriod({ startedOn: "2024-05", endedOn: "2024-05", ongoing: false })).toBe("05/2024");
    expect(projectPeriod({ startedOn: null, endedOn: "2022-06", ongoing: false })).toBe("bis 06/2022");
    expect(projectPeriod({ startedOn: null, endedOn: null, ongoing: false })).toBeNull();
  });
});

describe("the project on a card", () => {
  it("shows title, industry with period and four technologies", () => {
    expect(projectTeaser(base)).toEqual({
      title: "Service-Agent für Schadenmeldungen",
      meta: "Versicherungen · seit 03/2025",
      technologies: ["LangChain", "Azure OpenAI", "Python", "RAG"],
      verified: false,
    });
    expect(projectTeaser({ ...base, client: "Direktversicherer" }).meta).toBe("Direktversicherer · seit 03/2025");
  });

  it("prefers a checked project, otherwise the first", () => {
    const second = { ...base, title: "Geprüftes Projekt", verified: true };
    expect(pickHighlight([base, second])?.title).toBe("Geprüftes Projekt");
    expect(pickHighlight([base])?.title).toBe(base.title);
    expect(pickHighlight([])).toBeNull();
  });
});

describe("validating projects", () => {
  it("accepts a full project and trims, dedupes and defaults", () => {
    const parsed = ProjectInputSchema.parse({ ...base, title: "  Wissenssuche  ", technologies: ["RAG", "rag", "n8n"], client: " " });
    expect(parsed.title).toBe("Wissenssuche");
    expect(parsed.technologies).toEqual(["rag", "n8n"]);
    expect(parsed.client).toBeNull();
  });

  it("rejects what the database would reject", () => {
    expect(ProjectInputSchema.safeParse({ ...base, title: "AI" }).success).toBe(false);
    expect(ProjectInputSchema.safeParse({ ...base, link: "http://example.com" }).success).toBe(false);
    expect(ProjectInputSchema.safeParse({ ...base, endedOn: "2025-06" }).success).toBe(false);
    expect(ProjectInputSchema.safeParse({ ...base, ongoing: false, startedOn: "2025-05", endedOn: "2024-01" }).success).toBe(false);
    expect(ProjectInputSchema.safeParse({ ...base, source: "research", sourceUrl: null }).success).toBe(false);
    expect(ProjectInputSchema.safeParse({ ...base, startedOn: "2025-13" }).success).toBe(false);
    expect(ProjectInputSchema.safeParse({ ...base, technologies: ["Skill: React"] }).success).toBe(false);
    expect(ProjectListSchema.safeParse(Array.from({ length: 9 }, () => base)).success).toBe(false);
  });

  it("keeps links to six https addresses without duplicates", () => {
    expect(
      ProfileLinksSchema.parse([
        { kind: "linkedin", url: "https://www.linkedin.com/in/kim" },
        { kind: "website", url: "https://www.linkedin.com/in/kim" },
      ]),
    ).toHaveLength(1);
    expect(ProfileLinksSchema.safeParse([{ kind: "website", url: "javascript:alert(1)" }]).success).toBe(false);
    expect(ProfileLinksSchema.safeParse([{ kind: "xing", url: "https://xing.com/x" }]).success).toBe(false);
  });
});
