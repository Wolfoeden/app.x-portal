import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildWantedProfile,
  wantedProfileText,
  type WantedProfileInput,
} from "@/lib/sourcing/wanted-profile";

function facets(...werte: [string, number][]) {
  return werte.map(([label, count]) => ({ label, count }));
}

const BASIS: WantedProfileInput = {
  profileKey: "react|typescript",
  profileLabel: "React + TypeScript",
  requiredSkills: facets(["React", 14], ["TypeScript", 12], ["PostgreSQL", 5]),
  optionalSkills: facets(["Docker", 4], ["React", 2]),
  openSupplyGaps: facets(["TypeScript", 12]),
  locations: facets(["Hamburg", 6]),
  workModes: facets(["remote", 9], ["hybrid", 3]),
  languages: facets(["Deutsch", 12]),
  searches: 14,
  uniqueSeekers: 6,
  noReliableMatch: 12,
  averageResults: 0.4,
};

describe("buildWantedProfile", () => {
  it("beschreibt eine Rolle, ohne eine zu erfinden", () => {
    // „Senior Fullstack Engineer" waere eine Behauptung ueber eine Stelle, die
    // niemand ausgeschrieben hat. Die fuehrenden Pflichtkompetenzen sind das,
    // was belegt ist.
    const profil = buildWantedProfile(BASIS);
    expect(profil.roleTitle).toBe("Freelancer für React und TypeScript");
  });

  it("trennt Pflicht von Kür und zählt nichts doppelt", () => {
    const profil = buildWantedProfile(BASIS);
    expect(profil.mustHave).toEqual(["React", "TypeScript", "PostgreSQL"]);
    // React steht schon als Pflicht — als „von Vorteil" waere es Unsinn.
    expect(profil.niceToHave).toEqual(["Docker"]);
  });

  it("nimmt Arbeitsform und Ort aus der Mehrheit", () => {
    const profil = buildWantedProfile(BASIS);
    expect(profil.workMode).toBe("remote");
    expect(profil.location).toBe("Hamburg");
  });

  it("behauptet keine Arbeitsform, die nicht dasteht", () => {
    const profil = buildWantedProfile({ ...BASIS, workModes: [] });
    expect(profil.workMode).toBe("unknown");
  });

  it("belegt die Nachfrage mit Zahlen statt mit Adjektiven", () => {
    // „Hohe Nachfrage" traegt keine Entscheidung, „14 Anfragen von 6
    // Auftraggebern" schon.
    const profil = buildWantedProfile(BASIS);
    expect(profil.evidence).toContain("14 Anfragen");
    expect(profil.evidence).toContain("6 verschiedenen Auftraggebern");
    expect(profil.evidence).toContain("12 davon ohne Treffer");
  });

  it("beugt die Einzahl richtig", () => {
    const profil = buildWantedProfile({
      ...BASIS,
      searches: 1,
      uniqueSeekers: 1,
      noReliableMatch: 0,
      averageResults: 0,
    });
    expect(profil.evidence).toBe("1 Anfrage, von 1 Auftraggeber");
  });

  it("nennt, woran der Abgleich bisher scheiterte", () => {
    expect(buildWantedProfile(BASIS).criticalGaps).toEqual(["TypeScript"]);
  });

  it("enthält keine Person", () => {
    // Ein Wunschprofil ist ein Steckbrief, kein Kandidat. Weder Name noch
    // Adresse gehoeren hinein — die kommen erst, wenn jemand gefunden wurde.
    const alsText = JSON.stringify(buildWantedProfile(BASIS)).toLowerCase();
    expect(alsText).not.toContain("@");
    expect(alsText).not.toContain("displayname");
    expect(alsText).not.toContain("email");
  });

  it("kommt mit einem leeren Profil zurecht", () => {
    const leer = buildWantedProfile({
      ...BASIS,
      requiredSkills: [],
      optionalSkills: [],
      openSupplyGaps: [],
      locations: [],
      languages: [],
    });
    expect(leer.roleTitle).toBe("React + TypeScript");
    expect(leer.mustHave).toEqual([]);
    expect(leer.location).toBeNull();
  });
});

describe("wantedProfileText", () => {
  it("ergibt einen Text, mit dem man losgehen kann", () => {
    const text = wantedProfileText(buildWantedProfile(BASIS));
    expect(text).toContain("Freelancer für React und TypeScript");
    expect(text).toContain("Muss können: React, TypeScript, PostgreSQL");
    expect(text).toContain("Arbeitsform: remote · Hamburg");
    expect(text).toContain("Belegte Nachfrage: 14 Anfragen");
  });

  it("lässt Zeilen weg, für die es keine Angabe gibt", () => {
    const text = wantedProfileText(
      buildWantedProfile({ ...BASIS, languages: [], optionalSkills: [] }),
    );
    expect(text).not.toContain("Sprache:");
    expect(text).not.toContain("Von Vorteil:");
  });
});
