import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { fitCaption } from "@/components/profile/FitBar";
import { summaryExcerpt } from "@/lib/profile/excerpt";
import { profileField } from "@/lib/profile/field";
import { MONOGRAM_TONES, monogramTone } from "@/lib/profile/identity";

const css = readFileSync(join(process.cwd(), "app/styles/workspace.css"), "utf8");

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

describe("the monogram tone", () => {
  it("is fixed per name, regardless of case and spacing", () => {
    expect(monogramTone("Kim Beispiel")).toBe(monogramTone("  kim   BEISPIEL "));
    expect(monogramTone("Kim Beispiel")).toBeGreaterThanOrEqual(0);
    expect(monogramTone("Kim Beispiel")).toBeLessThan(MONOGRAM_TONES);
  });

  it("spreads names over the palette", () => {
    const tones = new Set(["Anna", "Ben", "Clara", "Deniz", "Emil", "Fatma", "Greta", "Hamid", "Ida", "Jonas", "Kira", "Lars"].map(monogramTone));
    expect(tones.size).toBeGreaterThanOrEqual(6);
  });

  it("has a readable colour for every tone, with white initials", () => {
    for (let tone = 0; tone < MONOGRAM_TONES; tone += 1) {
      const color = css.match(new RegExp(`\\.pid\\[data-tone="${tone}"\\] \\{ --pid: (#[0-9a-f]{6}); \\}`, "u"))?.[1];
      expect(color, `tone ${tone}`).toBeDefined();
      expect(contrast("#ffffff", color!)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("the field band", () => {
  it("reads the field from the role first, the more specific field winning", () => {
    expect(profileField("KI-Fullstack-Entwickler", [])).toBe("ai");
    expect(profileField("Senior Frontend-Entwicklerin", [])).toBe("frontend");
    expect(profileField("Business Analyst & Requirements Engineer", [])).toBe("requirements");
    expect(profileField("SAP MM Berater", [])).toBe("sap");
  });

  it("falls back to the skills, and to nothing without a clue", () => {
    expect(profileField("Freelancer", ["LangChain", "AI Agents"])).toBe("ai");
    expect(profileField("Berater", ["React", "TypeScript"])).toBe("frontend");
    expect(profileField("Berater", ["Kommunikation"])).toBeNull();
  });

  it("labels every field the same calm way, without a coloured band", () => {
    // Oktober 2026: Das Pastellband mit Punktraster je Fachgebiet ist weg;
    // das Fachgebiet steht als ruhiges Etikett wie die Prüfung daneben.
    expect(css).not.toMatch(/\.pband\[data-field=/u);
    expect(css).not.toContain("--band-a");
    const label = css.match(/\.pband-label,\n\.pband-verified \{[^}]*color: var\(--muted\);/u);
    expect(label).not.toBeNull();
    const muted = readFileSync(join(process.cwd(), "app/styles/foundation.css"), "utf8").match(/--muted: (#[0-9a-f]{6});/u)?.[1];
    expect(contrast(muted!, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the evidence bar", () => {
  it("counts evidence without a percentage", () => {
    expect(
      fitCaption(
        [
          { label: "React", state: "verified" },
          { label: "TypeScript", state: "stated" },
          { label: "Next.js", state: "stated" },
          { label: "Deutsch", state: "missing" },
        ],
        "Anforderungen",
      ),
    ).toBe("3 von 4 Anforderungen belegt · 1 geprüft");
    expect(fitCaption([{ label: "AI Agents", state: "stated" }], "Kompetenz für die Rolle")).toBe("1 Kompetenz für die Rolle belegt");
  });
});

describe("the summary excerpt", () => {
  it("takes the first sentence and cuts long ones at a word", () => {
    expect(summaryExcerpt("Baut Agenten. Seit 2019 freiberuflich.")).toBe("Baut Agenten.");
    const long = summaryExcerpt(`${"Sehr lange Beschreibung ".repeat(12)}ohne Punkt`, 60)!;
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("…")).toBe(true);
    expect(summaryExcerpt("   ")).toBeNull();
  });
});
