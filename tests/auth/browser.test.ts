import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  getClaims: vi.fn(),
  signInAnonymously: vi.fn(),
  linkIdentity: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  refreshSession: vi.fn(),
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
  requestSignInLink,
  saveAccountName,
  startOauthUpgrade,
} from "@/lib/auth/browser";
import { TERMS_VERSION } from "@/lib/legal/policy";

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
    auth.signInWithOtp.mockResolvedValue({ data: { session: null, user: null }, error: null });
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

  it("creates an email account without a password, confirmed by link", async () => {
    const result = await registerEmailAccount("user@example.com", "Erika Mustermann", {
      termsAcceptedAt: "2026-08-31T10:00:00.000Z",
      marketingEmails: false,
    });

    expect(result).toEqual({ confirmationRequired: true });
    expect(fetch).toHaveBeenCalledWith("/api/auth/prepare-claim", expect.objectContaining({ method: "POST" }));
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      options: {
        shouldCreateUser: true,
        emailRedirectTo: "https://x-portal.eu/auth/complete?next=%2Fchat&state=email-state",
        data: {
          display_name: "Erika Mustermann",
          terms_accepted_at: "2026-08-31T10:00:00.000Z",
          // Ohne die Fassung belegt der Zeitstempel nur, DASS zugestimmt
          // wurde, nicht wozu.
          terms_version: TERMS_VERSION,
          marketing_emails: false,
        },
      },
    });
  });

  it("records an opt-in for optional email on the new account", async () => {
    await registerEmailAccount("user@example.com", "Erika Mustermann", {
      termsAcceptedAt: "2026-08-31T10:00:00.000Z",
      marketingEmails: true,
    });

    expect(auth.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: {
            display_name: "Erika Mustermann",
            terms_accepted_at: "2026-08-31T10:00:00.000Z",
            terms_version: TERMS_VERSION,
            marketing_emails: true,
          },
        }),
      }),
    );
  });

  it("returns a confirmed email account to the freelancer portal", async () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://x-portal.eu",
        pathname: "/freelancer/apply",
        search: "",
      },
    });

    await registerEmailAccount("freelancer@example.com", "Erika Mustermann", {
      termsAcceptedAt: "2026-08-31T10:00:00.000Z",
      marketingEmails: false,
    });

    expect(auth.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo:
            "https://x-portal.eu/auth/complete?next=%2Ffreelancer%2Fapply&state=email-state",
        }),
      }),
    );
  });

  it("surfaces a failed confirmation email instead of claiming success", async () => {
    const failure = Object.assign(new Error("Error sending confirmation email"), {
      status: 500,
      code: "unexpected_failure",
    });
    auth.signInWithOtp.mockResolvedValueOnce({ data: { session: null, user: null }, error: failure });

    await expect(
      registerEmailAccount("user@example.com", "Erika Mustermann", {
        termsAcceptedAt: "2026-08-31T10:00:00.000Z",
        marketingEmails: false,
      }),
    ).rejects.toBe(failure);
  });

  // Ein Konto ohne Passwort meldet sich per Link an. Ein neues Konto darf
  // dabei nicht entstehen: Die Zustimmung zu den AGB fehlt auf diesem Weg.
  it("sends a sign-in link only to an existing account", async () => {
    await requestSignInLink("user@example.com", "/chat?resume=book_profile");

    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      options: {
        shouldCreateUser: false,
        emailRedirectTo:
          "https://x-portal.eu/auth/complete?next=%2Fchat&state=email-state",
      },
    });
  });

  // Die Oberfläche antwortet für jede Adresse gleich, damit sich nicht
  // abfragen lässt, zu welcher Adresse ein Konto besteht.
  it("does not reveal that an address has no account", async () => {
    auth.signInWithOtp.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: Object.assign(new Error("Signups not allowed for otp"), {
        status: 422,
        code: "otp_disabled",
      }),
    });

    await expect(requestSignInLink("unknown@example.com")).resolves.toBeUndefined();
  });

  it("still reports a sign-in link that could not be sent", async () => {
    const failure = Object.assign(new Error("Error sending magic link email"), {
      status: 500,
      code: "unexpected_failure",
    });
    auth.signInWithOtp.mockResolvedValueOnce({ data: { session: null, user: null }, error: failure });

    await expect(requestSignInLink("user@example.com")).rejects.toBe(failure);
  });

  it("saves the account name and renews the token that carries it", async () => {
    auth.refreshSession.mockResolvedValue({ data: { session: {} }, error: null });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ displayName: "Erika Mustermann" }), { status: 200 }),
    );

    await saveAccountName("Erika Mustermann");

    expect(fetch).toHaveBeenCalledWith("/api/account/name", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ name: "Erika Mustermann" }),
    }));
    expect(auth.refreshSession).toHaveBeenCalledOnce();
  });

  it("reports the server's reason and keeps the old token when saving the name fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Bitte geben Sie höchstens 80 Zeichen ein." }), { status: 400 }),
    );

    await expect(saveAccountName("x".repeat(81))).rejects.toThrow(
      "Bitte geben Sie höchstens 80 Zeichen ein.",
    );
    expect(auth.refreshSession).not.toHaveBeenCalled();
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
