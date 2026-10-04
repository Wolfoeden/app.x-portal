import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  rateLimit: vi.fn(),
  save: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: mocks.currentUser }));
vi.mock("@/lib/security/shared-rate-limit", () => ({ consumeRateLimit: mocks.rateLimit }));
vi.mock("@/lib/freelancer/owner-projects", () => ({
  ProjectLimitError: class ProjectLimitError extends Error {},
  saveOwnedProjects: mocks.save,
}));

import { PUT } from "@/app/api/freelancer/projects/route";
import { ProjectLimitError } from "@/lib/freelancer/owner-projects";

function request(body: unknown, origin = "https://x-portal.eu") {
  return new Request("https://x-portal.eu/api/freelancer/projects", {
    method: "PUT",
    headers: { "content-type": "application/json", origin, "sec-fetch-site": origin === "https://x-portal.eu" ? "same-origin" : "cross-site" },
    body: JSON.stringify(body),
  });
}

const project = { title: "Service-Agent", technologies: ["Python"], outcome: "Durchlaufzeit halbiert.", isPublic: true };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://x-portal.eu");
  mocks.currentUser.mockResolvedValue({ id: "owner-1", isAnonymous: false });
  mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  mocks.save.mockImplementation(async (_userId: string, projects: unknown[]) => projects);
});

describe("PUT /api/freelancer/projects", () => {
  it("saves the owner's list and answers without caching", async () => {
    const response = await PUT(request({ projects: [project] }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.save).toHaveBeenCalledWith("owner-1", [expect.objectContaining({ title: "Service-Agent", verified: false })]);
    expect((await response.json()).projects).toHaveLength(1);
    expect(mocks.rateLimit).toHaveBeenCalledWith("freelancer-projects:owner-1", 30, 3_600_000);
  });

  it("refuses foreign pages, guests and too many changes", async () => {
    expect((await PUT(request({ projects: [project] }, "https://evil.example"))).status).toBe(403);
    mocks.currentUser.mockResolvedValueOnce({ id: "guest", isAnonymous: true });
    expect((await PUT(request({ projects: [project] }))).status).toBe(403);
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 90 });
    const limited = await PUT(request({ projects: [project] }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("90");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("names the broken project and rejects unknown fields", async () => {
    const invalid = await PUT(request({ projects: [project, { ...project, title: "x" }] }));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toMatch(/^Projekt 2: /u);
    expect((await PUT(request({ projects: [project], verifiedBy: "owner-1" }))).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("explains a missing profile, a full list and a missing migration", async () => {
    mocks.save.mockResolvedValueOnce(null);
    expect((await PUT(request({ projects: [project] }))).status).toBe(404);
    mocks.save.mockRejectedValueOnce(new ProjectLimitError());
    const full = await PUT(request({ projects: [project] }));
    expect(full.status).toBe(400);
    expect((await full.json()).error).toContain("Vorschläge");
    mocks.save.mockRejectedValueOnce({ code: "42P01" });
    expect((await PUT(request({ projects: [project] }))).status).toBe(409);
  });

  it("hides internal errors behind a trace id", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.save.mockRejectedValueOnce(new Error("connection reset"));
    const response = await PUT(request({ projects: [project] }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).not.toContain("connection");
    expect(body.traceId).toEqual(expect.any(String));
  });
});
