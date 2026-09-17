import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ auth: { updateUser: mocks.updateUser } }),
}));

import { PUT } from "@/app/api/account/name/route";

function nameRequest(body: unknown, origin = "https://x-portal.eu") {
  return new Request("https://x-portal.eu/api/account/name", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({ id: "account-1", isAnonymous: false });
  mocks.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
});

describe("account name route", () => {
  it("stores the trimmed name in the account's own metadata", async () => {
    const response = await PUT(nameRequest({ name: "  Erika Mustermann " }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ displayName: "Erika Mustermann" });
    expect(mocks.updateUser).toHaveBeenCalledWith({
      data: { display_name: "Erika Mustermann" },
    });
  });

  it("removes the name when the field is left empty", async () => {
    await PUT(nameRequest({ name: "   " }));

    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { display_name: null } });
  });

  it("rejects a name longer than the field allows", async () => {
    const response = await PUT(nameRequest({ name: "E".repeat(81) }));

    expect(response.status).toBe(400);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("keeps guests from writing a name", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "guest-1", isAnonymous: true });

    const response = await PUT(nameRequest({ name: "Erika" }));

    expect(response.status).toBe(403);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("refuses a request from another site", async () => {
    const response = await PUT(nameRequest({ name: "Erika" }, "https://evil.example"));

    expect(response.status).toBe(403);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
