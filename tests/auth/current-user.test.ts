import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ auth: { getClaims } }),
}));

import { getCurrentUser } from "@/lib/auth/current-user";

const originalAdminIds = process.env.ADMIN_USER_IDS;

describe("server-side admin authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_USER_IDS = "roman-auth-uuid,paul-auth-uuid";
  });

  afterEach(() => {
    process.env.ADMIN_USER_IDS = originalAdminIds;
  });

  it("grants admin access only by server-side UUID configuration", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "roman-auth-uuid",
          email: "roman@dering.info",
          is_anonymous: false,
        },
      },
      error: null,
    });

    await expect(getCurrentUser()).resolves.toMatchObject({
      id: "roman-auth-uuid",
      isAdmin: true,
    });
  });

  it("does not grant admin access from an email address alone", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "different-auth-uuid",
          email: "roman@dering.info",
          is_anonymous: false,
        },
      },
      error: null,
    });

    await expect(getCurrentUser()).resolves.toMatchObject({
      isAdmin: false,
    });
  });

  it("accepts a server-issued app_metadata admin role", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "roman-auth-uuid",
          email: "roman@dering.info",
          is_anonymous: false,
          app_metadata: { role: "admin" },
        },
      },
      error: null,
    });
    process.env.ADMIN_USER_IDS = "";

    await expect(getCurrentUser()).resolves.toMatchObject({
      isAdmin: true,
    });
  });

  it("treats a missing anonymous claim as non-account state", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "claim-without-account-proof",
          email: "untrusted@example.test",
        },
      },
      error: null,
    });

    await expect(getCurrentUser()).resolves.toMatchObject({
      isAnonymous: true,
      isAdmin: false,
    });
  });
});
