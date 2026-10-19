import { createHash } from "node:crypto";

import type { FreelancerProfile } from "@/lib/domain";

/**
 * Texte, aus denen die Suche ihre Vorauswahl und die KI ihre Bewertung
 * bildet.
 *
 * Der Fingerabdruck-Text beschreibt, worum es im Profil geht; aus ihm
 * entsteht das Embedding. Ändert sich der Aufbau, wird die Version erhöht:
 * Sie geht in den Hash ein, und jedes Profil bekommt bei der nächsten Suche
 * einen neuen Fingerabdruck.
 *
 * Namen stehen in keinem der Texte. Für die Frage, wer fachlich passt,
 * spielen sie keine Rolle, und sie gehen dann auch nicht an den Anbieter.
 */
export const PROFILE_TEXT_VERSION = 1;

const CONTEXT_LABELS: Readonly<Record<string, string>> = {
  Industry: "Branche",
  Certification: "Zertifikat",
  Experience: "Erfahrung",
  Focus: "Schwerpunkt",
};

const WORK_MODE_LABELS: Readonly<Record<FreelancerProfile["workModes"][number], string>> = {
  remote: "remote",
  on_site: "vor Ort",
  hybrid: "hybrid",
};

function values(facts: readonly { value: string }[]): string[] {
  return [...new Set(facts.map((fact) => fact.value.trim()).filter(Boolean))];
}

function contextLines(profile: FreelancerProfile): string[] {
  return values(profile.contextEvidence).map((value) => {
    const separator = value.indexOf(":");
    const category = separator > 0 ? value.slice(0, separator).trim() : "";
    const label = CONTEXT_LABELS[category];
    return label ? `${label}: ${value.slice(separator + 1).trim()}` : value;
  });
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/gu, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Der Text, aus dem der Fingerabdruck eines Profils entsteht. */
export function profileEmbeddingText(profile: FreelancerProfile): string {
  const lines = [
    `Rolle: ${profile.role}`,
    `Kompetenzen: ${values(profile.skillTags).join(", ") || "keine Angabe"}`,
  ];
  const context = contextLines(profile);
  if (context.length) lines.push(context.join("; "));
  const qualifications = values(profile.qualifications);
  if (qualifications.length) lines.push(`Qualifikationen: ${qualifications.join(", ")}`);
  const languages = values(profile.languages);
  if (languages.length) lines.push(`Sprachen: ${languages.join(", ")}`);
  if (profile.location) lines.push(`Ort: ${profile.location.value}`);
  lines.push(`Arbeitsmodus: ${profile.workModes.map((mode) => WORK_MODE_LABELS[mode]).join(", ")}`);
  lines.push(`Erfahrung: ${clip(profile.experienceSummary.value, 1_500)}`);
  return lines.join("\n");
}

/** Fingerabdruck der Angaben samt Modell und Textversion. */
export function profileEmbeddingHash(profile: FreelancerProfile, model: string): string {
  return createHash("sha256")
    .update(`${PROFILE_TEXT_VERSION}|${model}|${profileEmbeddingText(profile)}`)
    .digest("hex");
}

/** Die Anfrage, wie sie in den Fingerabdruck der Suche eingeht. */
export function requestEmbeddingText(request: string): string {
  return clip(request, 8_000);
}

function availabilityLine(profile: FreelancerProfile): string {
  const from = profile.availability.availableFrom;
  if (profile.availability.status === "available") return from ? `verfügbar ab ${from}` : "verfügbar";
  if (profile.availability.status === "limited") return from ? `eingeschränkt verfügbar ab ${from}` : "eingeschränkt verfügbar";
  if (profile.availability.status === "unavailable") return "nicht verfügbar";
  return from ? `laut Profil ab ${from}, nicht bestätigt` : "nicht bestätigt";
}

function rateLine(profile: FreelancerProfile): string | null {
  if (profile.dayRate) return `${profile.dayRate.amount} ${profile.dayRate.currency}/Tag`;
  if (profile.hourlyRate) return `${profile.hourlyRate.amount} ${profile.hourlyRate.currency}/Stunde`;
  if (profile.monthlySalary) return `${profile.monthlySalary.amount} ${profile.monthlySalary.currency}/Monat`;
  return null;
}

/**
 * Ein Profil, wie es die KI zur Bewertung sieht: alles, was über die Passung
 * entscheidet, in einer Zeile und gekürzt, damit 20 Profile in eine Anfrage
 * passen, ohne Tokens zu verschwenden.
 */
export function rankingCandidateText(alias: string, profile: FreelancerProfile): string {
  const parts = [
    `Rolle: ${profile.role}`,
    `Kompetenzen: ${values(profile.skillTags).slice(0, 40).join(", ") || "keine Angabe"}`,
  ];
  const context = contextLines(profile).slice(0, 15);
  if (context.length) parts.push(context.join("; "));
  const qualifications = values(profile.qualifications).slice(0, 10);
  if (qualifications.length) parts.push(`Qualifikationen: ${qualifications.join(", ")}`);
  const languages = values(profile.languages);
  if (languages.length) parts.push(`Sprachen: ${languages.join(", ")}`);
  parts.push(
    `Ort/Modus: ${profile.location?.value ?? "offen"}, ${profile.workModes.map((mode) => WORK_MODE_LABELS[mode]).join("/")}`,
  );
  parts.push(`Verfügbarkeit: ${availabilityLine(profile)}`);
  const rate = rateLine(profile);
  if (rate) parts.push(`Satz: ${rate}`);
  parts.push(`Erfahrung: ${clip(profile.experienceSummary.value, 500)}`);
  return `[${alias}] ${parts.join(" | ")}`;
}

const STOPWORDS = new Set([
  "aber", "alle", "als", "also", "auch", "auf", "aus", "bei", "bis", "das", "dass", "dem", "den", "der",
  "des", "die", "ein", "eine", "einem", "einen", "einer", "eines", "für", "fur", "gesucht", "haben",
  "hat", "ich", "ihr", "ihre", "im", "in", "ist", "mit", "nach", "nicht", "noch", "oder", "sein",
  "sie", "sind", "soll", "suche", "suchen", "und", "uns", "unser", "unsere", "von", "vor", "wir",
  "wird", "zum", "zur", "the", "and", "for", "with", "you", "our", "are", "mwd", "m/w/d",
]);

function searchWords(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("de-DE")
    .split(/[^\p{L}\p{N}+#]+/u)
    .filter((word) => word.length >= 2 && !STOPWORDS.has(word));
}

function profileWords(profile: FreelancerProfile): Set<string> {
  return new Set(searchWords(profileEmbeddingText(profile)));
}

/**
 * Ob ein Anfragewort im Profil vorkommt. Lange Wörter treffen auch als
 * Wortanfang, damit „Informationssicherheit“ in
 * „Informationssicherheitsmanagement“ gefunden wird.
 */
function wordMatches(word: string, words: ReadonlySet<string>): boolean {
  if (words.has(word)) return true;
  if (word.length < 6) return false;
  for (const candidate of words) {
    if (candidate.length >= 6 && (candidate.startsWith(word) || word.startsWith(candidate))) return true;
  }
  return false;
}

export type LexicalCandidate = { profile: FreelancerProfile; score: number };

/**
 * Vorauswahl über gemeinsame Wörter, gewichtet nach Seltenheit im Pool.
 *
 * Nur der Ersatzweg, wenn der Fingerabdruck der Anfrage nicht berechnet
 * werden kann (Anbieter nicht erreichbar). Sie ist großzügig: Jedes
 * gemeinsame Fachwort zählt, Schreibweise und Wortstellung nicht.
 */
export function lexicalPrefilter(
  request: string,
  profiles: readonly FreelancerProfile[],
  limit: number,
): LexicalCandidate[] {
  const requestWords = [...new Set(searchWords(request))];
  if (!requestWords.length || !profiles.length) return [];
  const wordsByProfile = profiles.map((profile) => ({ profile, words: profileWords(profile) }));
  const documentFrequency = new Map<string, number>();
  for (const word of requestWords) {
    documentFrequency.set(
      word,
      wordsByProfile.filter(({ words }) => wordMatches(word, words)).length,
    );
  }
  return wordsByProfile
    .map(({ profile, words }) => ({
      profile,
      score: requestWords.reduce((sum, word) => {
        const frequency = documentFrequency.get(word) ?? 0;
        if (!frequency || !wordMatches(word, words)) return sum;
        return sum + Math.log(1 + profiles.length / frequency);
      }, 0),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.profile.id.localeCompare(right.profile.id))
    .slice(0, limit);
}

/**
 * Kompetenzen und Rolle des Profils, die wörtlich auch in der Anfrage
 * stehen. Begründung für die Vorauswahl ohne KI-Bewertung — nur, was
 * nachweislich beidseitig genannt ist.
 */
export function termsSharedWithRequest(request: string, profile: FreelancerProfile): string[] {
  const requestWords = new Set(searchWords(request));
  return values(profile.skillTags)
    .filter((skill) => {
      const words = searchWords(skill);
      return words.length > 0 && words.every((word) => wordMatches(word, requestWords));
    })
    .slice(0, 6);
}
