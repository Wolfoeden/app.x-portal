/**
 * Sprachangaben im Profil, auf Deutsch und einheitlich (Audit P2, Profiltexte).
 *
 * Die Profile führen Sprachen gemischt: Am 01.10.2026 stand bei 64 aktiven
 * Profilen „German“, bei 3 „Deutsch“, dazu „English“, „Englisch
 * (verhandlungssicher)“, „Polish“, „Greek“. Nebeneinander erschwert das den
 * schnellen Vergleich. Die Anzeige übersetzt die Sprache und gängige
 * Niveauangaben; was sie nicht kennt, bleibt wie eingetragen. Die Daten und
 * das Matching bleiben unverändert.
 */

const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  arabic: "Arabisch",
  bulgarian: "Bulgarisch",
  chinese: "Chinesisch",
  croatian: "Kroatisch",
  czech: "Tschechisch",
  danish: "Dänisch",
  dutch: "Niederländisch",
  english: "Englisch",
  finnish: "Finnisch",
  french: "Französisch",
  german: "Deutsch",
  greek: "Griechisch",
  hindi: "Hindi",
  hungarian: "Ungarisch",
  italian: "Italienisch",
  japanese: "Japanisch",
  korean: "Koreanisch",
  norwegian: "Norwegisch",
  persian: "Persisch",
  polish: "Polnisch",
  portuguese: "Portugiesisch",
  romanian: "Rumänisch",
  russian: "Russisch",
  serbian: "Serbisch",
  slovak: "Slowakisch",
  spanish: "Spanisch",
  swedish: "Schwedisch",
  turkish: "Türkisch",
  ukrainian: "Ukrainisch",
};

const LEVELS: ReadonlyArray<[RegExp, string]> = [
  [/^(?:native(?:\s+speaker)?|mother\s+tongue)$/iu, "Muttersprache"],
  [/^(?:business\s+fluent|full\s+professional(?:\s+proficiency)?|professional)$/iu, "verhandlungssicher"],
  [/^(?:fluent|fluently)$/iu, "fließend"],
  [/^(?:very\s+good|advanced)$/iu, "sehr gut"],
  [/^(?:good|intermediate|conversational)$/iu, "gut"],
  [/^(?:basic|basics|beginner|elementary)$/iu, "Grundkenntnisse"],
];

function level(text: string): string {
  const trimmed = text.trim();
  return LEVELS.find(([pattern]) => pattern.test(trimmed))?.[1] ?? trimmed;
}

/** „German“ → „Deutsch“, „English (fluent)“ → „Englisch (fließend)“, „english C1“ → „Englisch C1“. */
export function presentProfileLanguage(value: string): string {
  const match = /^\s*([A-Za-zÄÖÜäöüß]+)\b\s*(.*)$/u.exec(value);
  if (!match) return value.trim();
  const [, word, rest] = match;
  const german = LANGUAGE_NAMES[word!.toLowerCase()];
  const name = german ?? (word!.charAt(0).toLocaleUpperCase("de-DE") + word!.slice(1));
  const tail = rest!.trim();
  if (!tail) return name;
  const bracket = /^\((.+)\)$/u.exec(tail);
  if (bracket) return `${name} (${level(bracket[1]!)})`;
  const dash = /^[-–:,]\s*(.+)$/u.exec(tail);
  if (dash) return `${name} (${level(dash[1]!)})`;
  return `${name} ${level(tail)}`;
}

/**
 * Alle Sprachen eines Profils, übersetzt und ohne Dopplungen: „German“ und
 * „Deutsch“ werden eins, und „Deutsch“ entfällt neben „Deutsch (Muttersprache)“.
 */
export function presentProfileLanguages(values: readonly string[]): string[] {
  const unique = [...new Set(values.map(presentProfileLanguage))];
  return unique.filter((entry) => !unique.some((other) => other !== entry && other.startsWith(`${entry} `)));
}
