import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseFallbackBrief } from "@/lib/domain";
import type { ExternalFreelancerCandidate } from "@/lib/openai/external-freelancer-search";
import { demandFromSearch } from "@/lib/sourcing/absorb-search";

function kandidat(
  patch: Partial<ExternalFreelancerCandidate> = {},
): ExternalFreelancerCandidate {
  return {
    displayName: "Nikolai Schankin",
    role: "Freiberuflicher Software-Entwickler",
    summary: "Datenbanken und Prozessautomatisierung seit 2003.",
    matchedRequirements: ["PostgreSQL", "Docker"],
    knownGaps: [],
    profileUrl: "https://www.freelancermap.de/profil/nikolai-schankin",
    bookingUrl: null,
    linkedinUrl: null,
    websiteUrl: null,
    portfolioUrl: null,
    contactEmail: null,
    skills: ["PostgreSQL", "Docker", "Airflow"],
    activities: [],
    projects: [],
    sourceUrls: ["https://www.freelancermap.de/profil/nikolai-schankin"],
    verificationStatus: "external_unverified",
    nameVerified: true,
    ...patch,
  };
}

describe("demandFromSearch", () => {
  const brief = parseFallbackBrief(
    "Wir suchen Unterstützung bei einer Datenmigration nach PostgreSQL. " +
      "Erforderlich sind PostgreSQL, Docker und Airflow. Remote möglich.",
    { now: new Date("2026-09-08T10:00:00.000Z") },
  );

  it("macht aus der Kundensuche den Anlass der Einladung", () => {
    const demand = demandFromSearch({ brief, candidate: kandidat() });
    expect(demand.headline.length).toBeGreaterThan(0);
    // Die erfüllten Anforderungen stammen aus dem Abgleich der Suche und
    // müssen nicht neu berechnet werden.
    expect(demand.matchingSkills).toEqual(["PostgreSQL", "Docker"]);
  });

  it("nennt unter 'weitere' nicht noch einmal, was schon erfüllt ist", () => {
    const demand = demandFromSearch({ brief, candidate: kandidat() });
    for (const wert of demand.matchingSkills ?? []) {
      expect(demand.otherSkills).not.toContain(wert);
    }
  });

  it("übernimmt die Arbeitsform aus dem Brief, ohne sie zu raten", () => {
    const demand = demandFromSearch({ brief, candidate: kandidat() });
    expect(["remote", "on_site", "hybrid", "unknown"]).toContain(demand.workMode);
  });

  it("kommt ohne erfüllte Anforderungen aus", () => {
    const demand = demandFromSearch({
      brief,
      candidate: kandidat({ matchedRequirements: [] }),
    });
    expect(demand.matchingSkills).toEqual([]);
    expect(demand.headline.length).toBeGreaterThan(0);
  });
});
