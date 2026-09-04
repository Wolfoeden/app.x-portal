import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  researchSkills,
  researchSummary,
  sourcedCandidateInsert,
} from "@/lib/freelancer/sourced-candidate-import";
import type { ExternalFreelancerCandidate } from "@/lib/openai/external-freelancer-search";

/**
 * Die Abbildung eines Suchtreffers auf einen Kandidaten.
 *
 * Der eine Fehler, der hier nicht passieren darf, ist Erfinden. Alles, was in
 * der Zeile landet, muss aus den Belegen der Suche stammen — was fehlt, bleibt
 * leer und wird von der Person selbst ergänzt, wenn sie zustimmt.
 */

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const SOURCED_AT = "2026-09-05T10:00:00.000Z";

function candidate(
  overrides: Partial<ExternalFreelancerCandidate> = {},
): ExternalFreelancerCandidate {
  return {
    displayName: "Anna Beispiel",
    role: "React Freelancer",
    summary:
      "Entwickelt seit acht Jahren Weboberflächen mit React und TypeScript.",
    matchedRequirements: ["React", "TypeScript"],
    knownGaps: [],
    profileUrl: "https://anna-beispiel.example/ueber-mich",
    bookingUrl: null,
    linkedinUrl: null,
    websiteUrl: "https://anna-beispiel.example/ueber-mich",
    portfolioUrl: null,
    contactEmail: null,
    skills: ["React", "TypeScript"],
    activities: [],
    projects: [],
    sourceUrls: ["https://anna-beispiel.example/ueber-mich"],
    verificationStatus: "external_unverified",
    nameVerified: true,
    ...overrides,
  };
}

describe("researchSummary", () => {
  it("nimmt die Zusammenfassung, wenn sie lang genug ist", () => {
    expect(researchSummary(candidate())).toContain("React und TypeScript");
  });

  it("füllt eine zu kurze Zusammenfassung mit belegten Angaben auf", () => {
    // Die Spalte verlangt 40 Zeichen. Aufgefüllt wird mit Tätigkeiten und
    // Projekten derselben Person — nicht mit erfundenem Text.
    const summary = researchSummary(
      candidate({
        summary: "React-Entwicklerin.",
        activities: ["Baut Designsysteme", "Führt Code-Reviews durch"],
      }),
    );

    expect(summary).not.toBeNull();
    expect(summary!.length).toBeGreaterThanOrEqual(40);
    expect(summary).toContain("Designsysteme");
  });

  it("gibt null zurück, wenn nichts Verwertbares da ist", () => {
    // Lieber keinen Kandidaten als einen mit ausgedachtem Text: Der Text
    // stünde später in der Ansprache an diese Person.
    expect(
      researchSummary({ summary: "Freelancer.", activities: [], projects: [] }),
    ).toBeNull();
  });
});

describe("researchSkills", () => {
  it("nimmt die belegten Skills", () => {
    expect(researchSkills(candidate())).toEqual(["React", "TypeScript"]);
  });

  it("weicht auf die erfüllten Anforderungen aus, wenn Skills fehlen", () => {
    expect(
      researchSkills(
        candidate({ skills: [], matchedRequirements: ["Node.js", "AWS"] }),
      ),
    ).toEqual(["Node.js", "AWS"]);
  });

  it("bleibt leer, wenn beides fehlt", () => {
    // Erlaubt seit 20260905120000_sourced_candidate_import.sql: Eine Recherche
    // darf unvollständig sein, eine Freigabe nicht.
    expect(
      researchSkills(candidate({ skills: [], matchedRequirements: [] })),
    ).toEqual([]);
  });

  it("entdoppelt und wirft überlange Einträge weg", () => {
    expect(
      researchSkills(
        candidate({ skills: ["React", "React", "x".repeat(200)] }),
      ),
    ).toEqual(["React"]);
  });
});

describe("sourcedCandidateInsert", () => {
  it("legt einen Kandidaten ohne Einwilligung und ohne geratene Angaben an", () => {
    const row = sourcedCandidateInsert({
      candidate: candidate(),
      adminId: ADMIN_ID,
      sourcedAt: SOURCED_AT,
    });

    expect(row).toMatchObject({
      status: "sourced",
      source: "web_research",
      // Die beiden Werte zusammen machen eine Freigabe auf Datenbankebene
      // unmöglich und starten die 30-Tage-Frist.
      consent_at: null,
      sourced_at: SOURCED_AT,
      sourced_by_user_id: ADMIN_ID,
      submitted_by_user_id: null,
      source_profile_url: "https://anna-beispiel.example/ueber-mich",
      full_name: "Anna Beispiel",
      availability_status: "unknown",
    });
    // Sprache, Qualifikationen und Branchen kennt eine Websuche nicht.
    expect(row).toMatchObject({
      languages: [],
      qualifications: [],
      industries: [],
    });
  });

  it("übernimmt eine geprüfte Kontaktadresse", () => {
    const row = sourcedCandidateInsert({
      candidate: candidate({ contactEmail: "kontakt@anna-beispiel.example" }),
      adminId: ADMIN_ID,
      sourcedAt: SOURCED_AT,
    });

    expect(row?.contact_email).toBe("kontakt@anna-beispiel.example");
  });

  it("kommt ohne Kontaktadresse aus", () => {
    // Der Regelfall. Die Ansprache läuft dann über LinkedIn oder die eigene
    // Seite — ein Kandidat ohne Adresse ist trotzdem einer.
    const row = sourcedCandidateInsert({
      candidate: candidate(),
      adminId: ADMIN_ID,
      sourcedAt: SOURCED_AT,
    });

    expect(row?.contact_email).toBeNull();
  });

  it("verweigert die Zeile, wenn kein verwertbarer Text entsteht", () => {
    expect(
      sourcedCandidateInsert({
        candidate: candidate({ summary: "Freelancer.", activities: [], projects: [] }),
        adminId: ADMIN_ID,
        sourcedAt: SOURCED_AT,
      }),
    ).toBeNull();
  });

  it("hält die Grenzen der Spalten ein", () => {
    const row = sourcedCandidateInsert({
      candidate: candidate({
        displayName: "A".repeat(200),
        role: "R".repeat(300),
        summary: "S".repeat(3_000),
        activities: Array.from({ length: 40 }, (_, index) => `Tätigkeit ${index}`),
        projects: Array.from({ length: 40 }, (_, index) => `Projekt ${index}`),
        sourceUrls: Array.from(
          { length: 8 },
          (_, index) => `https://beleg-${index}.example/`,
        ),
      }),
      adminId: ADMIN_ID,
      sourcedAt: SOURCED_AT,
    });

    expect(String(row?.full_name)).toHaveLength(120);
    expect(String(row?.role_title)).toHaveLength(160);
    expect(String(row?.experience_summary).length).toBeLessThanOrEqual(2_000);
    expect(row?.activities).toHaveLength(20);
    expect(row?.projects).toHaveLength(20);
    expect(row?.source_urls).toHaveLength(8);
  });
});
