import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { derivedDomains, MAX_DERIVED_DOMAINS } from "@/lib/sourcing/derived-domains";

describe("derivedDomains", () => {
  it("bildet die üblichen Formen aus Vor- und Nachnamen", () => {
    const liste = derivedDomains("Nikolai Schankin");
    expect(liste).toContain("nikolai-schankin.de");
    expect(liste).toContain("schankin-nikolai.de");
    expect(liste).toContain("nikolaischankin.de");
    expect(liste[0]).toBe("nikolai-schankin.de");
  });

  it("schlägt niemals den blossen Nachnamen vor", () => {
    // Gemessener Fehlschlag einer ersten Fassung: `schwarz.de` ist ein
    // Handelskonzern, `stoll.com` eine Maschinenfabrik. Beide wurden als
    // Treffer gezählt, weil der Nachname auf der Seite vorkam — er kommt
    // dort vor, nur als der einer anderen Familie.
    for (const kandidat of derivedDomains("Nico Schwarz")) {
      expect(kandidat).not.toBe("schwarz.de");
      expect(kandidat).not.toBe("schwarz.com");
    }
  });

  it("übersetzt Umlaute wie eine Domain es täte", () => {
    expect(derivedDomains("Jürgen Röck")).toContain("juergen-roeck.de");
  });

  it("übergeht Zwischennamen", () => {
    const liste = derivedDomains("Karsten Andreas Seidel");
    expect(liste).toContain("karsten-seidel.de");
    expect(liste.some((wert) => wert.includes("andreas"))).toBe(false);
  });

  it("gibt nichts zurück, wo kein voller Name dasteht", () => {
    expect(derivedDomains("Informatiker")).toEqual([]);
    expect(derivedDomains("")).toEqual([]);
    // Ein zweibuchstabiger Nachname traegt keine Domain.
    expect(derivedDomains("Max Li")).toEqual([]);
  });

  it("bleibt in der Zahl begrenzt", () => {
    expect(derivedDomains("Nikolai Schankin").length).toBeLessThanOrEqual(
      MAX_DERIVED_DOMAINS,
    );
  });

  it("probiert .de zuerst", () => {
    const liste = derivedDomains("Nikolai Schankin");
    const ersterCom = liste.findIndex((wert) => wert.endsWith(".com"));
    const letzterDe = liste.map((wert) => wert.endsWith(".de")).lastIndexOf(true);
    expect(letzterDe).toBeLessThan(ersterCom);
  });
});
