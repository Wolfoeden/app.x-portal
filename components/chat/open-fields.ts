import type { StructuredBrief } from "../chat-contract";

/**
 * Was in der Projektübersicht als „Noch offen“ steht (Audit P2).
 *
 * Bisher stand dort jedes Feld aus `unknownFields`, auch rein optionale wie
 * „optionale Kompetenzen“, „Qualifikationen“ oder „Vertragsanforderungen“,
 * und „Budget“, obwohl ein Tagessatz angegeben war. Die gelbe Liste soll
 * echte Lücken zeigen: Angaben, die für die Auswahl zählen und im aktuellen
 * Stand fehlen. Sie wird deshalb aus den Werten selbst abgeleitet, nicht aus
 * einer Liste, die bei der Analyse entstand.
 */

const CAPACITY = /(?:tage?|stunden|std\.?|h)\s*(?:\/|pro|je|die|in der|per)\s*woche|%\s*auslastung|\bteilzeit\b|\bvollzeit\b/iu;

export function openBriefFields(brief: StructuredBrief): string[] {
  const open: string[] = [];
  if (!brief.requiredSkills.length && !brief.requirementGroups.length) open.push("Pflichtkompetenzen");
  if (!brief.startWindow) open.push("Startzeitraum");
  if (!brief.duration) open.push("Dauer");
  if (!brief.budgetOrRate) open.push("Budget oder Tagessatz");
  if (!brief.availabilityRequirement && !brief.constraints.some((entry) => CAPACITY.test(entry))) open.push("Verfügbarkeit");
  if (brief.mode === "unknown") open.push("Arbeitsmodus");
  if (!brief.location && brief.mode !== "remote") open.push("Ort");
  if (!brief.languages.length) open.push("Sprache");
  return open;
}
