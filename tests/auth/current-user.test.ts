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
    process.env.ADMIN_USER_IDS = "admin-auth-uuid,second-admin-auth-uuid";
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

  it("grants admin access by server-side UUID configuration", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "admin-auth-uuid",
          email: "admin@example.test",
          is_anonymous: false,
        },
      },
      error: null,
    });

    await expect(getCurrentUser()).resolves.toMatchObject({
      id: "admin-auth-uuid",
      isAdmin: true,
    });
  });

  it("does not grant admin access from an email address alone", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "different-auth-uuid",
          email: "admin@example.test",
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
          sub: "admin-auth-uuid",
          email: "admin@example.test",
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

  it("accepts the admin role from a roles list", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "second-admin-auth-uuid",
          email: "second-admin@example.test",
          is_anonymous: false,
          app_metadata: { roles: ["billing", "admin"] },
        },
      },
      error: null,
    });
    process.env.ADMIN_USER_IDS = "";

    await expect(getCurrentUser()).resolves.toMatchObject({ isAdmin: true });
  });

  it("denies an authorized account outside a configured allowlist", async () => {
    process.env.ADMIN_ALLOWED_EMAILS = "admin@example.test";
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "someone-else-uuid",
          email: "someone-else@example.test",
          is_anonymous: false,
          app_metadata: { role: "admin" },
        },
      },
      error: null,
    });

    await expect(getCurrentUser()).resolves.toMatchObject({ isAdmin: false });
  });

  it("matches a configured allowlist regardless of case", async () => {
    process.env.ADMIN_ALLOWED_EMAILS = "admin@example.test, second-admin@example.test";
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "second-admin-auth-uuid",
          email: "Second-Admin@Example.test",
          is_anonymous: false,
        },
      },
      error: null,
    });

    await expect(getCurrentUser()).resolves.toMatchObject({ isAdmin: true });
  });

  it("denies an account without an address when an allowlist is configured", async () => {
    process.env.ADMIN_ALLOWED_EMAILS = "admin@example.test";
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "admin-auth-uuid",
          is_anonymous: false,
          app_metadata: { role: "admin" },
        },
      },
      error: null,
    });

    await expect(getCurrentUser()).resolves.toMatchObject({ isAdmin: false });
  });

  it("lets a deployment narrow access without granting rights", async () => {
    process.env.ADMIN_ALLOWED_EMAILS = "staging-admin@example.test";
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "admin-auth-uuid",
          email: "admin@example.test",
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

describe("account name", () => {
  it("takes the name the sign-in provider put into user_metadata", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "google-account-uuid",
          email: "erika@example.test",
          is_anonymous: false,
          user_metadata: { full_name: " Erika Mustermann ", name: "Erika Mustermann" },
        },
      },
      error: null,
    });

    await expect(getCurrentUser()).resolves.toMatchObject({
      displayName: "Erika Mustermann",
    });
  });

  it("prefers the name the account holder entered", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "email-account-uuid",
          email: "erika@example.test",
          is_anonymous: false,
          user_metadata: { display_name: "Erika Mustermann" },
        },
      },
      error: null,
    });

    await expect(getCurrentUser()).resolves.toMatchObject({
      displayName: "Erika Mustermann",
    });
  });

  it("leaves an email account without a name", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "email-account-uuid",
          email: "erika@example.test",
          is_anonymous: false,
          user_metadata: { email_verified: true },
        },
      },
      error: null,
    });

    await expect(getCurrentUser()).resolves.toMatchObject({ displayName: null });
  });
});
