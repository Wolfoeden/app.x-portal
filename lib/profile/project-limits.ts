/**
 * Grenzen und Typen für Referenzprojekte und Profil-Links, ohne zod: Das
 * Bewerbungsformular und das Dashboard laden sie im Browser. Die Datenbank
 * prüft dieselben Grenzen noch einmal (Migration 20261006090000).
 */

export const MAX_PROJECTS = 8;
export const MAX_TECHNOLOGIES = 12;
export const MAX_LINKS = 6;

export const PROJECT_LIMITS = {
  title: 120,
  client: 120,
  industry: 80,
  role: 120,
  technology: 40,
  outcome: 600,
  url: 500,
} as const;

export const PROJECT_SOURCES = ["freelancer", "operator", "application", "research"] as const;
export type ProjectSource = (typeof PROJECT_SOURCES)[number];

export const LINK_KINDS = ["linkedin", "website", "github", "portfolio", "freelancermap"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const LINK_LABELS: Readonly<Record<LinkKind, string>> = {
  linkedin: "LinkedIn",
  website: "Website",
  github: "GitHub",
  portfolio: "Portfolio",
  freelancermap: "freelancermap",
};

/** Ein Projekt, wie Editor und API es austauschen. Monate als `YYYY-MM`. */
export type ProfileProject = {
  title: string;
  client: string | null;
  industry: string | null;
  role: string | null;
  startedOn: string | null;
  endedOn: string | null;
  ongoing: boolean;
  technologies: string[];
  outcome: string | null;
  link: string | null;
  isPublic: boolean;
  verified: boolean;
  source: ProjectSource;
  sourceUrl: string | null;
};

export type ProfileLink = { kind: LinkKind; url: string };

const MONTH = /^(\d{4})-(\d{2})$/u;

function monthLabel(value: string): string {
  const match = value.match(MONTH);
  return match ? `${match[2]}/${match[1]}` : value;
}

/** „2023 – 2024“, „03/2024 – 11/2024“, „seit 03/2025“, „2024“ oder `null`. */
export function projectPeriod(project: Pick<ProfileProject, "startedOn" | "endedOn" | "ongoing">): string | null {
  const start = project.startedOn?.match(MONTH);
  const end = project.endedOn?.match(MONTH);
  if (project.ongoing) return project.startedOn ? `seit ${monthLabel(project.startedOn)}` : "laufend";
  if (start && end) {
    if (start[1] === end[1]) return start[2] === end[2] ? monthLabel(project.startedOn!) : start[1]!;
    return `${start[1]} – ${end[1]}`;
  }
  if (start) return start[1]!;
  if (end) return `bis ${monthLabel(project.endedOn!)}`;
  return null;
}

/** Was eine Karte von einem Projekt zeigt: Titel, Kunde oder Branche mit Zeitraum, vier Technologien. */
export type ProjectTeaser = {
  title: string;
  meta: string | null;
  technologies: string[];
  verified: boolean;
  /** Öffentlicher Projekt-/Arbeitgeberbeleg; niemals ein privater CV-Link. */
  href?: string | null;
  linkLabel?: string | null;
  /** Das Projekt überschneidet sich mit Begriffen aus der aktuellen Anfrage. */
  relevant?: boolean;
};

export function projectTeaser(project: ProfileProject, relevant = false): ProjectTeaser {
  const href = project.link?.startsWith("https://")
    ? project.link
    : project.source === "research" && project.sourceUrl?.startsWith("https://")
      ? project.sourceUrl
      : null;
  return {
    title: project.title,
    meta: [project.client ?? project.industry, projectPeriod(project)].filter(Boolean).join(" · ") || null,
    technologies: project.technologies.slice(0, 4),
    verified: project.verified,
    href,
    linkLabel: href ? (project.client ? `${project.client} ansehen` : "Projekt ansehen") : null,
    relevant,
  };
}

const QUERY_STOPWORDS = new Set(["der", "die", "das", "den", "dem", "und", "oder", "ein", "eine", "einer", "mit", "für", "von", "auf", "aus", "zur", "zum", "the", "and", "for", "with"]);

function words(values: readonly string[]): Set<string> {
  return new Set(values.join(" ").toLocaleLowerCase("de-DE").split(/[^\p{L}\p{N}+#.]+/u).filter((word) => word.length >= 3 && !QUERY_STOPWORDS.has(word)));
}

/** Deterministisch das Referenzprojekt wählen, das die aktuelle Anfrage am besten belegt. */
export function projectMatchScore(project: ProfileProject, queryTerms: readonly string[]): number {
  const query = words(queryTerms);
  if (!query.size) return 0;
  const evidence = words([
    project.title,
    project.client ?? "",
    project.industry ?? "",
    project.role ?? "",
    project.outcome ?? "",
    ...project.technologies,
  ]);
  return [...query].reduce((score, word) => score + Number(evidence.has(word)), 0);
}

/** Das Projekt für die Karte: ein geprüftes zuerst, sonst das erste der Liste. */
export function pickHighlight(projects: readonly ProfileProject[], queryTerms: readonly string[] = []): ProfileProject | null {
  if (queryTerms.length) {
    const ranked = projects
      .map((project, index) => ({ project, index, score: projectMatchScore(project, queryTerms) }))
      .sort((left, right) => right.score - left.score || Number(right.project.verified) - Number(left.project.verified) || left.index - right.index);
    if ((ranked[0]?.score ?? 0) > 0) return ranked[0]!.project;
  }
  return projects.find((project) => project.verified) ?? projects[0] ?? null;
}
