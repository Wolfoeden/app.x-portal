import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  deleteProfile: vi.fn(),
  rpc: vi.fn(),
  deleteUser: vi.fn(),
  remove: vi.fn(),
  open: [] as Array<Record<string, unknown>>,
  deletedIds: [] as string[],
  calls: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: mocks.currentUser }));
vi.mock("@/lib/freelancer/profile-data", () => ({ deleteOwnedFreelancerProfile: mocks.deleteProfile }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    rpc: mocks.rpc,
    auth: { admin: { deleteUser: mocks.deleteUser } },
    storage: { from: (bucket: string) => ({ remove: (paths: string[]) => mocks.remove(bucket, paths) }) },
    from: () => {
      let op = "select";
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        in: (_column: string, values: string[]) => {
          if (op === "delete") mocks.deletedIds.push(...values);
          return builder;
        },
        delete: () => {
          op = "delete";
          mocks.calls.push("delete-applications");
          return builder;
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(op === "select" ? { data: mocks.open, error: null } : { data: null, error: null }).then(resolve),
      };
      return builder;
    },
  }),
}));

import { DELETE } from "@/app/api/account/delete/route";

function request() {
  return new Request("https://x-portal.eu/api/account/delete", {
    method: "DELETE",
    headers: { "content-type": "application/json", origin: "https://x-portal.eu", "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ confirm: "kim@example.com" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://x-portal.eu");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  mocks.currentUser.mockResolvedValue({ id: "user-1", isAnonymous: false, email: "kim@example.com" });
  mocks.deleteProfile.mockResolvedValue(false);
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.deleteUser.mockImplementation(async () => {
    mocks.calls.push("delete-user");
    return { error: null };
  });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.open = [];
  mocks.deletedIds = [];
  mocks.calls = [];
});

// Oktober 2026: Eine offene Bewerbung blieb nach dem Löschen des Kontos ohne
// Besitzer stehen, mit Lebenslauf, und sperrte die Adresse für eine neue.
describe("DELETE /api/account/delete", () => {
  it("deletes the open application with its CV and photo before the account", async () => {
    mocks.open = [{ id: "application-1", cv_storage_path: "incoming/a/cv.pdf", photo_storage_path: "incoming/a/avatar.webp" }];
    const response = await DELETE(request());
    expect(response.status).toBe(200);
    expect(mocks.deletedIds).toEqual(["application-1"]);
    expect(mocks.remove).toHaveBeenCalledWith("freelancer-cvs", ["incoming/a/cv.pdf"]);
    expect(mocks.remove).toHaveBeenCalledWith("freelancer-avatars", ["incoming/a/avatar.webp"]);
    expect(mocks.calls).toEqual(["delete-applications", "delete-user"]);
  });

  it("deletes the account when there is no open application", async () => {
    const response = await DELETE(request());
    expect(response.status).toBe(200);
    expect(mocks.deletedIds).toEqual([]);
    expect(mocks.deleteUser).toHaveBeenCalledWith("user-1");
  });
});
