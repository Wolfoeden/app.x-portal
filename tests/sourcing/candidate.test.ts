import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  candidateFromProfile,
  candidateSummary,
  profileUrlCarriesName,
} from "@/lib/sourcing/candidate";
import type { FreelancermapProfile } from "@/lib/sourcing/freelancermap";

function profil(patch: Partial<FreelancermapProfile> = {}): FreelancermapProfile {
  return {
    profileUrl: "https://www.freelancermap.de/profil/bojan-bizic",
    displayName: "Bojan Bizic",
    role: "Senior Software-Architekt & Fullstack Developer",
    location: "München",
    countryCode: "DE",
    hourlyRate: { amount: 90, currency: "EUR" },
    skills: ["TypeScript", "Kubernetes", "Kafka"],
    languages: ["Deutsch (verhandlungssicher)", "Englisch (verhandlungssicher)"],
    about: "Senior Software- und Cloud-Architekt mit 18 Jahren Erfahrung.",
    ...patch,
  };
}

describe("candidateSummary", () => {
  it("nimmt die Selbstbeschreibung und füllt mit Belegtem auf", () => {
    const text = candidateSummary(profil());
    expect(text).toContain("Cloud-Architekt");
    expect(text).toContain("Kompetenzen: TypeScript, Kubernetes, Kafka");
  });

  it("kommt ohne Selbstbeschreibung aus, solange Rolle und Skills tragen", () => {
    const text = candidateSummary(profil({ about: null }));
    expect(text).not.toBeNull();
    expect(text!.length).toBeGreaterThanOrEqual(40);
  });

  it("gibt null zurück, statt Text zu erfinden", () => {
    expect(
      candidateSummary(profil({ about: null, role: "Dev", skills: [] })),
    ).toBeNull();
  });
});

describe("profileUrlCarriesName", () => {
  it("erkennt den Namen in der Profiladresse", () => {
    expect(
      profileUrlCarriesName(
        "https://www.freelancermap.de/profil/bojan-bizic",
        "Bojan Bizic",
      ),
    ).toBe(true);
  });

  it("verlangt Vor- UND Nachname, nicht nur einen davon", () => {
    expect(
      profileUrlCarriesName(
        "https://www.freelancermap.de/profil/php-entwickler-145540",
        "Bojan Bizic",
      ),
    ).toBe(false);
    expect(
      profileUrlCarriesName(
        "https://www.freelancermap.de/profil/bizic-team",
        "Bojan Bizic",
      ),
    ).toBe(false);
  });

  it("übersteht Umlaute im Namen", () => {
    expect(
      profileUrlCarriesName(
        "https://www.freelancermap.de/profil/juergen-roeck",
        "Jürgen Röck",
      ),
    ).toBe(true);
  });
});

describe("candidateFromProfile", () => {
  it("bildet die Form ab, die Übernahme und Ansprache erwarten", () => {
    const kandidat = candidateFromProfile(profil());
    expect(kandidat).not.toBeNull();
    expect(kandidat!.displayName).toBe("Bojan Bizic");
    expect(kandidat!.sourceUrls).toEqual([
      "https://www.freelancermap.de/profil/bojan-bizic",
    ]);
    expect(kandidat!.verificationStatus).toBe("external_unverified");
    expect(kandidat!.nameVerified).toBe(true);
  });

  it("behauptet keine Adresse und keinen Kalender", () => {
    const kandidat = candidateFromProfile(profil());
    // freelancermap veröffentlicht beides nicht. Etwas anderes einzutragen
    // hieße, es zu erfinden.
    expect(kandidat!.contactEmail).toBeNull();
    expect(kandidat!.bookingUrl).toBeNull();
    expect(kandidat!.websiteUrl).toBeNull();
    expect(kandidat!.linkedinUrl).toBeNull();
  });

  it("behauptet keinen Abgleich mit einer Ausschreibung", () => {
    const kandidat = candidateFromProfile(profil());
    expect(kandidat!.matchedRequirements).toEqual([]);
    expect(kandidat!.knownGaps).toEqual([]);
  });

  it("trägt Ort, Satz und Sprachen als belegte Angaben mit", () => {
    const kandidat = candidateFromProfile(profil());
    expect(kandidat!.activities).toContain("Standort München, DE");
    expect(kandidat!.activities).toContain("Stundensatz 90 EUR");
    expect(kandidat!.activities).toContain("Sprache Deutsch (verhandlungssicher)");
  });

  it("lässt einen Satz weg, den die Quelle nicht hatte", () => {
    const kandidat = candidateFromProfile(profil({ hourlyRate: null }));
    expect(kandidat!.activities.some((wert) => wert.startsWith("Stundensatz"))).toBe(
      false,
    );
  });

  it("verwirft ein Profil ohne Namen oder ohne Rolle", () => {
    expect(candidateFromProfile(profil({ displayName: null }))).toBeNull();
    expect(candidateFromProfile(profil({ role: null }))).toBeNull();
  });
});
