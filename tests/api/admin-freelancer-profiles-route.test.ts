import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  update: vi.fn(),
  save: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireAdminUser: mocks.requireAdmin }));
vi.mock("@/lib/admin/profile-admin", () => ({ updateAdminProfile: mocks.update, saveAdminProjects: mocks.save }));

import { PATCH } from "@/app/api/admin/freelancer-profiles/[id]/route";
import { PUT } from "@/app/api/admin/freelancer-profiles/[id]/projects/route";

const ID = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ id: ID }) };

function request(method: string, body: unknown, origin = "https://x-portal.eu") {
  return new Request(`https://x-portal.eu/api/admin/freelancer-profiles/${ID}`, {
    method,
    headers: { "content-type": "application/json", origin, "sec-fetch-site": origin === "https://x-portal.eu" ? "same-origin" : "cross-site" },
    body: JSON.stringify(body),
  });
}

const project = { title: "Service-Agent", source: "operator", technologies: ["Python"], isPublic: true, verified: true };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://x-portal.eu");
  mocks.requireAdmin.mockResolvedValue({ id: "admin-1", isAdmin: true });
  mocks.update.mockResolvedValue(true);
  mocks.save.mockResolvedValue(1);
});

describe("PUT /api/admin/freelancer-profiles/[id]/projects", () => {
  it("saves a valid list for admins", async () => {
    const response = await PUT(request("PUT", { projects: [project] }), params);
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(ID, [expect.objectContaining({ title: "Service-Agent", verified: true })], "admin-1");
  });

  it("names the broken project and refuses foreign pages and non-admins", async () => {
    const invalid = await PUT(request("PUT", { projects: [project, { ...project, link: "http://unsicher.example" }] }), params);
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toMatch(/^Projekt 2: /u);
    expect((await PUT(request("PUT", { projects: [project] }, "https://evil.example"), params)).status).toBe(403);
    mocks.requireAdmin.mockRejectedValueOnce(new Response("Forbidden", { status: 403 }));
    expect((await PUT(request("PUT", { projects: [project] }), params)).status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("explains a missing migration", async () => {
    mocks.save.mockRejectedValueOnce({ code: "PGRST202" });
    const response = await PUT(request("PUT", { projects: [project] }), params);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("Migration");
  });
});

describe("PATCH /api/admin/freelancer-profiles/[id]", () => {
  it("updates links, note and visibility", async () => {
    const response = await PATCH(
      request("PATCH", { links: [{ kind: "linkedin", url: "https://www.linkedin.com/in/kim" }], referencesSummary: "  ", status: "paused" }),
      params,
    );
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      ID,
      { links: [{ kind: "linkedin", url: "https://www.linkedin.com/in/kim" }], referencesSummary: null, status: "paused" },
      "admin-1",
    );
  });

  it("rejects empty and unknown changes and reports a missing profile", async () => {
    expect((await PATCH(request("PATCH", {}), params)).status).toBe(400);
    expect((await PATCH(request("PATCH", { status: "archived" }), params)).status).toBe(400);
    mocks.update.mockResolvedValueOnce(false);
    expect((await PATCH(request("PATCH", { status: "active" }), params)).status).toBe(404);
  });
});
