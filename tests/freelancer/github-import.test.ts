import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { githubLoginFromIdentities } from "@/lib/auth/linked-identities";
import { draftFromGithub, type GithubRepo } from "@/lib/freelancer/import/github";

function repo(name: string, overrides: Partial<GithubRepo> = {}): GithubRepo {
  return {
    name,
    description: `${name} — ein Werkzeug für interne Datenflüsse`,
    html_url: `https://github.com/octocat/${name}`,
    fork: false,
    archived: false,
    stargazers_count: 0,
    created_at: "2024-03-10T12:00:00Z",
    pushed_at: "2026-09-01T12:00:00Z",
    topics: [],
    ...overrides,
  };
}

const NOW = "2026-10-05T10:00:00.000Z";

// GitHub ergänzt, es belegt nichts: Sprachen werden Vorschläge, Projekte
// bleiben ungeprüft, und ohne Repositorys entsteht ein leerer Entwurf.
describe("GitHub draft", () => {
  it("turns language shares and known topics into skill suggestions", () => {
    const draft = draftFromGithub({
      login: "octocat",
      linked: true,
      repos: [repo("pipeline", { topics: ["rag", "hacktoberfest"] }), repo("dashboard")],
      languages: {
        pipeline: { Python: 9_000, Dockerfile: 1_500, Makefile: 1_000 },
        dashboard: { TypeScript: 5_000, CSS: 50 },
      },
      importedAt: NOW,
    });
    expect(draft.source).toBe("github");
    expect(draft.github).toEqual({ login: "octocat", linked: true });
    expect(draft.skills).toContain("Python");
    expect(draft.skills).toContain("TypeScript");
    expect(draft.skills).toContain("Docker");
    // Themen nur aus dem Produktvokabular.
    expect(draft.skills).toContain("RAG");
    // Unter fünf Prozent Anteil und Build-Dateien zählen nicht.
    expect(draft.skills).not.toContain("CSS");
    expect(draft.skills).not.toContain("Makefile");
    expect(draft.skills.map((value) => value.toLowerCase())).not.toContain("hacktoberfest");
    expect(draft.roleTitle).toBeNull();
    expect(draft.experienceSummary).toBeNull();
  });

  it("ignores forks and archived repositories", () => {
    const draft = draftFromGithub({
      login: "octocat",
      linked: false,
      repos: [repo("fremdes-projekt", { fork: true }), repo("altlast", { archived: true })],
      languages: { "fremdes-projekt": { Rust: 1_000 }, altlast: { Perl: 1_000 } },
      importedAt: NOW,
    });
    expect(draft.skills).toEqual([]);
    expect(draft.projects).toEqual([]);
  });

  it("offers at most three unverified projects with a GitHub link", () => {
    const repos = ["eins", "zwei", "drei", "vier", "fuenf"].map((name, index) =>
      repo(name, { stargazers_count: index, description: index === 0 ? "kurz" : `${name}: Datenimport für Versicherer` }),
    );
    const draft = draftFromGithub({ login: "octocat", linked: false, repos, languages: {}, importedAt: NOW });
    expect(draft.projects).toHaveLength(3);
    expect(draft.projects.map((entry) => entry.title)).toEqual(["fuenf", "vier", "drei"]);
    for (const entry of draft.projects) {
      expect(entry).toMatchObject({ verified: false, source: "application", sourceUrl: null, isPublic: true });
      expect(entry.link).toMatch(/^https:\/\/github\.com\/octocat\//u);
      expect(entry.startedOn).toBe("2024-03");
    }
  });

  it("returns an empty draft without public repositories", () => {
    const draft = draftFromGithub({ login: "octocat", linked: false, repos: [], languages: {}, importedAt: NOW });
    expect(draft.skills).toEqual([]);
    expect(draft.projects).toEqual([]);
    expect(draft.github).toEqual({ login: "octocat", linked: false });
  });
});

describe("linked GitHub identity", () => {
  it("reads the username only from a GitHub identity with a valid login", () => {
    expect(githubLoginFromIdentities([
      { provider: "google", identity_data: { user_name: "not-github" } },
      { provider: "github", identity_data: { user_name: "octo-cat" } },
    ])).toBe("octo-cat");
    expect(githubLoginFromIdentities([{ provider: "github", identity_data: { user_name: "bad name" } }])).toBeNull();
    expect(githubLoginFromIdentities([{ provider: "github", identity_data: { preferred_username: "octocat" } }])).toBe("octocat");
    expect(githubLoginFromIdentities(null)).toBeNull();
  });
});
