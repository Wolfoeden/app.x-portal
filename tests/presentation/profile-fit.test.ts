import { describe, expect, it } from "vitest";

import { profileFitSummary } from "@/components/chat/profile-fit";

const THRESHOLD = 60;

function profile(overrides: Partial<Parameters<typeof profileFitSummary>[0]> = {}) {
  return {
    recommendationRole: "primary" as const,
    coreCoverage: 100,
    knownGaps: [] as string[],
    matchReasons: ["React belegt", "Deutsch belegt"],
    ...overrides,
  };
}

describe("profile fit summary", () => {
  it("says plainly when every core requirement is covered", () => {
    const fit = profileFitSummary(profile(), THRESHOLD);

    expect(fit.tone).toBe("strong");
    expect(fit.headline).toBe("Erfüllt alle Kernanforderungen");
    expect(fit.detail).toContain("2 Belege");
    expect(fit.detail).toContain("nichts offen");
  });

  it("does not claim completeness below full coverage", () => {
    const fit = profileFitSummary(profile({ coreCoverage: 80 }), THRESHOLD);

    expect(fit.tone).toBe("strong");
    expect(fit.headline).not.toContain("alle");
    expect(fit.coverage).toBe(80);
  });

  it("marks an alternative without overselling it", () => {
    const fit = profileFitSummary(
      profile({ recommendationRole: "alternative", coreCoverage: 70, knownGaps: ["Tagessatz offen"] }),
      THRESHOLD,
    );

    expect(fit.tone).toBe("ok");
    expect(fit.headline).toBe("Kommt als Alternative infrage");
    expect(fit.detail).toContain("1 offener Punkt");
  });

  // Der Grund, warum jemand nicht empfohlen wird, ist die wichtigste Aussage
  // auf so einer Karte — er darf nicht hinter einer Prozentzahl verschwinden.
  it("leads a partial match with what is missing and names the threshold", () => {
    const fit = profileFitSummary(
      profile({
        recommendationRole: "partial",
        coreCoverage: 40,
        knownGaps: ["SAP FI/CO fehlt", "Deutsch nicht belegt"],
      }),
      THRESHOLD,
    );

    expect(fit.tone).toBe("warning");
    expect(fit.headline).toBe("2 Muss-Kriterien ohne Beleg");
    expect(fit.detail).toContain("60 %");
    expect(fit.detail).toContain("40 %");
  });

  it("keeps singular and plural apart", () => {
    const one = profileFitSummary(
      profile({ recommendationRole: "partial", knownGaps: ["Deutsch nicht belegt"] }),
      THRESHOLD,
    );

    expect(one.headline).toBe("1 Muss-Kriterium ohne Beleg");
  });

  it("stays truthful when nothing was scored", () => {
    const fit = profileFitSummary(
      profile({ recommendationRole: "partial", coreCoverage: null, knownGaps: [] }),
      THRESHOLD,
    );

    expect(fit.coverage).toBeNull();
    expect(fit.headline).toBe("Muss-Kriterien nicht vollständig belegt");
    expect(fit.detail).not.toContain("%");
  });

  it("does not invent evidence when none was supplied", () => {
    const fit = profileFitSummary(profile({ matchReasons: [] }), THRESHOLD);

    expect(fit.detail).toContain("keine Belege übermittelt");
  });
});
