/**
 * Profilentwurf aus einem Import (Lebenslauf, GitHub, später LinkedIn).
 *
 * Ein Import füllt das Bewerbungsformular vor, er ersetzt es nicht. Zwei
 * Regeln:
 *
 * 1. Was die Person schon eingetragen hat, bleibt stehen. Ein Import füllt
 *    leere Felder und ergänzt Listen, er überschreibt nie.
 * 2. Importiert heißt nicht geprüft. Die Herkunft wird mitgeschrieben
 *    (`ImportProvenance`), damit die Sichtung sieht, woher eine Angabe kam;
 *    `verified` setzt nur die Sichtung (lib/freelancer/application.ts).
 *
 * Rein und ohne Server-Importe: Das Formular nutzt dieselben Funktionen im
 * Browser.
 */

import { MAX_PROJECTS, MAX_TECHNOLOGIES, PROJECT_LIMITS, type ProfileProject } from "@/lib/profile/project-limits";

import {
  MAX_INDUSTRIES,
  MAX_LANGUAGES,
  MAX_QUALIFICATIONS,
  MAX_SKILLS,
  MAX_SUMMARY_LENGTH,
} from "../limits";

export const IMPORT_SOURCES = ["cv", "github", "linkedin"] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

export const IMPORT_SOURCE_LABELS: Readonly<Record<ImportSource, string>> = {
  cv: "aus Lebenslauf",
  github: "aus GitHub",
  linkedin: "aus LinkedIn",
};

export const DRAFT_LIST_FIELDS = ["skills", "languages", "qualifications", "industries"] as const;
export type DraftListField = (typeof DRAFT_LIST_FIELDS)[number];
export const DRAFT_TEXT_FIELDS = ["roleTitle", "experienceSummary", "locationText"] as const;
export type DraftTextField = (typeof DRAFT_TEXT_FIELDS)[number];
export type DraftField = DraftListField | DraftTextField | "projects";

/** Was ein Import liefern kann. Alles ist freiwillig; leer heißt „nicht gefunden“. */
export type ProfileDraft = {
  source: ImportSource;
  /** ISO-Zeitpunkt des Imports. */
  importedAt: string;
  roleTitle: string | null;
  experienceSummary: string | null;
  locationText: string | null;
  skills: string[];
  languages: string[];
  qualifications: string[];
  industries: string[];
  projects: ProfileProject[];
  /** Für GitHub: der Nutzername und ob er aus einem verknüpften Konto stammt. */
  github?: { login: string; linked: boolean } | null;
};

/** Der Teil des Formulars, den ein Entwurf füllen darf. */
export type DraftTarget = {
  roleTitle: string;
  experienceSummary: string;
  locationText: string;
  skills: string[];
  languages: string[];
  qualifications: string[];
  industries: string[];
  projects: ProfileProject[];
};

export type ProvenanceEntry = { field: DraftField; value: string; source: ImportSource };

export type ImportProvenance = {
  imports: { source: ImportSource; importedAt: string; github?: { login: string; linked: boolean } }[];
  values: ProvenanceEntry[];
};

export const MAX_PROVENANCE_IMPORTS = 6;
export const MAX_PROVENANCE_VALUES = 120;
export const MAX_DESIRED_PROJECTS_LENGTH = 500;

export const EMPTY_PROVENANCE: ImportProvenance = { imports: [], values: [] };

const LIST_LIMITS: Readonly<Record<DraftListField, { count: number; length: number }>> = {
  skills: { count: MAX_SKILLS, length: 80 },
  languages: { count: MAX_LANGUAGES, length: 60 },
  qualifications: { count: MAX_QUALIFICATIONS, length: 160 },
  industries: { count: MAX_INDUSTRIES, length: 80 },
};

const TEXT_LIMITS: Readonly<Record<DraftTextField, number>> = {
  roleTitle: 160,
  experienceSummary: MAX_SUMMARY_LENGTH,
  locationText: 160,
};

function key(value: string): string {
  return value.trim().toLocaleLowerCase("de-DE");
}

/**
 * Ein Listenwert, wie das Formular ihn annimmt: getrimmt, gekürzt und ohne
 * Doppelpunkt, denn „Kategorie: Wert“ ist im Katalog ein Präfix
 * (lib/freelancer/application.ts, `tag`).
 */
export function cleanTag(value: string, maxLength: number): string {
  return value.replace(/:/gu, " ").replace(/\s+/gu, " ").trim().slice(0, maxLength).trim();
}

function cleanText(value: string | null, maxLength: number): string {
  return (value ?? "").replace(/[ \t]+/gu, " ").trim().slice(0, maxLength).trim();
}

/**
 * Ein Projekt aus einem Import: als Angabe der Bewerbung, nie geprüft, und in
 * den Grenzen von `ProjectInputSchema` (lib/profile/project-schema.ts), damit
 * das Absenden nicht an einem übernommenen Wert scheitert.
 */
export function draftProject(project: ProfileProject): ProfileProject {
  const outcome = project.outcome?.trim() ?? "";
  return {
    ...project,
    title: project.title.replace(/\s+/gu, " ").trim().slice(0, PROJECT_LIMITS.title),
    technologies: [
      ...new Map(
        project.technologies
          .map((value) => cleanTag(value, PROJECT_LIMITS.technology))
          .filter(Boolean)
          .map((value) => [value.toLowerCase(), value] as const),
      ).values(),
    ].slice(0, MAX_TECHNOLOGIES),
    outcome: outcome.length >= 10 ? outcome.slice(0, PROJECT_LIMITS.outcome) : null,
    verified: false,
    source: "application",
    sourceUrl: null,
  };
}

/**
 * Übernimmt einen Entwurf in das Formular.
 *
 * Gibt das neue Formular und die Herkunft genau der Werte zurück, die
 * tatsächlich übernommen wurden. Was schon dastand, bekommt keine Marke.
 */
export function mergeDraft(
  current: DraftTarget,
  draft: ProfileDraft,
): { next: DraftTarget; taken: ProvenanceEntry[] } {
  const taken: ProvenanceEntry[] = [];
  const next: DraftTarget = { ...current };

  for (const field of DRAFT_TEXT_FIELDS) {
    const incoming = cleanText(draft[field], TEXT_LIMITS[field]);
    if (!current[field].trim() && incoming) {
      next[field] = incoming;
      taken.push({ field, value: "", source: draft.source });
    }
  }

  for (const field of DRAFT_LIST_FIELDS) {
    const limit = LIST_LIMITS[field];
    const values = [...current[field]];
    const seen = new Set(values.map(key));
    for (const raw of draft[field]) {
      if (values.length >= limit.count) break;
      const value = cleanTag(raw, limit.length);
      if (!value || seen.has(key(value))) continue;
      seen.add(key(value));
      values.push(value);
      taken.push({ field, value, source: draft.source });
    }
    next[field] = values;
  }

  const projects = [...current.projects];
  const titles = new Set(projects.map((project) => key(project.title)));
  for (const project of draft.projects) {
    if (projects.length >= MAX_PROJECTS) break;
    const clean = draftProject(project);
    if (clean.title.length < 3 || titles.has(key(clean.title))) continue;
    titles.add(key(clean.title));
    projects.push(clean);
    taken.push({ field: "projects", value: clean.title, source: draft.source });
  }
  next.projects = projects;

  return { next, taken };
}

/** Hängt einen Import an die Herkunft an, in den Grenzen der Speicherung. */
export function addProvenance(
  provenance: ImportProvenance,
  draft: ProfileDraft,
  taken: readonly ProvenanceEntry[],
): ImportProvenance {
  const imports = [
    ...provenance.imports,
    {
      source: draft.source,
      importedAt: draft.importedAt,
      ...(draft.github ? { github: draft.github } : {}),
    },
  ].slice(-MAX_PROVENANCE_IMPORTS);
  return { imports, values: [...provenance.values, ...taken].slice(0, MAX_PROVENANCE_VALUES) };
}

/**
 * Die Herkunft beim Absenden: nur für Werte, die noch im Formular stehen.
 * Wer einen übernommenen Skill löscht, soll keine Marke dafür zurücklassen.
 */
export function finalProvenance(provenance: ImportProvenance, form: DraftTarget): ImportProvenance | null {
  const present = (entry: ProvenanceEntry): boolean => {
    if (entry.field === "projects") return form.projects.some((project) => key(project.title) === key(entry.value));
    if ((DRAFT_TEXT_FIELDS as readonly string[]).includes(entry.field)) {
      return Boolean(form[entry.field as DraftTextField].trim());
    }
    return form[entry.field as DraftListField].some((value) => key(value) === key(entry.value));
  };
  const values = provenance.values.filter(present);
  if (!provenance.imports.length) return null;
  return { imports: provenance.imports, values };
}

/** Die Quellen eines Werts, für die Marke neben ihm. */
export function sourcesOf(provenance: ImportProvenance | null, field: DraftField, value = ""): ImportSource[] {
  if (!provenance) return [];
  const wanted = key(value);
  return [
    ...new Set(
      provenance.values
        .filter((entry) => entry.field === field && key(entry.value) === wanted)
        .map((entry) => entry.source),
    ),
  ];
}

export function emptyDraft(source: ImportSource, importedAt: string): ProfileDraft {
  return {
    source,
    importedAt,
    roleTitle: null,
    experienceSummary: null,
    locationText: null,
    skills: [],
    languages: [],
    qualifications: [],
    industries: [],
    projects: [],
    github: null,
  };
}
