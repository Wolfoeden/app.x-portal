import "server-only";

import { relevantRepos, type GithubLanguages, type GithubRepo } from "./github";

const API = "https://api.github.com";
const TIMEOUT_MS = 8_000;
/** Öffentliche Daten ändern sich nicht im Minutentakt; schont das Abruflimit. */
const REVALIDATE_SECONDS = 600;

export type GithubFetchResult =
  | { status: "ok"; repos: GithubRepo[]; languages: Record<string, GithubLanguages> }
  | { status: "not_found" | "rate_limited" | "failed" };

function headers(): HeadersInit {
  const token = process.env.GITHUB_TOKEN?.trim();
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "XPORTAL-Profilimport",
    "X-GitHub-Api-Version": "2022-11-28",
    // Ohne Token gilt das Limit von 60 Abrufen je Stunde und Server-IP.
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function getJson(path: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${API}${path}`, {
    headers: headers(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate: REVALIDATE_SECONDS },
  });
  return { status: response.status, body: response.ok ? await response.json() : null };
}

function isRepo(value: unknown): value is GithubRepo {
  if (!value || typeof value !== "object") return false;
  const repo = value as Record<string, unknown>;
  return typeof repo.name === "string"
    && typeof repo.html_url === "string"
    && typeof repo.fork === "boolean"
    && typeof repo.pushed_at === "string"
    && typeof repo.created_at === "string";
}

/**
 * Liest die öffentlichen Repositorys eines Kontos und die Sprachen der
 * relevanten. Nur öffentliche Endpunkte, kein Zugriff im Namen der Person.
 */
export async function fetchGithubProfile(login: string): Promise<GithubFetchResult> {
  try {
    const user = await getJson(`/users/${encodeURIComponent(login)}`);
    if (user.status === 404) return { status: "not_found" };
    if (user.status === 403 || user.status === 429) return { status: "rate_limited" };
    if (user.status !== 200) return { status: "failed" };

    const list = await getJson(`/users/${encodeURIComponent(login)}/repos?type=owner&sort=pushed&per_page=30`);
    if (list.status === 403 || list.status === 429) return { status: "rate_limited" };
    if (list.status !== 200 || !Array.isArray(list.body)) return { status: "failed" };
    const repos = list.body.filter(isRepo).map((repo) => ({
      ...repo,
      description: typeof repo.description === "string" ? repo.description : null,
      archived: repo.archived === true,
      stargazers_count: typeof repo.stargazers_count === "number" ? repo.stargazers_count : 0,
      topics: Array.isArray(repo.topics) ? repo.topics.filter((topic): topic is string => typeof topic === "string") : [],
    }));

    const languages: Record<string, GithubLanguages> = {};
    await Promise.all(
      relevantRepos(repos).map(async (repo) => {
        const result = await getJson(`/repos/${encodeURIComponent(login)}/${encodeURIComponent(repo.name)}/languages`);
        if (result.status !== 200 || !result.body || typeof result.body !== "object") return;
        languages[repo.name] = Object.fromEntries(
          Object.entries(result.body as Record<string, unknown>).filter(
            (entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0,
          ),
        );
      }),
    );
    return { status: "ok", repos, languages };
  } catch {
    return { status: "failed" };
  }
}
