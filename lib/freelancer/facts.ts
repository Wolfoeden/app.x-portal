/**
 * Provenance facts.
 *
 * `lib/data/freelancers.ts` reads a profile's claims back out of
 * `verified_facts` / `self_reported_facts` by category prefix, so the exact
 * string built here is the contract between the reviewer's checkbox and what a
 * customer later sees labelled "geprüft". Shared with the browser, therefore
 * free of zod and server imports.
 */

export type FactCategory =
  | "Skill"
  | "Industry"
  | "Qualification"
  | "Language"
  | "Location"
  | "Experience";

export const FACT_CATEGORY_LABELS: Readonly<Record<FactCategory, string>> = {
  Skill: "Skill",
  Industry: "Branche",
  Qualification: "Qualifikation",
  Language: "Sprache",
  Location: "Standort",
  Experience: "Kurzprofil",
};

export type CandidateFact = {
  category: FactCategory;
  value: string;
  /** The exact string written to a provenance column. */
  fact: string;
};

function fact(category: FactCategory, value: string): CandidateFact {
  return { category, value, fact: `${category}: ${value}` };
}

export type FactSourceInput = {
  skills: readonly string[];
  languages: readonly string[];
  qualifications: readonly string[];
  industries: readonly string[];
  locationText: string | null;
  experienceSummary: string;
};

/**
 * Every claim a reviewer may promote, in the order they are offered.
 *
 * Qualifications come first because they are the only category that
 * disappears entirely when it falls outside the 40-entry provenance budget;
 * skills, languages and industries keep their own columns either way.
 */
export function candidateFacts(input: FactSourceInput): CandidateFact[] {
  return [
    ...input.qualifications.map((value) => fact("Qualification", value)),
    ...(input.locationText ? [fact("Location", input.locationText)] : []),
    ...(input.experienceSummary
      ? [fact("Experience", input.experienceSummary)]
      : []),
    ...input.industries.map((value) => fact("Industry", value)),
    ...input.languages.map((value) => fact("Language", value)),
    ...input.skills.map((value) => fact("Skill", value)),
  ];
}
