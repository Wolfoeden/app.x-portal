import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ auth: { getClaims } }),
}));

import { getCurrentUser } from "@/lib/auth/current-user";

const originalAdminIds = process.env.ADMIN_USER_IDS;
const originalAdminEmails = process.env.ADMIN_ALLOWED_EMAILS;

describe("server-side admin authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_USER_IDS = "roman-auth-uuid,paul-auth-uuid";
    delete process.env.ADMIN_ALLOWED_EMAILS;
  });

  afterEach(() => {
    process.env.ADMIN_USER_IDS = originalAdminIds;
    if (originalAdminEmails === undefined) {
      delete process.env.ADMIN_ALLOWED_EMAILS;
    } else {
      process.env.ADMIN_ALLOWED_EMAILS = originalAdminEmails;
    }
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

  it("denies an authorized account whose address is not on the allowlist", async () => {
    // Der Zugang hängt an zwei Adressen. Eine gültige Rolle allein reicht
    // nicht — sonst öffnet ein versehentlich gesetztes app_metadata den
    // gesamten Admin-Bereich.
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "someone-else-uuid",
          email: "ro.mann.de@gmail.com",
          is_anonymous: false,
          app_metadata: { role: "admin" },
        },
      },
      error: null,
    });
    process.env.ADMIN_USER_IDS = "someone-else-uuid";

    await expect(getCurrentUser()).resolves.toMatchObject({ isAdmin: false });
  });

  it("admits paul as the second allowlisted address", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "paul-auth-uuid",
          email: "Paul@Dering.info",
          is_anonymous: false,
        },
      },
      error: null,
    });

    await expect(getCurrentUser()).resolves.toMatchObject({ isAdmin: true });
  });

  it("denies an authorized account that carries no address at all", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "roman-auth-uuid",
          is_anonymous: false,
          app_metadata: { role: "admin" },
        },
      },
      error: null,
    });

    await expect(getCurrentUser()).resolves.toMatchObject({ isAdmin: false });
  });

  it("lets a deployment override the allowlist without granting rights", async () => {
    process.env.ADMIN_ALLOWED_EMAILS = "staging-admin@example.test";
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

    await expect(getCurrentUser()).resolves.toMatchObject({ isAdmin: false });
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
