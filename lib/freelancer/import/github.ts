/**
 * Öffentliche GitHub-Daten als Profilentwurf.
 *
 * GitHub ergänzt, es belegt nichts: Ein Repository in Python sagt, dass die
 * Person Python verwendet hat, nicht wie gut oder wie lange. Deshalb liefert
 * die Abbildung nur Skill-Vorschläge und bis zu drei Projekte, ohne jede
 * Aussage zu Seniorität oder Aktivität. Wer kein GitHub hat oder dort nichts
 * Öffentliches, bekommt einen leeren Entwurf; das Matching kennt GitHub nicht.
 *
 * Rein und testbar; der Abruf steht in `github-fetch.ts`.
 */

import { canonicalSkill, skillDefinition } from "@/lib/domain/skill-taxonomy";
import { MAX_TECHNOLOGIES, PROJECT_LIMITS, type ProfileProject } from "@/lib/profile/project-limits";

import { emptyDraft, type ProfileDraft } from "./draft";

export type GithubRepo = {
  name: string;
  description: string | null;
  html_url: string;
  fork: boolean;
  archived: boolean;
  stargazers_count: number;
  created_at: string;
  pushed_at: string;
  topics?: string[];
};

export type GithubLanguages = Readonly<Record<string, number>>;

/** Wie viele Repositorys der Abruf genauer ansieht (je ein Sprachenabruf). */
export const GITHUB_ANALYZED_REPOS = 6;
export const GITHUB_MAX_PROJECTS = 3;
const MAX_LANGUAGE_SKILLS = 8;
/** Unter diesem Anteil am Code zählt eine Sprache nicht als Skill. */
const MIN_LANGUAGE_SHARE = 0.05;

/** GitHub-Sprachen, die anders heißen als die Kompetenz dahinter. */
const LANGUAGE_SKILLS: Readonly<Record<string, string | null>> = {
  Dockerfile: "Docker",
  HCL: "Terraform",
  "Jupyter Notebook": "Python",
  Makefile: null,
  Batchfile: null,
  Procfile: null,
  Roff: null,
  CMake: null,
  "Vim Script": null,
};

function languageSkill(language: string): string | null {
  if (language in LANGUAGE_SKILLS) return LANGUAGE_SKILLS[language] ?? null;
  return canonicalSkill(language);
}

/** Themen nur, wenn das Produktvokabular sie kennt; „hacktoberfest“ ist kein Skill. */
function topicSkill(topic: string): string | null {
  const definition = skillDefinition(topic.replace(/-/gu, " "));
  return definition?.canonical ?? null;
}

/** Die Repositorys, die etwas über die Arbeit der Person sagen: eigene, aktive. */
export function relevantRepos(repos: readonly GithubRepo[]): GithubRepo[] {
  return repos
    .filter((repo) => !repo.fork && !repo.archived)
    .sort((a, b) => b.pushed_at.localeCompare(a.pushed_at))
    .slice(0, GITHUB_ANALYZED_REPOS);
}

function monthOf(value: string): string | null {
  const match = /^(\d{4})-(\d{2})/u.exec(value);
  return match ? `${match[1]}-${match[2]}` : null;
}

function unique(values: Iterable<string | null>): string[] {
  const seen = new Map<string, string>();
  for (const value of values) {
    if (!value) continue;
    const clean = value.replace(/:/gu, " ").trim();
    if (clean && !seen.has(clean.toLowerCase())) seen.set(clean.toLowerCase(), clean);
  }
  return [...seen.values()];
}

export function draftFromGithub(input: {
  login: string;
  linked: boolean;
  repos: readonly GithubRepo[];
  /** Sprachen je Repository-Name, für die `relevantRepos`. */
  languages: Readonly<Record<string, GithubLanguages>>;
  importedAt: string;
}): ProfileDraft {
  const draft: ProfileDraft = {
    ...emptyDraft("github", input.importedAt),
    github: { login: input.login, linked: input.linked },
  };
  const repos = relevantRepos(input.repos);
  if (!repos.length) return draft;

  const totals = new Map<string, number>();
  for (const repo of repos) {
    for (const [language, bytes] of Object.entries(input.languages[repo.name] ?? {})) {
      totals.set(language, (totals.get(language) ?? 0) + bytes);
    }
  }
  const all = [...totals.values()].reduce((sum, bytes) => sum + bytes, 0);
  const languageSkills = [...totals.entries()]
    .filter(([, bytes]) => all > 0 && bytes / all >= MIN_LANGUAGE_SHARE)
    .sort((a, b) => b[1] - a[1])
    .map(([language]) => languageSkill(language));
  const topicSkills = repos.flatMap((repo) => (repo.topics ?? []).map(topicSkill));
  draft.skills = unique([...languageSkills.slice(0, MAX_LANGUAGE_SKILLS), ...topicSkills]);

  const projects: ProfileProject[] = [...repos]
    .sort((a, b) => b.stargazers_count - a.stargazers_count || b.pushed_at.localeCompare(a.pushed_at))
    .filter((repo) => repo.name.length >= 3)
    .slice(0, GITHUB_MAX_PROJECTS)
    .map((repo) => {
      const languages = Object.entries(input.languages[repo.name] ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([language]) => languageSkill(language));
      const description = repo.description?.replace(/\s+/gu, " ").trim() ?? "";
      return {
        title: repo.name.slice(0, PROJECT_LIMITS.title),
        client: null,
        industry: null,
        role: null,
        startedOn: monthOf(repo.created_at),
        endedOn: null,
        ongoing: false,
        technologies: unique([...languages, ...(repo.topics ?? []).map(topicSkill)])
          .map((value) => value.slice(0, PROJECT_LIMITS.technology))
          .slice(0, MAX_TECHNOLOGIES),
        outcome: description.length >= 10 ? description.slice(0, PROJECT_LIMITS.outcome) : null,
        link: repo.html_url.startsWith("https://github.com/") ? repo.html_url : null,
        isPublic: true,
        verified: false,
        source: "application",
        sourceUrl: null,
      };
    });
  draft.projects = projects;
  return draft;
}
