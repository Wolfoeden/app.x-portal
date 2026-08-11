import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  getClaims: vi.fn(),
  signInAnonymously: vi.fn(),
  linkIdentity: vi.fn(),
  signInWithOAuth: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signOut: vi.fn(),
};

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserSupabaseClient: () => ({ auth }),
}));

import {
  registerEmailAccount,
  requestPasswordRecovery,
  startOauthUpgrade,
} from "@/lib/auth/browser";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

describe("browser authentication journeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://x-portal.eu";
    auth.getClaims.mockResolvedValue({
      data: { claims: { sub: "guest-user", is_anonymous: true } },
      error: null,
    });
    auth.linkIdentity.mockResolvedValue({ data: {}, error: null });
    auth.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    auth.signUp.mockResolvedValue({ data: { session: null, user: {} }, error: null });
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ prepared: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    vi.unstubAllGlobals();
  });

  it("starts Google through Supabase and preserves the guest workspace", async () => {
    await startOauthUpgrade("google");

    expect(fetch).toHaveBeenCalledWith("/api/auth/prepare-claim", expect.objectContaining({ method: "POST" }));
    expect(auth.linkIdentity).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://x-portal.eu/auth/callback?next=%2Fchat",
      },
    });
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("uses the active browser origin instead of a stale build-time site URL", async () => {
    vi.stubGlobal("window", { location: { origin: "https://portal.example" } });

    await startOauthUpgrade("google");

    expect(auth.linkIdentity).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://portal.example/auth/callback?next=%2Fchat",
      },
    });
  });

  it("keeps the Microsoft integration ready with the required email scope", async () => {
    await startOauthUpgrade("microsoft");

    expect(auth.linkIdentity).toHaveBeenCalledWith({
      provider: "azure",
      options: {
        redirectTo: "https://x-portal.eu/auth/callback?next=%2Fchat",
        scopes: "email",
      },
    });
  });

  it("creates an email account with an explicit password and confirmation callback", async () => {
    const result = await registerEmailAccount("user@example.com", "secure-password");

    expect(result).toEqual({ confirmationRequired: true });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "secure-password",
      options: {
        emailRedirectTo: "https://x-portal.eu/auth/callback?next=%2Fchat",
      },
    });
  });

  it("claims the guest workspace immediately when email confirmation is disabled", async () => {
    auth.signUp.mockResolvedValueOnce({ data: { session: {}, user: {} }, error: null });
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ prepared: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ claimed: true }), { status: 200 }));

    await expect(registerEmailAccount("user@example.com", "secure-password")).resolves.toEqual({
      confirmationRequired: false,
    });
    expect(fetch).toHaveBeenLastCalledWith("/api/auth/claim", expect.objectContaining({ method: "POST" }));
  });

  it("sends password recovery back to the set-password journey", async () => {
    await requestPasswordRecovery("user@example.com");

    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "user@example.com",
      {
        redirectTo: "https://x-portal.eu/auth/callback?next=%2Fchat%3Fset-password%3D1",
      },
    );
  });
});
