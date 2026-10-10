import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { draftFromCvOutput } from "@/lib/openai/cv-draft";

describe("CV profile evidence", () => {
  it("keeps explicit employer, industry, role and project links as self-reported evidence", () => {
    const draft = draftFromCvOutput({
      roleTitle: "AI Engineer",
      experienceSummary: "Ich habe KI-Automatisierung für Lebensmittelproduktion entwickelt.",
      locationText: null,
      skills: ["Python"],
      languages: ["Deutsch"],
      qualifications: [],
      industries: ["Lebensmittelindustrie"],
      projects: [{
        title: "Produktionsplanung automatisiert",
        client: "Beispiel Foods GmbH",
        industry: "Lebensmittelindustrie",
        role: null,
        startedOn: "2024-01",
        endedOn: "2025-06",
        ongoing: false,
        technologies: ["Python"],
        outcome: "Planungsdaten wurden automatisiert verarbeitet.",
        link: "https://example.com/projekt",
      }],
    }, "2026-10-10T10:00:00.000Z");

    expect(draft.projects[0]).toMatchObject({
      client: "Beispiel Foods GmbH",
      industry: "Lebensmittelindustrie",
      role: null,
      link: "https://example.com/projekt",
      verified: false,
      source: "application",
    });
  });

  it("drops links that were not explicit HTTPS evidence", () => {
    const draft = draftFromCvOutput({
      roleTitle: null,
      experienceSummary: null,
      locationText: null,
      skills: [], languages: [], qualifications: [], industries: [],
      projects: [{ title: "Projekt", client: null, industry: null, role: null, startedOn: null, endedOn: null, ongoing: false, technologies: [], outcome: null, link: "javascript:alert(1)" }],
    }, "2026-10-10T10:00:00.000Z");
    expect(draft.projects[0]?.link).toBeNull();
  });
});
