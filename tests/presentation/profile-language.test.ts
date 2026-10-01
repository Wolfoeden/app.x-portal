import { describe, expect, it } from "vitest";

import { presentProfileLanguage, presentProfileLanguages } from "@/lib/presentation/profile-language";

// Audit P2: einheitliche Begriffe für Sprache in den Profilen. In den
// aktiven Profilen standen „German“, „Deutsch“, „English“, „Polish“ … gemischt.
describe("profile languages in German", () => {
  it.each([
    ["German", "Deutsch"],
    ["English", "Englisch"],
    ["english", "Englisch"],
    ["Polish", "Polnisch"],
    ["Greek", "Griechisch"],
    ["deutsch", "Deutsch"],
    ["Deutsch (Muttersprache)", "Deutsch (Muttersprache)"],
    ["Englisch (verhandlungssicher)", "Englisch (verhandlungssicher)"],
    ["English (fluent)", "Englisch (fließend)"],
    ["German (native)", "Deutsch (Muttersprache)"],
    ["English - business fluent", "Englisch (verhandlungssicher)"],
    ["English C1", "Englisch C1"],
    ["Niederländisch", "Niederländisch"],
  ])("shows %j as %j", (value, expected) => {
    expect(presentProfileLanguage(value)).toBe(expected);
  });

  it("merges duplicates and keeps the entry with a level", () => {
    expect(presentProfileLanguages(["German", "Deutsch", "English"])).toEqual(["Deutsch", "Englisch"]);
    expect(presentProfileLanguages(["German", "Deutsch (Muttersprache)"])).toEqual(["Deutsch (Muttersprache)"]);
  });

  it("leaves what it does not know as entered", () => {
    expect(presentProfileLanguage("Engllish")).toBe("Engllish");
    expect(presentProfileLanguage("Schweizerdeutsch")).toBe("Schweizerdeutsch");
  });
});
