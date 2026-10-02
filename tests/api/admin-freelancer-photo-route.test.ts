import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  attach: vi.fn(),
  remove: vi.fn(),
  profile: { id: "x" } as unknown,
  createSignedUploadUrl: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireAdminUser: mocks.requireAdmin }));
vi.mock("@/lib/admin/profile-admin", () => ({ attachAdminAvatar: mocks.attach, removeAdminAvatar: mocks.remove }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq"]) builder[method] = () => builder;
    builder.maybeSingle = async () => ({ data: mocks.profile, error: null });
    return {
      from: () => builder,
      storage: { from: () => ({ createSignedUploadUrl: mocks.createSignedUploadUrl }) },
    };
  },
}));

import { DELETE, POST, PUT } from "@/app/api/admin/freelancer-profiles/[id]/photo/route";
import { AVATAR_OBJECT_PATH_PATTERN } from "@/lib/freelancer/avatar-limits";
import { signAvatarObjectPath } from "@/lib/freelancer/avatar-storage";

const ID = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ id: ID }) };
const PATH = `${ID}/avatar-0123456789abcdef0123456789abcdef.jpg`;

function request(method: string, body?: unknown, origin = "https://x-portal.eu") {
  return new Request(`https://x-portal.eu/api/admin/freelancer-profiles/${ID}/photo`, {
    method,
    headers: { "content-type": "application/json", origin, "sec-fetch-site": origin === "https://x-portal.eu" ? "same-origin" : "cross-site" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://x-portal.eu");
  mocks.requireAdmin.mockResolvedValue({ id: "admin-1", isAdmin: true });
  mocks.profile = { id: ID };
  mocks.createSignedUploadUrl.mockResolvedValue({ data: { token: "upload-token" }, error: null });
  mocks.attach.mockResolvedValue("/api/freelancer/avatar-image/x");
  mocks.remove.mockResolvedValue(true);
});

describe("admin photo for a published profile", () => {
  it("hands out a ticket for the profile's own avatar path", async () => {
    const response = await POST(request("POST", { mimeType: "image/jpeg", sizeBytes: 2048 }), params);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { path: string; pathToken: string };
    expect(body.path).toMatch(AVATAR_OBJECT_PATH_PATTERN);
    expect(body.path.startsWith(`${ID}/`)).toBe(true);
    expect(body.pathToken).toBe(signAvatarObjectPath(body.path));
    mocks.profile = null;
    expect((await POST(request("POST", { mimeType: "image/jpeg", sizeBytes: 2048 }), params)).status).toBe(404);
  });

  it("sets a photo only with confirmed consent", async () => {
    const token = signAvatarObjectPath(PATH);
    const without = await PUT(request("PUT", { path: PATH, token }), params);
    expect(without.status).toBe(400);
    expect((await PUT(request("PUT", { path: PATH, token, consent: false }), params)).status).toBe(400);
    expect(mocks.attach).not.toHaveBeenCalled();
    const response = await PUT(request("PUT", { path: PATH, token, consent: true }), params);
    expect(response.status).toBe(200);
    expect(mocks.attach).toHaveBeenCalledWith(ID, PATH, token, "admin-1");
  });

  it("removes a photo and refuses non-admins and foreign pages", async () => {
    expect(await (await DELETE(request("DELETE"), params)).json()).toMatchObject({ removed: true });
    expect(mocks.remove).toHaveBeenCalledWith(ID, "admin-1");
    expect((await DELETE(request("DELETE", undefined, "https://evil.example"), params)).status).toBe(403);
    mocks.requireAdmin.mockRejectedValueOnce(new Response("Forbidden", { status: 403 }));
    expect((await POST(request("POST", { mimeType: "image/jpeg", sizeBytes: 2048 }), params)).status).toBe(403);
  });
});
