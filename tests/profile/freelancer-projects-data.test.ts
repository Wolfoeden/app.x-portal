import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchProjects, replaceProjects, toDossierProject } from "@/lib/data/freelancer-projects";
import { pickHighlight, projectMatchScore, projectTeaser, type ProfileProject } from "@/lib/profile/project-limits";

const PROFILE = "11111111-1111-4111-8111-111111111111";

function client(answers: { select?: { data: unknown; error: unknown }; rpc?: { data: unknown; error: unknown } }) {
  const rpc = vi.fn(async () => answers.rpc ?? { data: 1, error: null });
  const calls: Array<[string, ...unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "in", "eq", "not", "is", "order", "limit"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return chain;
    };
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(answers.select ?? { data: [], error: null }).then(resolve);
  return { client: { from: () => chain, rpc } as never, rpc, calls };
}

const project: ProfileProject = {
  title: "Wissenssuche",
  client: null,
  industry: "Handel",
  role: "Entwickler",
  startedOn: "2023-02",
  endedOn: "2024-11",
  ongoing: false,
  technologies: ["RAG"],
  outcome: null,
  link: null,
  isPublic: true,
  verified: true,
  source: "operator",
  sourceUrl: null,
};

describe("projects in the database", () => {
  it("reads nothing, instead of failing, before the migration exists", async () => {
    const { client: missing } = client({ select: { data: null, error: { code: "42P01" } } });
    expect((await fetchProjects(missing, [PROFILE], { publicOnly: true })).size).toBe(0);
    const { client: broken } = client({ select: { data: null, error: { code: "57014", message: "timeout" } } });
    await expect(fetchProjects(broken, [PROFILE], { publicOnly: true })).rejects.toMatchObject({ code: "57014" });
  });

  it("groups rows by profile in order and turns dates into months", async () => {
    const { client: db } = client({
      select: {
        data: [
          { profile_id: PROFILE, position: 1, title: "A", client_label: null, industry: null, project_role: null, started_on: "2025-03-01", ended_on: null, ongoing: true, technologies: null, outcome: null, link_url: null, is_public: true, source: "operator", source_url: null, verified_at: "2026-10-01T00:00:00Z" },
        ],
        error: null,
      },
    });
    const projects = (await fetchProjects(db, [PROFILE], { publicOnly: true })).get(PROFILE)!;
    expect(projects[0]).toMatchObject({ title: "A", startedOn: "2025-03", ongoing: true, technologies: [], verified: true, approved: false });
  });

  // Oktober 2026: Kunden sehen nur, was öffentlich und freigegeben ist.
  it("shows customers only public projects XPORTAL has approved", async () => {
    const { client: db, calls } = client({});
    await fetchProjects(db, [PROFILE], { publicOnly: true });
    expect(calls).toContainEqual(["eq", "is_public", true]);
    expect(calls).toContainEqual(["not", "approved_at", "is", null]);
    const { client: own, calls: ownCalls } = client({});
    await fetchProjects(own, [PROFILE], { publicOnly: false });
    expect(ownCalls.some(([method]) => method === "not")).toBe(false);
  });

  it("keeps an approval for an unchanged project and withdraws it for pending ones", async () => {
    const { client: db, rpc } = client({
      select: {
        data: [{ title: "wissenssuche", verified_at: null, verified_by: null, approved_at: "2026-09-02T00:00:00Z", approved_by: "admin-0", created_at: "2026-08-01T00:00:00Z" }],
        error: null,
      },
    });
    await replaceProjects(
      db,
      PROFILE,
      [{ ...project, verified: false }, { ...project, title: "Neu vom Freelancer", verified: false, approved: false }, { ...project, title: "Vom Betreiber", verified: false }],
      "admin-1",
    );
    const payload = (rpc.mock.calls[0] as unknown as [string, { p_projects: Array<Record<string, unknown>> }])[1].p_projects;
    expect(payload[0]).toMatchObject({ approved_at: "2026-09-02T00:00:00Z", approved_by: "admin-0" });
    expect(payload[1]).toMatchObject({ approved_at: null, approved_by: null });
    expect(payload[2]).toMatchObject({ approved_by: "admin-1" });
    expect(payload[2]!.approved_at).toEqual(expect.any(String));
    // Jeder Eintrag trägt den Schlüssel; nur ältere App-Versionen lassen ihn weg.
    for (const entry of payload) expect(entry).toHaveProperty("approved_at");
  });

  it("keeps who checked first and when for an unchanged title, and records new checks", async () => {
    const { client: db, rpc } = client({
      select: {
        data: [{ title: "wissenssuche", verified_at: "2026-09-01T00:00:00Z", verified_by: "admin-0", created_at: "2026-08-01T00:00:00Z" }],
        error: null,
      },
    });
    await replaceProjects(
      db,
      PROFILE,
      [project, { ...project, title: "Neu", verified: false }, { ...project, title: "Frisch geprüft" }],
      "owner-1",
    );
    const payload = (rpc.mock.calls[0] as unknown as [string, { p_projects: Array<Record<string, unknown>> }])[1].p_projects;
    expect(payload[0]).toMatchObject({
      title: "Wissenssuche",
      started_on: "2023-02-01",
      ended_on: "2024-11-01",
      verified_at: "2026-09-01T00:00:00Z",
      verified_by: "admin-0",
      created_at: "2026-08-01T00:00:00Z",
    });
    expect(payload[1]).toMatchObject({ title: "Neu", verified_at: null, verified_by: null });
    expect(payload[2]).toMatchObject({ title: "Frisch geprüft", verified_by: "owner-1" });
    expect(payload[2]!.verified_at).toEqual(expect.any(String));
  });

  it("shows a research source only for researched projects", () => {
    expect(toDossierProject({ ...project, sourceUrl: "https://example.com" }).sourceUrl).toBeNull();
    expect(toDossierProject({ ...project, source: "research", sourceUrl: "https://example.com" })).toMatchObject({
      sourceUrl: "https://example.com",
      period: "2023 – 2024",
    });
  });

  it("selects the reference that overlaps with the current request", () => {
    const blockchain = { ...project, title: "Midnight Smart Contracts", industry: "Blockchain", technologies: ["Aiken", "Cardano"] };
    const commerce = { ...project, title: "Shop-Plattform", industry: "Handel", technologies: ["React"] };
    expect(projectMatchScore(blockchain, ["Blockchain", "Aiken Entwickler"])).toBeGreaterThan(projectMatchScore(commerce, ["Blockchain", "Aiken Entwickler"]));
    expect(pickHighlight([commerce, blockchain], ["Blockchain", "Aiken Entwickler"])?.title).toBe("Midnight Smart Contracts");
  });

  it("puts only public project or research links on the compact card", () => {
    expect(projectTeaser({ ...project, client: "Beispiel AG", link: "https://example.com/projekt" }, true)).toMatchObject({
      href: "https://example.com/projekt",
      linkLabel: "Beispiel AG ansehen",
      relevant: true,
    });
    expect(projectTeaser({ ...project, sourceUrl: "https://private.example/cv" }).href).toBeNull();
    expect(projectTeaser({ ...project, source: "research", sourceUrl: "https://example.com/referenz" }).href).toBe("https://example.com/referenz");
  });
});
