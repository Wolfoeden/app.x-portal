import { createProjectBriefV2, type ProjectBrief } from "./brief";
import { BRIEF_EDIT_MARKER } from "./brief-edit-marker";
import {
  isCapacityPhrase,
  isLanguageLevel,
  languageOf,
  parseCapacityPhrase,
  parseDurationPhrase,
  parseLanguageLevels,
  parseRatePhrase,
  parseStartPhrase,
} from "./brief-phrases";
import { parseFallbackBrief } from "./fallback-parser";

/**
 * Was jemand im Formular „Projektdaten“ einträgt, gilt als bestätigt.
 *
 * Das Formular schickt seine Änderungen als Nachricht durch den Chat (siehe
 * components/chat/brief-editor.ts), damit die Änderung im Verlauf steht.
 * Bisher wurde diese Nachricht wie jeder andere Text ausgewertet: Fiel die
 * KI aus, las die Basisanalyse „Start: 15.10.2026“ nicht, und der Wert war
 * nach „Übernehmen und neu suchen“ wieder leer (Audit F01). Jetzt werden die
 * Zeilen „- Feld: Wert“ aus dieser Nachricht direkt übernommen, nach der
 * KI-Analyse wie nach der Basisanalyse. Ein Ausfall kann bestätigte Werte
 * nicht mehr überschreiben.
 */

export { BRIEF_EDIT_MARKER };

/** Die Feldnamen in der Nachricht, wie das Formular sie schreibt (BRIEF_FIELDS). */
export const CONFIRMED_FIELD_LABELS = {
  start: "Start",
  duration: "Dauer",
  money: "Budget oder Satz",
  availability: "Verfügbarkeit",
  languages: "Sprachen",
  location: "Ort",
  mode: "Arbeitsmodus",
} as const;

const REMOVED = /^(?:entfällt|keine?|—|-)$/iu;

/** Die bestätigten Felder aus einer Formular-Nachricht; `null` heißt „gestrichen“. */
export function confirmedFieldsFrom(message: string | null | undefined): Map<string, string | null> | null {
  const text = message?.trim();
  if (!text?.startsWith(BRIEF_EDIT_MARKER)) return null;
  const fields = new Map<string, string | null>();
  for (const line of text.split(/\r?\n/u)) {
    const match = /^-\s*([^:]{1,40}):\s*(.*)$/u.exec(line.trim());
    if (!match) continue;
    const value = match[2]!.trim();
    fields.set(match[1]!.trim(), !value || REMOVED.test(value) ? null : value);
  }
  return fields.size ? fields : null;
}

const MODES: Readonly<Record<string, ProjectBrief["workMode"]>> = {
  remote: "remote",
  hybrid: "hybrid",
  "vor ort": "on_site",
  "nicht festgelegt": "unknown",
};

function withoutConstraints(
  constraints: string[] | null,
  drop: (value: string) => boolean,
): string[] {
  return (constraints ?? []).filter((value) => !drop(value));
}

const CAPACITY_LIKE = /(?:tage?|stunden|std\.?|h)\s*(?:\/|pro|je|die|in der|per)\s*woche|%\s*auslastung|\bteilzeit\b|\bvollzeit\b/iu;

/** Die bestätigten Werte auf einen Steckbrief legen. Ohne Formular-Nachricht bleibt er unverändert. */
export function applyConfirmedFields(
  brief: ProjectBrief,
  message: string | null | undefined,
  now = new Date(),
): ProjectBrief {
  const fields = confirmedFieldsFrom(message);
  if (!fields) return brief;
  const next: ProjectBrief = { ...brief };
  let constraints: string[] = [...(brief.constraints ?? [])];
  const L = CONFIRMED_FIELD_LABELS;

  if (fields.has(L.start)) {
    const value = fields.get(L.start) ?? null;
    next.startWindow = value
      ? parseStartPhrase(`Start ${value}`, now) ??
        parseFallbackBrief(`Start ${value}`, { now }).startWindow ?? { raw: value.slice(0, 200), earliest: null, latest: null }
      : null;
    if (next.startWindow && (!next.availabilityRequirement || next.availabilityRequirement === brief.startWindow?.raw)) {
      next.availabilityRequirement = next.startWindow.raw;
    }
  }

  if (fields.has(L.duration)) {
    const value = fields.get(L.duration) ?? null;
    constraints = withoutConstraints(constraints, (entry) => entry.startsWith("Dauer: "));
    if (!value) {
      next.duration = null;
    } else {
      const parsed = parseDurationPhrase(`Dauer ${value}`) ?? parseFallbackBrief(`Dauer ${value}`, { now }).duration;
      next.duration = parsed ?? null;
      // Etwas wie „unbefristet“ hat kein Maß; es bleibt als Angabe sichtbar.
      if (!parsed) constraints.push(`Dauer: ${value}`);
    }
  }

  if (fields.has(L.money)) {
    const value = fields.get(L.money) ?? null;
    constraints = withoutConstraints(constraints, (entry) => entry.startsWith("Budget/Satz: "));
    next.rate = null;
    next.budget = null;
    if (value) {
      const rate = parseRatePhrase(value) ?? parseRatePhrase(`Tagessatz ${value}`);
      if (rate) {
        next.rate = rate;
      } else {
        const parsed = parseFallbackBrief(`Budget ${value}`, { now });
        next.budget = parsed.budget;
        next.rate = parsed.rate;
        if (!parsed.budget && !parsed.rate) constraints.push(`Budget/Satz: ${value}`);
      }
    }
  }

  if (fields.has(L.availability)) {
    const value = fields.get(L.availability) ?? null;
    constraints = withoutConstraints(constraints, (entry) => isCapacityPhrase(entry) || CAPACITY_LIKE.test(entry));
    next.availabilityRequirement = value ? value.slice(0, 500) : null;
    const capacity = value ? parseCapacityPhrase(value) : null;
    if (capacity) constraints.push(capacity);
  }

  if (fields.has(L.languages)) {
    const value = fields.get(L.languages) ?? null;
    constraints = withoutConstraints(constraints, isLanguageLevel);
    next.language = null;
    for (const entry of (value ?? "").split(/,|;|\bund\b/iu).map((part) => part.trim()).filter(Boolean)) {
      const language = languageOf(entry);
      if (!language) continue;
      next.language ??= language.canonical;
      for (const level of parseLanguageLevels(entry)) constraints.push(level.requirement);
    }
  }

  if (fields.has(L.location)) {
    next.location = fields.get(L.location)?.slice(0, 200) ?? null;
  }

  if (fields.has(L.mode)) {
    const value = fields.get(L.mode)?.toLocaleLowerCase("de-DE") ?? "nicht festgelegt";
    next.workMode = MODES[value] ?? brief.workMode;
  }

  next.constraints = constraints.length ? [...new Set(constraints)] : null;
  return createProjectBriefV2(next);
}
