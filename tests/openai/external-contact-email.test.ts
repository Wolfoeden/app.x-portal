import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  acceptableContactEmail,
  reconcileExternalCandidates,
  withoutContactEmail,
  type ExternalFreelancerCandidate,
} from "@/lib/openai/external-freelancer-search";

/**
 * Die Erfassung der Kontaktadresse aus der Websuche.
 *
 * Zwei Zusagen hängen daran, und beide sind teuer, wenn sie brechen: Es darf
 * keine erfundene Adresse angeschrieben werden, und die erfasste Adresse darf
 * den Auftraggeber nie erreichen.
 */

function webOutput(urls: string[]) {
  return [
    {
      type: "web_search_call",
      action: {
        type: "search",
        queries: ["React freelancer"],
        sources: urls.map((url) => ({ type: "url", url })),
      },
      status: "completed",
    },
  ];
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    displayName: "Anna Beispiel",
    role: "React Freelancer",
    summary: "Öffentlich beschriebenes React-Profil.",
    matchedRequirements: ["React"],
    knownGaps: [],
    profileUrl: "https://anna-beispiel.example/ueber-mich",
    bookingUrl: null,
    linkedinUrl: null,
    websiteUrl: "https://anna-beispiel.example/ueber-mich",
    portfolioUrl: null,
    contactEmail: null,
    skills: [],
    activities: [],
    projects: [],
    sourceUrls: ["https://anna-beispiel.example/ueber-mich"],
    ...overrides,
  };
}

describe("acceptableContactEmail", () => {
  const ownPageUrls = ["https://anna-beispiel.example/ueber-mich"];

  it("nimmt eine Adresse auf der eigenen Domain an", () => {
    expect(
      acceptableContactEmail({
        raw: "kontakt@anna-beispiel.example",
        displayName: "Anna Beispiel",
        ownPageUrls,
      }),
    ).toBe("kontakt@anna-beispiel.example");
  });

  it("nimmt eine Freemail-Adresse an, die den Nachnamen trägt", () => {
    // Ohne diesen Zweig wäre die Erfassung praktisch wertlos: Sehr viele
    // Freelancer geben auf der eigenen Seite eine Freemail-Adresse an.
    expect(
      acceptableContactEmail({
        raw: "anna.beispiel@gmail.example",
        displayName: "Anna Beispiel",
        ownPageUrls,
      }),
    ).toBe("anna.beispiel@gmail.example");
  });

  it("verwirft eine fremde Domain ohne Namensbezug", () => {
    // Der teuerste Fehler: eine erfundene Adresse führt zu einer Werbemail an
    // einen Unbeteiligten.
    expect(
      acceptableContactEmail({
        raw: "info@irgendeine-agentur.example",
        displayName: "Anna Beispiel",
        ownPageUrls,
      }),
    ).toBeNull();
  });

  it("verwirft ein Rollenpostfach auf einer Freemail-Domain", () => {
    expect(
      acceptableContactEmail({
        raw: "info@gmail.example",
        displayName: "Anna Beispiel",
        ownPageUrls,
      }),
    ).toBeNull();
  });

  it("verwirft eine Adresse, die nur den Vornamen trägt", () => {
    // "anna@…" träfe zu viele Menschen, um als Beleg zu taugen.
    expect(
      acceptableContactEmail({
        raw: "anna@gmail.example",
        displayName: "Anna Beispiel",
        ownPageUrls,
      }),
    ).toBeNull();
  });

  it("verwirft Adressen auf Marktplatz- und Netzwerkdomains", () => {
    for (const raw of [
      "anna.beispiel@linkedin.com",
      "anna.beispiel@fiverr.com",
      "anna.beispiel@freelancermap.de",
    ]) {
      expect(
        acceptableContactEmail({
          raw,
          displayName: "Anna Beispiel",
          ownPageUrls,
        }),
      ).toBeNull();
    }
  });

  it("zählt eine Marktplatzseite nicht als eigene Seite", () => {
    // Sonst würde eine Adresse auf der Marktplatzdomain über den
    // Domainabgleich hereinkommen.
    expect(
      acceptableContactEmail({
        raw: "kontakt@freelancermap.de",
        displayName: "Anna Beispiel",
        ownPageUrls: ["https://www.freelancermap.de/profil/12345"],
      }),
    ).toBeNull();
  });

  it("übersieht ein führendes www. nicht", () => {
    expect(
      acceptableContactEmail({
        raw: "kontakt@anna-beispiel.example",
        displayName: "Anna Beispiel",
        ownPageUrls: ["https://www.anna-beispiel.example/kontakt"],
      }),
    ).toBe("kontakt@anna-beispiel.example");
  });

  it("normalisiert Großschreibung und Leerraum", () => {
    expect(
      acceptableContactEmail({
        raw: "  Kontakt@Anna-Beispiel.Example  ",
        displayName: "Anna Beispiel",
        ownPageUrls,
      }),
    ).toBe("kontakt@anna-beispiel.example");
  });

  it("verwirft, was keine Adresse ist", () => {
    for (const raw of [null, "", "kein-postfach", "a@b", "zwei@@at.example"]) {
      expect(
        acceptableContactEmail({
          raw,
          displayName: "Anna Beispiel",
          ownPageUrls,
        }),
      ).toBeNull();
    }
  });
});

describe("die Adresse im Abgleich mit den Belegen", () => {
  it("übernimmt eine belegte Adresse in den Kandidaten", () => {
    const { candidates } = reconcileExternalCandidates(
      {
        candidates: [
          candidate({ contactEmail: "kontakt@anna-beispiel.example" }),
        ],
      },
      webOutput(["https://anna-beispiel.example/ueber-mich"]),
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.contactEmail).toBe("kontakt@anna-beispiel.example");
  });

  it("verwirft eine erfundene Adresse, statt den Kandidaten zu verwerfen", () => {
    // Der Kandidat selbst ist belegt und bleibt. Nur die Adresse fällt weg —
    // ein Treffer ohne Adresse ist immer noch ein Treffer.
    const { candidates } = reconcileExternalCandidates(
      { candidates: [candidate({ contactEmail: "info@fremde-firma.example" })] },
      webOutput(["https://anna-beispiel.example/ueber-mich"]),
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.contactEmail).toBeNull();
  });
});

describe("withoutContactEmail", () => {
  it("entfernt die Adresse aus jedem Kandidaten", () => {
    const { candidates } = reconcileExternalCandidates(
      {
        candidates: [
          candidate({ contactEmail: "kontakt@anna-beispiel.example" }),
        ],
      },
      webOutput(["https://anna-beispiel.example/ueber-mich"]),
    );

    const publicCandidates = withoutContactEmail(candidates);

    // Nicht nur `undefined`: Das Feld darf im ausgelieferten JSON gar nicht
    // erst auftauchen.
    expect(Object.keys(publicCandidates[0] ?? {})).not.toContain("contactEmail");
    expect(JSON.stringify(publicCandidates)).not.toContain(
      "kontakt@anna-beispiel.example",
    );
    // Und der Rest bleibt vollständig.
    expect(publicCandidates[0]?.displayName).toBe("Anna Beispiel");
    expect(publicCandidates[0]?.sourceUrls).toHaveLength(1);
  });

  it("lässt das Original unverändert", () => {
    // Der gespeicherte Schnappschuss trägt die Adresse weiter — sonst wäre die
    // spätere Ansprache unmöglich.
    const candidates = [
      { contactEmail: "kontakt@anna-beispiel.example" },
    ] as unknown as ExternalFreelancerCandidate[];

    withoutContactEmail(candidates);

    expect(candidates[0]?.contactEmail).toBe("kontakt@anna-beispiel.example");
  });
});
