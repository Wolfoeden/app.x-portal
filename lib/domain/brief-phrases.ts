import type { ProjectDuration, RateRange, StartWindow } from "./brief";

/**
 * Deutsche Formulierungen für Start, Satz, Wochenumfang, Laufzeit und
 * Sprachniveau, die die Basisanalyse bisher überlas.
 *
 * Fiel die KI-Analyse aus, gingen im Audit vom 30.09.2026 bei einem
 * gewöhnlichen React-Brief Start („15.10.2026“), Tagessatz („max. 800 € netto
 * /Tag“), Umfang („3 Tage/Woche“) und das Niveau „C1“ verloren, und zwar auch
 * nach Korrektur im Chat und im Formular (F01). Die Regeln hier erkennen nur
 * ausdrückliche Angaben; was nicht eindeutig ist, bleibt leer, statt geraten
 * zu werden.
 */

const MONTHS: ReadonlyArray<readonly [RegExp, number]> = [
  [/^(?:januar|jänner|jan|january)$/u, 0],
  [/^(?:februar|feb|february)$/u, 1],
  [/^(?:märz|maerz|mär|mrz|march|mar)$/u, 2],
  [/^(?:april|apr)$/u, 3],
  [/^(?:mai|may)$/u, 4],
  [/^(?:juni|jun|june)$/u, 5],
  [/^(?:juli|jul|july)$/u, 6],
  [/^(?:august|aug)$/u, 7],
  [/^(?:september|sept|sep)$/u, 8],
  [/^(?:oktober|okt|october|oct)$/u, 9],
  [/^(?:november|nov)$/u, 10],
  [/^(?:dezember|dez|december|dec)$/u, 11],
];

const MONTH_WORD =
  "(januar|jänner|jan|january|februar|feb|february|märz|maerz|mär|mrz|march|mar|april|apr|mai|may|juni|jun|june|juli|jul|july|august|aug|september|sept|sep|oktober|okt|october|oct|november|nov|dezember|dez|december|dec)";

const START_KEYWORD =
  "(?:projekt)?start(?:termin|datum)?|projektbeginn|beginn|einstieg|einsatzbeginn|verfügbar\\s+ab|ab|starting|start\\s+date|from";

function monthIndex(word: string): number | null {
  const key = word.toLocaleLowerCase("de-DE").replace(/\.$/u, "");
  return MONTHS.find(([pattern]) => pattern.test(key))?.[1] ?? null;
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function fullYear(raw: string | undefined, month: number, now: Date): number {
  if (raw) {
    const value = Number.parseInt(raw, 10);
    return raw.length === 2 ? 2000 + value : value;
  }
  // Ohne Jahr ist der nächste solche Monat gemeint, nicht der vergangene.
  const year = now.getUTCFullYear();
  return month < now.getUTCMonth() ? year + 1 : year;
}

/** „Start: 15.10.2026“, „ab 1.11.26“, „Projektstart Anfang November“, „Start im Oktober 2026“. */
export function parseStartPhrase(text: string, now: Date): StartWindow | null {
  const numeric = new RegExp(
    `\\b(?:${START_KEYWORD})\\s*(?:am|zum|spätestens|frühestens|on|:|-)?\\s*(\\d{1,2})\\.\\s?(\\d{1,2})\\.\\s?(\\d{4}|\\d{2})(?!\\d)`,
    "iu",
  ).exec(text);
  if (numeric) {
    const month = Number.parseInt(numeric[2]!, 10) - 1;
    const iso = isoDate(fullYear(numeric[3], month, now), month, Number.parseInt(numeric[1]!, 10));
    if (iso) return { raw: numeric[0].trim(), earliest: iso, latest: iso };
  }

  const named = new RegExp(
    `\\b(?:${START_KEYWORD})\\s*(?:am|im|zum|ab|in|on|:|-)?\\s*(?:(anfang|mitte|ende|early|mid|late)\\s+)?(?:(\\d{1,2})\\.?\\s*)?${MONTH_WORD}\\.?(?:\\s+(\\d{4}))?(?![\\p{L}])`,
    "iu",
  ).exec(text);
  if (named) {
    const month = monthIndex(named[3]!);
    if (month !== null) {
      const year = fullYear(named[4], month, now);
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      if (named[2]) {
        const iso = isoDate(year, month, Number.parseInt(named[2], 10));
        if (iso) return { raw: named[0].trim(), earliest: iso, latest: iso };
      }
      const part = named[1]?.toLocaleLowerCase("de-DE");
      const [from, to] =
        part === "anfang" || part === "early"
          ? [1, 10]
          : part === "mitte" || part === "mid"
            ? [11, 20]
            : part === "ende" || part === "late"
              ? [21, lastDay]
              : [1, lastDay];
      return { raw: named[0].trim(), earliest: isoDate(year, month, from), latest: isoDate(year, month, to) };
    }
  }
  return null;
}

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  ein: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6,
  sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12,
};

/** „Laufzeit 3 Monate“, „Projektdauer: 6 Monate“, „3 Monate Laufzeit“. */
export function parseDurationPhrase(text: string): ProjectDuration | null {
  const unit = "(stunden?|tage?n?|wochen?|monate?n?|jahre?n?)";
  const amount = "(\\d+|ein|eine|einen|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf)";
  const leading = new RegExp(
    `\\b(?:laufzeit|projektlaufzeit|projektdauer|einsatzdauer|dauer)\\s*(?:[:=]|von|ca\\.?|circa|mindestens|min\\.?|zunächst)?\\s*${amount}\\s*${unit}(?![\\p{L}])(?!\\s*(?:\\/|pro|je|die|in der)\\s*woche)`,
    "iu",
  ).exec(text);
  const trailing = new RegExp(
    `\\b${amount}\\s*${unit}\\s+(?:laufzeit|projektlaufzeit|projektdauer|einsatzdauer|dauer)\\b`,
    "iu",
  ).exec(text);
  const match = leading ?? trailing;
  if (!match) return null;
  const rawAmount = match[1]!.toLocaleLowerCase("de-DE");
  const value = NUMBER_WORDS[rawAmount] ?? Number.parseInt(rawAmount, 10);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  const rawUnit = match[2]!.toLocaleLowerCase("de-DE");
  if (/^jahr/u.test(rawUnit)) return { raw: match[0].trim(), value: value * 12, unit: "months" };
  return {
    raw: match[0].trim(),
    value,
    unit: /^stund/u.test(rawUnit) ? "hours" : /^tag/u.test(rawUnit) ? "days" : /^woch/u.test(rawUnit) ? "weeks" : "months",
  };
}

const CURRENCY = "(€|eur|euro|\\$|usd|£|gbp)";
const AMOUNT = "(\\d{1,3}(?:[.\\s]\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)";
const NET = "(?:\\s*\\(?(?:netto|brutto|zzgl\\.?\\s*(?:mwst|ust)\\.?|exkl\\.?\\s*(?:mwst|ust)\\.?|excl\\.?\\s*vat)\\)?)?";
const PER = "\\s*(?:\\/|pro|per|je|a)\\s*(tag|day|pt|personentag|stunde|std\\.?|h|hour)(?![\\p{L}])";
const MAXIMUM = /(?:\bmax(?:imal|\.)?|\bbis(?:\s+zu)?\b|\bhöchstens\b|\bup to\b|\bnicht mehr als\b|<=?)/iu;

function currencyOf(token: string): RateRange["currency"] | null {
  const key = token.toLocaleLowerCase("de-DE");
  if (key === "€" || key === "eur" || key === "euro") return "EUR";
  if (key === "$" || key === "usd") return "USD";
  if (key === "£" || key === "gbp") return "GBP";
  return null;
}

function amountOf(raw: string): number | null {
  const compact = raw.replace(/\s/gu, "");
  // 1.200 und 1.200,50 sind Tausender; 800,50 und 800.50 Dezimalstellen.
  const normalized = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/u.test(compact)
    ? compact.replace(/\./gu, "").replace(",", ".")
    : compact.replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function unitOf(token: string): RateRange["unit"] {
  return /^(?:stunde|std|h|hour)/iu.test(token) ? "hour" : "day";
}

/**
 * Ein Tages- oder Stundensatz: „max. 800 € netto/Tag“, „Tagessatz bis 800 €“,
 * „700–800 EUR pro Tag“, „95 €/h“. Ein Satz ist kein Gesamtbudget, auch wenn
 * „Budget“ davorsteht.
 */
export function parseRatePhrase(text: string): RateRange | null {
  const range = new RegExp(`${AMOUNT}\\s*(?:-|–|bis)\\s*${AMOUNT}\\s*${CURRENCY}${NET}${PER}`, "iu").exec(text);
  if (range) {
    const low = amountOf(range[1]!);
    const high = amountOf(range[2]!);
    const currency = currencyOf(range[3]!);
    if (low !== null && high !== null && currency) {
      return { min: Math.min(low, high), max: Math.max(low, high), currency, unit: unitOf(range[4]!) };
    }
  }

  const perUnit = new RegExp(`(?:${CURRENCY}\\s*${AMOUNT}|${AMOUNT}\\s*${CURRENCY})${NET}${PER}`, "iu").exec(text);
  if (perUnit && perUnit.index !== undefined) {
    const currency = currencyOf(perUnit[1] ?? perUnit[4] ?? "");
    const amount = amountOf(perUnit[2] ?? perUnit[3] ?? "");
    if (currency && amount !== null) {
      const before = text.slice(Math.max(0, perUnit.index - 25), perUnit.index);
      const maximum = MAXIMUM.test(before);
      return { min: maximum ? null : amount, max: amount, currency, unit: unitOf(perUnit[5]!) };
    }
  }

  const labeled = new RegExp(
    `\\b(tagessatz|stundensatz|day\\s*rate|daily\\s*rate|hourly\\s*rate)\\s*((?:[:=]|von|beträgt|liegt\\s+bei|bis(?:\\s+zu)?|max(?:imal|\\.)?|höchstens|ca\\.?|up to|\\s)*)\\s*(?:${CURRENCY}\\s*${AMOUNT}|${AMOUNT}\\s*${CURRENCY})`,
    "iu",
  ).exec(text);
  if (labeled) {
    const currency = currencyOf(labeled[3] ?? labeled[6] ?? "");
    const amount = amountOf(labeled[4] ?? labeled[5] ?? "");
    if (currency && amount !== null) {
      // „Der maximale Tagessatz beträgt EUR 800“: das „maximal“ steht vor dem Wort.
      const before = text.slice(Math.max(0, labeled.index - 25), labeled.index);
      const maximum = MAXIMUM.test(labeled[2] ?? "") || MAXIMUM.test(before);
      return {
        min: maximum ? null : amount,
        max: amount,
        currency,
        unit: /stunde|hour/iu.test(labeled[1]!) ? "hour" : "day",
      };
    }
  }
  return null;
}

/** Ob gleich nach einem Betrag „/Tag“ oder „pro Stunde“ folgt: dann ist es ein Satz, kein Budget. */
export function followedByRateUnit(text: string): boolean {
  return new RegExp(`^${NET}${PER}`, "iu").test(text);
}

/** „3 Tage/Woche“, „3 Tage pro Woche“, „24 Stunden pro Woche“, „Vollzeit“, „Teilzeit“. */
export function parseCapacityPhrase(text: string): string | null {
  const days = /\b(\d(?:[.,]5)?|ein|zwei|drei|vier|fünf)\s*(?:tage?|pt|personentage?)\s*(?:\/|pro|je|die|in\s+der|per)\s*woche\b/iu.exec(text);
  if (days) {
    const raw = days[1]!.toLocaleLowerCase("de-DE");
    const value = String(NUMBER_WORDS[raw] ?? raw.replace(".", ","));
    return `${value} ${value === "1" ? "Tag" : "Tage"} pro Woche`;
  }
  const hours = /\b(\d{1,2})\s*(?:stunden|std\.?|h)\s*(?:\/|pro|je|die|in\s+der|per)\s*woche\b/iu.exec(text);
  if (hours) return `${hours[1]} Stunden pro Woche`;
  if (/\bteilzeit\b/iu.test(text)) return "Teilzeit";
  if (/\bvollzeit\b/iu.test(text)) return "Vollzeit";
  return null;
}

/** Erkennt eine Angabe, die `parseCapacityPhrase` erzeugt hat. */
export function isCapacityPhrase(value: string): boolean {
  return /^(?:\d(?:,5)?\s+tage?\s+pro\s+woche|\d{1,2}\s+stunden\s+pro\s+woche|teilzeit|vollzeit)$/iu.test(value.trim());
}

const LANGUAGES: ReadonlyArray<{ canonical: string; label: string; pattern: string }> = [
  { canonical: "German", label: "Deutsch", pattern: "deutsch(?:kenntnisse|e|en|er)?|german" },
  { canonical: "English", label: "Englisch", pattern: "englisch(?:kenntnisse|e|en|er)?|english" },
  { canonical: "French", label: "Französisch", pattern: "französisch(?:kenntnisse|e|en|er)?|french" },
  { canonical: "Spanish", label: "Spanisch", pattern: "spanisch(?:kenntnisse|e|en|er)?|spanish" },
];

const QUALITATIVE =
  "verhandlungssicher(?:e[mnrs]?)?|fließend(?:e[mnrs]?)?|fliessend(?:e[mnrs]?)?|muttersprachlich(?:e[mnrs]?)?|sehr\\s+gut(?:e[mnrs]?)?|fluent|native";

function qualitativeLabel(word: string): string {
  const key = word.toLocaleLowerCase("de-DE");
  if (key.startsWith("verhandlungssicher")) return "verhandlungssicher";
  if (key.startsWith("fließend") || key.startsWith("fliessend") || key === "fluent") return "fließend";
  if (key.startsWith("muttersprach") || key === "native") return "Muttersprache";
  return "sehr gut";
}

/** Welche Sprache ist gemeint, als kanonischer Name und deutsche Bezeichnung. */
export function languageOf(text: string): { canonical: string; label: string } | null {
  const language = LANGUAGES.find((entry) => new RegExp(`\\b(?:${entry.pattern})\\b`, "iu").test(text));
  return language ? { canonical: language.canonical, label: language.label } : null;
}

/** Die deutsche Bezeichnung einer kanonischen Sprache: „German“ → „Deutsch“. */
export function languageLabel(canonical: string): string {
  return LANGUAGES.find((entry) => entry.canonical === canonical)?.label ?? canonical;
}

/** Eine Angabe wie „Deutsch C1“ oder „Englisch fließend“, die `parseLanguageLevels` erzeugt. */
export function isLanguageLevel(value: string): boolean {
  return /^(?:Deutsch|Englisch|Französisch|Spanisch)\s+(?:[ABC][12]|verhandlungssicher|fließend|Muttersprache|sehr gut)$/u.test(value.trim());
}

/**
 * Sprache mit Niveau: „Deutsch C1“, „Deutschkenntnisse auf C1-Niveau“,
 * „verhandlungssicheres Deutsch“. Die Sprache selbst geht ins Sprachfeld; das
 * Niveau bleibt als eigene Angabe stehen, statt auf „German“ zu schrumpfen.
 */
export function parseLanguageLevels(text: string): Array<{ language: string; requirement: string }> {
  const found: Array<{ language: string; requirement: string }> = [];
  for (const language of LANGUAGES) {
    const cefrAfter = new RegExp(
      `\\b(?:${language.pattern})\\s*(?:\\(|:|-|–|auf|mindestens|min\\.?|niveau)*\\s*(?:niveau\\s*)?([abc][12])\\b`,
      "iu",
    ).exec(text);
    const cefrBefore = new RegExp(`\\b([abc][12])(?:-niveau|-level)?\\s+(?:in\\s+)?(?:${language.pattern})\\b`, "iu").exec(text);
    const qualitative =
      new RegExp(`\\b(${QUALITATIVE})\\s+(?:${language.pattern})\\b`, "iu").exec(text) ??
      new RegExp(`\\b(?:${language.pattern})\\s*(?:\\(|:|-|–)?\\s*(${QUALITATIVE})\\b`, "iu").exec(text);
    const cefr = cefrAfter?.[1] ?? cefrBefore?.[1];
    if (cefr) {
      found.push({ language: language.canonical, requirement: `${language.label} ${cefr.toUpperCase()}` });
    } else if (qualitative?.[1]) {
      found.push({ language: language.canonical, requirement: `${language.label} ${qualitativeLabel(qualitative[1])}` });
    }
  }
  return found;
}

/** Steht unmittelbar nach einem Skill, dass er nur wünschenswert ist? „Next.js ist optional“, „Next.js (nice to have)“. */
export const OPTIONAL_SUFFIX =
  /^\s*(?:[,(:–-]\s*)?(?:ist|wäre|sind|wären|als|gerne|gern)?\s*(?:optional|wünschenswert|nice[ -]to[ -]have|von\s+vorteil|ein\s+plus|ein\s+bonus|plus|gern\s+gesehen|kein\s+muss|nicht\s+zwingend)/iu;

/**
 * Welche Angaben der Text erkennbar enthält, der Steckbrief aber nicht: die
 * Stellen, die nach einer Basisanalyse jemand prüfen sollte, bevor er einem
 * Treffer vertraut (Audit F01). Nur Signale, die eindeutig auf eine Angabe
 * hindeuten; lieber einmal zu wenig nachfragen als eine Liste ohne Anlass.
 */
export function unreadConditions(
  source: string,
  brief: {
    startWindow: unknown;
    duration: unknown;
    rate: unknown;
    budget: unknown;
    constraints: readonly string[] | null;
  },
): string[] {
  const open: string[] = [];
  const constraints = brief.constraints ?? [];
  if (!brief.startWindow && new RegExp(`\\b(?:${START_KEYWORD})\\b[^.\\n]{0,25}(?:\\d{1,2}\\.\\s?\\d{1,2}\\.|${MONTH_WORD}|sofort|asap)`, "iu").test(source)) {
    open.push("Startdatum");
  }
  if (!brief.duration && /\b(?:laufzeit|dauer|projektdauer)\b|\b\d+\s*(?:monate|months)\b/iu.test(source)) {
    open.push("Dauer");
  }
  if (!brief.rate && !brief.budget && /(?:€|\beur\b|\beuro\b)|\b(?:tagessatz|stundensatz|budget)\b/iu.test(source)) {
    open.push("Budget oder Tagessatz");
  }
  if (!constraints.some((entry) => isCapacityPhrase(entry) || /%\s*auslastung/iu.test(entry)) &&
      /\b\d+(?:[.,]\d)?\s*(?:tage?|stunden|std\.?|h|pt)\s*(?:\/|pro|je|die|in der)\s*woche\b|\d+\s*%\s*(?:auslastung)?|\b(?:teilzeit|vollzeit)\b/iu.test(source)) {
    open.push("Wochenumfang");
  }
  if (!constraints.some(isLanguageLevel) && /\b[abc][12]\b|\b(?:verhandlungssicher|fließend|muttersprachlich)/iu.test(source)) {
    open.push("Sprachniveau");
  }
  return open;
}
