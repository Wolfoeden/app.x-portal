import { describe, expect, it } from "vitest";

import { factPreview, FACT_PREVIEW_WORDS } from "@/components/chat/fact-preview";

describe("fact preview", () => {
  it("leaves a short entry untouched and offers nothing to expand", () => {
    const result = factPreview(["React", "TypeScript"]);

    expect(result.preview).toBe("React · TypeScript");
    expect(result.truncated).toBe(false);
  });

  it("keeps the first words and marks the rest as hidden", () => {
    const result = factPreview([
      "Zwoelf Jahre Erfahrung mit React, Next.js und verteilten Systemen im Handel",
    ]);

    expect(result.truncated).toBe(true);
    expect(result.preview.split(/\s+/)).toHaveLength(FACT_PREVIEW_WORDS + 1); // plus Auslassungszeichen
    expect(result.preview.startsWith("Zwoelf Jahre Erfahrung mit React,")).toBe(true);
    expect(result.preview.endsWith("…")).toBe(true);
  });

  it("keeps the full text available for the expanded state", () => {
    const facts = ["Erste sehr lange Angabe mit vielen Worten", "Zweite Angabe"];
    const result = factPreview(facts);

    expect(result.full).toBe(facts.join(" · "));
    expect(result.full.length).toBeGreaterThan(result.preview.length);
  });

  // Genau auf der Grenze gibt es nichts zu verbergen — ein "mehr anzeigen",
  // das nichts nachliefert, ist ein Versprechen ins Leere.
  it("does not truncate at exactly the word limit", () => {
    const words = Array.from({ length: FACT_PREVIEW_WORDS }, (_, i) => `Wort${i}`);
    const result = factPreview([words.join(" ")]);

    expect(result.truncated).toBe(false);
    expect(result.preview).toBe(words.join(" "));
  });

  it("handles a profile without any self-reported facts", () => {
    const result = factPreview([]);

    expect(result).toEqual({ preview: "", full: "", truncated: false });
  });
});
