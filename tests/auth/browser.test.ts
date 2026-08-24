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
  setSession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  signOut: vi.fn(),
};

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserSupabaseClient: () => ({ auth }),
}));

import {
  completeEmailAuthSession,
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
    auth.setSession.mockResolvedValue({ data: { session: {} }, error: null });
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: {} },
      error: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        if (String(input) === "/api/auth/email-state" && init?.method === "POST") {
          return Promise.resolve(
            new Response(JSON.stringify({ state: "email-state" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ prepared: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );
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

  it("falls back to Google OAuth when anonymous identity linking is unavailable", async () => {
    auth.linkIdentity.mockResolvedValueOnce({
      data: {},
      error: new Error("manual linking unavailable"),
    });

    await startOauthUpgrade("google");

    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://x-portal.eu/auth/callback?next=%2Fchat",
      },
    });
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

  it("returns an admin login to the protected dashboard journey", async () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://x-portal.eu",
        pathname: "/chat",
        search: "?admin-login=1",
      },
    });

    await startOauthUpgrade("google");

    expect(auth.linkIdentity).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo:
          "https://x-portal.eu/auth/callback?next=%2Fchat%3Fadmin-login%3D1",
      },
    });
  });

  it("returns OAuth to the freelancer portal when authentication starts there", async () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://x-portal.eu",
        pathname: "/freelancer/apply",
        search: "",
      },
    });

    await startOauthUpgrade("google");

    expect(auth.linkIdentity).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo:
          "https://x-portal.eu/auth/callback?next=%2Ffreelancer%2Fapply",
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
        emailRedirectTo: "https://x-portal.eu/auth/complete?next=%2Fchat&state=email-state",
      },
    });
  });

  it("returns a confirmed email account to the freelancer portal", async () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://x-portal.eu",
        pathname: "/freelancer/apply",
        search: "",
      },
    });

    await registerEmailAccount("freelancer@example.com", "secure-password");

    expect(auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          emailRedirectTo:
            "https://x-portal.eu/auth/complete?next=%2Ffreelancer%2Fapply&state=email-state",
        },
      }),
    );
  });

  it("claims the guest workspace immediately when email confirmation is disabled", async () => {
    auth.signUp.mockResolvedValueOnce({ data: { session: {}, user: {} }, error: null });
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ prepared: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ state: "email-state" }), { status: 200 }))
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
        redirectTo: "https://x-portal.eu/auth/complete?next=%2Fchat%3Fset-password%3D1&state=email-state",
      },
    );
  });

  it("completes a default Supabase email link from fragment session tokens", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ verified: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ claimed: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(
      completeEmailAuthSession({
        accessToken: "access-token",
        code: null,
        refreshToken: "refresh-token",
        state: "email-state",
      }),
    ).resolves.toEqual({ claimWarning: false });

    expect(auth.setSession).toHaveBeenCalledWith({
      access_token: "access-token",
      refresh_token: "refresh-token",
    });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("also completes PKCE email links when Supabase returns a code", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ verified: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ claimed: false, reason: "claim_cookie_missing" }),
          {
            status: 409,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    await expect(
      completeEmailAuthSession({
        accessToken: null,
        code: "pkce-code",
        refreshToken: null,
        state: "email-state",
      }),
    ).resolves.toEqual({ claimWarning: false });

    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
  });

  it("rejects an unbound email link before creating a session", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ verified: false }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      completeEmailAuthSession({
        accessToken: "attacker-access",
        code: null,
        refreshToken: "attacker-refresh",
        state: "foreign-state",
      }),
    ).rejects.toThrow("invalid or expired");

    expect(auth.setSession).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
