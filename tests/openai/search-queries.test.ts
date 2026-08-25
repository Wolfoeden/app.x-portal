import { describe, expect, it } from "vitest";

import {
  buildSearchQueries,
  JOB_AD_EXCLUSIONS,
  MAX_SEARCH_QUERIES,
  planSearchRounds,
} from "@/lib/openai/search-queries";

const german = {
  projectTitle: "IT-Support (1st/2nd Level) & Helpdesk",
  requiredSkills: ["Störungsbehebung"],
  optionalSkills: [],
  location: null,
  language: "German",
  workMode: "remote",
};

function templates(brief: Parameters<typeof buildSearchQueries>[0]) {
  return buildSearchQueries(brief).map((entry) => entry.template);
}

describe("Suchbegriffe", () => {
  it("schließt Stellenanzeigen aus jeder Anfrage aus", () => {
    const queries = buildSearchQueries(german);
    expect(queries.length).toBeGreaterThan(0);
    for (const entry of queries) {
      for (const exclusion of JOB_AD_EXCLUSIONS) {
        expect(entry.query).toContain(exclusion);
      }
    }
  });

  it("sucht zuerst auf Berufsprofilen, breit erst zuletzt", () => {
    const order = templates(german);
    expect(order[0]).toBe("linkedin");
    expect(order.at(-1)).toBe("broad");
  });

  it("nimmt Xing nur bei deutschsprachigen Anfragen dazu", () => {
    expect(templates(german)).toContain("xing");
    expect(
      templates({ ...german, language: "English", location: "London" }),
    ).not.toContain("xing");
  });

  it("ergänzt Deutschland, wenn kein Ort angegeben ist", () => {
    expect(buildSearchQueries(german)[0]?.query).toContain("Deutschland");
  });

  it("übernimmt einen angegebenen Ort statt der Vorgabe", () => {
    const [first] = buildSearchQueries({ ...german, location: "Hamburg" });
    expect(first?.query).toContain("Hamburg");
    expect(first?.query).not.toContain("Deutschland");
  });

  it("erweitert einen Skill um seine Synonyme aus der Taxonomie", () => {
    const [first] = buildSearchQueries({
      ...german,
      requiredSkills: ["Requirements Management"],
    });
    expect(first?.query).toContain(" OR ");
    expect(first?.query.toLowerCase()).toContain("anforderungsmanagement");
  });

  it("nimmt GitHub nur bei technischen Anfragen dazu", () => {
    expect(
      templates({ ...german, requiredSkills: ["TypeScript", "React"] }),
    ).toContain("code_profile");
    expect(templates(german)).not.toContain("code_profile");
  });

  it("bleibt bei höchstens fünf Anfragen", () => {
    const queries = buildSearchQueries({
      ...german,
      requiredSkills: ["TypeScript", "React", "PostgreSQL", "Docker"],
    });
    expect(queries.length).toBeLessThanOrEqual(MAX_SEARCH_QUERIES);
  });

  it("weicht auf optionale Kompetenzen aus, wenn keine Muss-Kriterien da sind", () => {
    const queries = buildSearchQueries({
      ...german,
      requiredSkills: [],
      optionalSkills: ["Helpdesk"],
    });
    expect(queries[0]?.query).toContain("Helpdesk");
  });

  it("weicht auf den Projekttitel aus, wenn gar keine Kompetenzen da sind", () => {
    const queries = buildSearchQueries({
      ...german,
      requiredSkills: [],
      optionalSkills: [],
    });
    expect(queries.length).toBeGreaterThan(0);
    expect(queries[0]?.query).toContain("Helpdesk");
  });

  it("liefert nichts, wenn der Brief völlig leer ist", () => {
    expect(
      buildSearchQueries({
        projectTitle: "",
        requiredSkills: [],
        optionalSkills: [],
      }),
    ).toEqual([]);
  });

  it("setzt mehrwortige Begriffe in Anführungszeichen", () => {
    const [first] = buildSearchQueries({
      ...german,
      requiredSkills: ["Requirements Management"],
    });
    expect(first?.query).toContain('"Requirements Management"');
  });
});

describe("Sprache und Rolle aus dem Brief", () => {
  const briefWithoutLanguage = {
    projectTitle: "IT-Support (1st/2nd Level) & Helpdesk",
    requiredSkills: ["Störungsbehebung"],
    optionalSkills: [],
    language: null,
    location: null,
    originalRequest:
      "Wir brauchen Verstärkung im IT Support: 1st und 2nd Level für unsere Mitarbeitenden.",
  };

  it("erkennt Deutsch am Text, wenn das Sprachfeld leer ist", () => {
    const queries = buildSearchQueries(briefWithoutLanguage);
    expect(queries.map((q) => q.template)).toContain("xing");
    expect(queries[0]?.query).toContain("freiberuflich");
    expect(queries[0]?.query).toContain("Deutschland");
  });

  it("führt die Rolle aus dem Titel an, wenn die Kompetenz Prosa ist", () => {
    const [first] = buildSearchQueries(briefWithoutLanguage);
    // "Störungsbehebung" steht in keinem Profil, "IT-Support" schon.
    expect(first?.query).toContain("IT-Support");
    expect(first?.query).toContain("Helpdesk");
  });

  it("lässt einen echten Fachbegriff die Anfrage anführen", () => {
    const [first] = buildSearchQueries({
      ...briefWithoutLanguage,
      projectTitle: "Relaunch des Shops",
      requiredSkills: ["Requirements Management"],
    });
    expect(first?.query.indexOf("Requirements Management")).toBeLessThan(
      first?.query.indexOf("Relaunch") === -1
        ? Number.MAX_SAFE_INTEGER
        : first!.query.indexOf("Relaunch"),
    );
  });

  it("wirft Rauschwörter aus dem Titel", () => {
    const [first] = buildSearchQueries({
      ...briefWithoutLanguage,
      projectTitle: "Senior Freelancer gesucht für Helpdesk",
    });
    expect(first?.query).toContain("Helpdesk");
    expect(first?.query).not.toContain("Senior");
    expect(first?.query).not.toContain("gesucht");
  });
});

describe("Strategieleiter", () => {
  const brief = {
    projectTitle: "IT-Support (1st/2nd Level) & Helpdesk",
    requiredSkills: ["Störungsbehebung", "Ticketbearbeitung"],
    optionalSkills: [],
    language: null,
    location: "Hamburg",
    originalRequest: "Wir brauchen Verstärkung im IT Support für unsere Mitarbeitenden.",
  };

  it("plant zwei Runden mit je höchstens drei Anfragen", () => {
    const rounds = planSearchRounds(brief);
    expect(rounds.map((r) => r.round)).toEqual([1, 2]);
    for (const round of rounds) {
      expect(round.queries.length).toBeLessThanOrEqual(3);
      expect(round.label).toBeTruthy();
    }
  });

  it("bleibt im Budget von acht Suchen", () => {
    const total = planSearchRounds(brief).reduce(
      (sum, round) => sum + round.queries.length,
      0,
    );
    expect(total).toBeLessThanOrEqual(6);
  });

  it("sucht in Runde 1 auf Berufsprofilen", () => {
    const [first] = planSearchRounds(brief);
    expect(first?.queries.map((q) => q.template)).toEqual([
      "linkedin",
      "xing",
      "own_site",
    ]);
  });

  it("stellt in Runde 2 andere Fragen, nicht dieselben", () => {
    const [first, second] = planSearchRounds(brief);
    const firstQueries = new Set(first?.queries.map((q) => q.query));
    for (const entry of second?.queries ?? []) {
      expect(firstQueries.has(entry.query)).toBe(false);
    }
  });

  it("löst in Runde 2 die Ortsbindung und die Zweitanforderung", () => {
    const [, second] = planSearchRounds(brief);
    const query = second!.queries[0]!.query;
    expect(query).not.toContain("Hamburg");
    expect(query).not.toContain("Ticketbearbeitung");
  });

  it("wechselt in Runde 2 die Sprache", () => {
    const [first, second] = planSearchRounds(brief);
    expect(first!.queries[0]!.query).toContain("freiberuflich");
    expect(second!.queries[0]!.query).toContain("contractor");
  });

  it("nimmt bei technischen Anfragen ohne Deutsch GitHub in Runde 1", () => {
    const rounds = planSearchRounds({
      ...brief,
      language: "English",
      location: "London",
      originalRequest: "We need a React and TypeScript contractor.",
      projectTitle: "React relaunch",
      requiredSkills: ["TypeScript"],
    });
    expect(rounds[0]?.queries.map((q) => q.template)).toContain("code_profile");
  });

  it("liefert keine Runden für einen leeren Brief", () => {
    expect(
      planSearchRounds({ projectTitle: "", requiredSkills: [], optionalSkills: [] }),
    ).toEqual([]);
  });
});
