import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isAddressable,
  isSkillPage,
  parseProfile,
  parseProfileList,
  parseRateRange,
  resolveSkillSlug,
  skillListUrl,
  sourceFromFreelancermap,
  type FetchLike,
} from "@/lib/sourcing/freelancermap";

const SKILL_TITEL = "<title>TypeScript Freelancer gesucht? - Top Experten von 54 - 120 € / h</title>";
const ALLGEMEIN_TITEL =
  "<title>Freelancer und Freiberufler auf www.freelancermap.de</title>";

/** Das Verzeichnis, damit die Tests ohne Netz auskommen. */
const INDEX = new Set(["typescript", "reactjs", "helpdesk", "c-plus-plus"]);

/**
 * Nachbau einer echten Profilseite. Die Struktur — drei JSON-LD-Blöcke,
 * Überschriften als eigene Elemente, Sprache und Niveau in zwei Zeilen —
 * stammt aus einem Abruf gegen die Seite, nicht aus einer Vermutung.
 */
function profilSeite(options: {
  name?: string | null;
  rolle?: string;
  ort?: string;
  land?: string;
  preis?: number;
  skills?: string[];
  sprachen?: [string, string][];
  ueberMich?: string;
} = {}): string {
  const {
    name = "Bojan Bizic",
    rolle = "Senior Software-Architekt & Fullstack Developer",
    ort = "München",
    land = "DE",
    preis = 90,
    skills = ["TypeScript", "React", "Kubernetes"],
    sprachen = [
      ["Deutsch", "verhandlungssicher"],
      ["Englisch", "verhandlungssicher"],
    ],
    ueberMich = "Senior Software- und Cloud-Architekt mit 18 Jahren Erfahrung.",
  } = options;

  const person = name
    ? `<script type="application/ld+json">${JSON.stringify({
        "@context": "http://schema.org",
        "@type": "Person",
        name,
        jobTitle: rolle,
      })}</script>`
    : "";

  return `<!doctype html><html><head>${person}
    <script type="application/ld+json">${JSON.stringify({
      "@context": "http://schema.org",
      "@type": "PostalAddress",
      addressCountry: land,
      addressLocality: ort,
      postalCode: "81927",
    })}</script>
    <script type="application/ld+json">${JSON.stringify({
      "@context": "http://schema.org",
      "@type": "Offer",
      price: preis,
      priceCurrency: "EUR",
    })}</script>
    </head><body>
      <h2>Über mich</h2><p>${ueberMich}</p>
      <h2>Skills</h2>${skills.map((wert) => `<span>${wert}</span>`).join("")}
      <h2>Sprachen</h2>${sprachen
        .map(([sprache, niveau]) => `<span>${sprache}</span><span>${niveau}</span>`)
        .join("")}
      <h2>Projekthistorie</h2><p>Nicht Teil der Skills.</p>
    </body></html>`;
}

describe("skillListUrl", () => {
  it("bildet Umlaute und Sonderzeichen auf den Listenpfad ab", () => {
    expect(skillListUrl("TypeScript")).toBe(
      "https://www.freelancermap.de/freelancer/typescript",
    );
    expect(skillListUrl("Störungsbehebung")).toBe(
      "https://www.freelancermap.de/freelancer/stoerungsbehebung",
    );
  });

  it("schreibt das Pluszeichen aus, wie die Quelle es tut", () => {
    // Gemessen: /freelancer/c-plus-plus trägt den Titel "C++ Freelancer
    // gesucht?", /freelancer/cplusplus und /freelancer/cpp dagegen die
    // allgemeine Liste.
    expect(skillListUrl("C++")).toBe(
      "https://www.freelancermap.de/freelancer/c-plus-plus",
    );
    expect(skillListUrl("C#")).toBe(
      "https://www.freelancermap.de/freelancer/c-sharp",
    );
  });
});

describe("resolveSkillSlug", () => {
  const niemalsRufen: FetchLike = async () => {
    throw new Error("Das Verzeichnis hätte die Frage beantworten müssen.");
  };

  it("findet den Sitznamen im Verzeichnis, ohne einen Abruf", async () => {
    await expect(
      resolveSkillSlug("TypeScript", { index: INDEX, fetchImpl: niemalsRufen }),
    ).resolves.toBe("typescript");
  });

  it("überbrückt abweichende Schreibweisen — React heißt dort reactjs", async () => {
    await expect(
      resolveSkillSlug("React", { index: INDEX, fetchImpl: niemalsRufen }),
    ).resolves.toBe("reactjs");
  });

  it("probiert einmal nach, wenn das Verzeichnis eine Lücke hat", async () => {
    const gerufen: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      gerufen.push(url);
      return { ok: true, status: 200, text: async () => SKILL_TITEL };
    };
    await expect(
      resolveSkillSlug("Kubernetes", { index: new Set(), fetchImpl }),
    ).resolves.toBe("kubernetes");
    expect(gerufen).toEqual(["https://www.freelancermap.de/freelancer/kubernetes"]);
  });

  it("gibt null zurück, wenn der Probeabruf die allgemeine Liste bringt", async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () => ALLGEMEIN_TITEL,
    });
    await expect(
      resolveSkillSlug("Erfahrung in KI-Projekten", { index: new Set(), fetchImpl }),
    ).resolves.toBeNull();
  });
});

describe("isSkillPage", () => {
  it("erkennt die Skill-Seite am Titel", () => {
    expect(isSkillPage(SKILL_TITEL)).toBe(true);
  });

  it("weist die allgemeine Liste ab, obwohl sie HTTP 200 und Profile liefert", () => {
    expect(isSkillPage(ALLGEMEIN_TITEL)).toBe(false);
  });

  it("weist eine Seite ohne Titel ab", () => {
    expect(isSkillPage("<html><body>nichts</body></html>")).toBe(false);
  });
});

describe("parseRateRange", () => {
  it("liest die Satzspanne aus dem Titel", () => {
    expect(parseRateRange(SKILL_TITEL)).toEqual({
      min: 54,
      max: 120,
      currency: "EUR",
    });
  });

  it("liefert null, wo keine Spanne steht", () => {
    expect(parseRateRange(ALLGEMEIN_TITEL)).toBeNull();
  });
});

describe("parseProfileList", () => {
  it("liest absolute und relative Profiladressen und entdoppelt sie", () => {
    const html = `
      <a href="https://www.freelancermap.de/profil/bojan-bizic">x</a>
      <a href="/profil/bojan-bizic">nochmal derselbe</a>
      <a href="/profil/maximilian-wolf">y</a>
      <a href="/projekt/irgendwas">kein Profil</a>`;
    expect(parseProfileList(html)).toEqual([
      "https://www.freelancermap.de/profil/bojan-bizic",
      "https://www.freelancermap.de/profil/maximilian-wolf",
    ]);
  });

});

describe("parseProfile", () => {
  const url = "https://www.freelancermap.de/profil/bojan-bizic";

  it("liest Person, Ort, Satz, Skills und Sprachen", () => {
    const profil = parseProfile(profilSeite(), url);
    expect(profil.displayName).toBe("Bojan Bizic");
    expect(profil.role).toContain("Fullstack Developer");
    expect(profil.location).toBe("München");
    expect(profil.countryCode).toBe("DE");
    expect(profil.hourlyRate).toEqual({ amount: 90, currency: "EUR" });
    expect(profil.skills).toEqual(["TypeScript", "React", "Kubernetes"]);
    expect(profil.languages).toEqual([
      "Deutsch (verhandlungssicher)",
      "Englisch (verhandlungssicher)",
    ]);
    expect(profil.about).toContain("Cloud-Architekt");
  });

  it("hört bei der nächsten Überschrift auf, statt weiterzulesen", () => {
    const profil = parseProfile(profilSeite(), url);
    expect(profil.skills).not.toContain("Sprachen");
    expect(profil.skills.join(" ")).not.toContain("Projekthistorie");
  });

  it("lässt Fehlendes leer, statt es zu erfinden", () => {
    const profil = parseProfile(profilSeite({ name: null }), url);
    expect(profil.displayName).toBeNull();
    expect(profil.role).toBeNull();
    // Ort und Satz stehen in eigenen Blöcken und bleiben lesbar.
    expect(profil.location).toBe("München");
  });

  it("überlebt einen kaputten JSON-LD-Block", () => {
    const html = `<script type="application/ld+json">{ kaputt </script>${profilSeite()}`;
    expect(parseProfile(html, url).displayName).toBe("Bojan Bizic");
  });

  it("verwirft einen Stundensatz, der ein Platzhalter ist", () => {
    // Gemessen an einem echten Profil mit 1 €/h.
    expect(parseProfile(profilSeite({ preis: 1 }), url).hourlyRate).toBeNull();
    expect(parseProfile(profilSeite({ preis: 69 }), url).hourlyRate).toEqual({
      amount: 69,
      currency: "EUR",
    });
  });
});

describe("isAddressable", () => {
  const basis = parseProfile(profilSeite(), "https://www.freelancermap.de/profil/x");

  it("nimmt ein Profil mit bürgerlichem Namen und Skills", () => {
    expect(isAddressable(basis)).toBe(true);
  });

  it("weist Rollenbezeichnungen statt Namen ab", () => {
    expect(isAddressable({ ...basis, displayName: "Informatiker" })).toBe(false);
    expect(isAddressable({ ...basis, displayName: null })).toBe(false);
  });

  it("weist ein Profil ohne Skills ab", () => {
    expect(isAddressable({ ...basis, skills: [] })).toBe(false);
  });
});

describe("sourceFromFreelancermap", () => {
  it("holt die Liste und dahinter die Profile, begrenzt auf das Limit", async () => {
    const gerufen: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      gerufen.push(url);
      const html = url.includes("/profil/")
        ? profilSeite()
        : `${SKILL_TITEL}<a href="/profil/a">1</a><a href="/profil/b">2</a>
           <a href="/profil/c">3</a>`;
      return { ok: true, status: 200, text: async () => html };
    };

    const lauf = await sourceFromFreelancermap({
      skill: "TypeScript",
      limit: 2,
      fetchImpl,
      pauseMs: 0,
      skillIndex: INDEX,
    });

    expect(lauf.listUrl).toBe("https://www.freelancermap.de/freelancer/typescript");
    expect(lauf.skillPageFound).toBe(true);
    expect(lauf.rateRange).toEqual({ min: 54, max: 120, currency: "EUR" });
    expect(lauf.profiles).toHaveLength(2);
    expect(lauf.failed).toEqual([]);
    expect(gerufen).toHaveLength(3);
  });

  it("öffnet kein einziges Profil, wenn die allgemeine Liste kam", async () => {
    const gerufen: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      gerufen.push(url);
      // Genau der gefährliche Fall: HTTP 200, achtzehn Profile — nur zum
      // falschen Skill.
      const html = `${ALLGEMEIN_TITEL}<a href="/profil/a">1</a><a href="/profil/b">2</a>`;
      return { ok: true, status: 200, text: async () => html };
    };

    const lauf = await sourceFromFreelancermap({
      skill: "C++",
      limit: 5,
      fetchImpl,
      pauseMs: 0,
      skillIndex: INDEX,
    });

    expect(lauf.skillPageFound).toBe(false);
    expect(lauf.profiles).toEqual([]);
    expect(gerufen).toEqual(["https://www.freelancermap.de/freelancer/c-plus-plus"]);
  });

  it("hält bei einem einzelnen Fehlschlag nicht den ganzen Lauf an", async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url.endsWith("/profil/b")) {
        return { ok: false, status: 404, text: async () => "" };
      }
      const html = url.includes("/profil/")
        ? profilSeite()
        : `${SKILL_TITEL}<a href="/profil/a">1</a><a href="/profil/b">2</a>`;
      return { ok: true, status: 200, text: async () => html };
    };

    const lauf = await sourceFromFreelancermap({
      skill: "TypeScript",
      limit: 2,
      fetchImpl,
      pauseMs: 0,
      skillIndex: INDEX,
    });

    expect(lauf.profiles).toHaveLength(1);
    expect(lauf.failed).toEqual([
      {
        url: "https://www.freelancermap.de/profil/b",
        reason: expect.stringContaining("404"),
      },
    ]);
  });
});
