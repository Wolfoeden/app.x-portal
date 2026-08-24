"use client";

import type { Provider } from "@supabase/supabase-js";

import { appPath } from "@/lib/app-path";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

const supportedOauthProviders = {
  google: "google",
  microsoft: "azure",
} as const satisfies Record<string, Provider>;

function siteUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3001"
  );
}

function authDestination() {
  const chatPath = appPath("/chat");
  if (typeof window === "undefined") return chatPath;
  const freelancerPath = appPath("/freelancer/apply");
  if (window.location.pathname === freelancerPath) return freelancerPath;
  if (window.location.pathname !== chatPath) return chatPath;

  const params = new URLSearchParams(window.location.search);
  return params.get("admin-login") === "1"
    ? `${chatPath}?admin-login=1`
    : chatPath;
}

export async function ensureGuestSession() {
  const supabase = getBrowserSupabaseClient();
  const { data: existing } = await supabase.auth.getClaims();
  if (existing?.claims?.sub) return existing.claims;

  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(
      "Der temporäre Zugang ist noch nicht verfügbar. Bitte versuchen Sie es später erneut.",
      { cause: error },
    );
  }

  const { data, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !data?.claims?.sub) {
    throw new Error(
      "Der temporäre Zugang konnte nicht sicher gestartet werden. Bitte versuchen Sie es später erneut.",
      { cause: claimsError },
    );
  }

  return data.claims;
}

export async function claimPreparedGuestWorkspace() {
  const response = await fetch(appPath("/api/auth/claim"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const payload = (await response.json().catch(() => null)) as
    | { claimed?: boolean; reason?: string }
    | null;

  if (!response.ok || payload?.claimed !== true) {
    throw new Error(
      "Die bisherige Gastanfrage konnte nicht übertragen werden. Bitte wenden Sie sich an Roman Dering.",
    );
  }
  return true;
}

export async function prepareGuestClaim() {
  const response = await fetch(appPath("/api/auth/prepare-claim"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  if (!response.ok) {
    throw new Error("The guest workspace could not be prepared for sign-in.");
  }
}

export async function startOauthUpgrade(
  providerName: keyof typeof supportedOauthProviders,
) {
  const supabase = getBrowserSupabaseClient();
  const claims = await ensureGuestSession();
  await prepareGuestClaim();
  const provider = supportedOauthProviders[providerName];
  const destination = authDestination();
  const redirectTo = `${siteUrl()}${appPath("/auth/callback")}?next=${encodeURIComponent(destination)}`;
  const options = {
    redirectTo,
    ...(providerName === "microsoft" ? { scopes: "email" } : {}),
  };

  if (claims.is_anonymous === true) {
    const { error } = await supabase.auth.linkIdentity({
      provider,
      options,
    });
    if (!error) return;
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options,
  });
  if (error) throw error;
}

async function attemptPreparedGuestWorkspaceClaim() {
  const response = await fetch(appPath("/api/auth/claim"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const payload = (await response.json().catch(() => null)) as
    | { claimed?: boolean; reason?: string }
    | null;

  if (response.ok && payload?.claimed === true) return "claimed" as const;
  if (response.status === 409 && payload?.reason === "claim_cookie_missing") {
    return "not_prepared" as const;
  }
  return "failed" as const;
}

async function prepareEmailAuthState() {
  const response = await fetch(appPath("/api/auth/email-state"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const payload = (await response.json().catch(() => null)) as
    | { state?: string }
    | null;
  if (!response.ok || !payload?.state) {
    throw new Error("The email authentication flow could not be prepared.");
  }
  return payload.state;
}

async function consumeEmailAuthState(state: string | null) {
  if (!state) throw new Error("The email authentication state is missing.");
  const response = await fetch(appPath("/api/auth/email-state"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { verified?: boolean }
    | null;
  if (!response.ok || payload?.verified !== true) {
    throw new Error("The email authentication state is invalid or expired.");
  }
}

export async function registerEmailAccount(email: string, password: string) {
  const supabase = getBrowserSupabaseClient();
  await ensureGuestSession();
  await prepareGuestClaim();
  const destination = authDestination();
  const state = await prepareEmailAuthState();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl()}${appPath("/auth/complete")}?next=${encodeURIComponent(destination)}&state=${encodeURIComponent(state)}`,
    },
  });
  if (error) throw error;

  if (data.session) {
    await claimPreparedGuestWorkspace();
    return { confirmationRequired: false } as const;
  }

  return { confirmationRequired: true } as const;
}

export async function signInExistingAccount(email: string, password: string) {
  const supabase = getBrowserSupabaseClient();
  await ensureGuestSession();
  await prepareGuestClaim();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  await claimPreparedGuestWorkspace();
}

export async function setAccountPassword(password: string) {
  const supabase = getBrowserSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function requestPasswordRecovery(email: string) {
  const supabase = getBrowserSupabaseClient();
  await ensureGuestSession();
  await prepareGuestClaim();
  const baseDestination = authDestination();
  const destination = `${baseDestination}${baseDestination.includes("?") ? "&" : "?"}set-password=1`;
  const state = await prepareEmailAuthState();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}${appPath("/auth/complete")}?next=${encodeURIComponent(destination)}&state=${encodeURIComponent(state)}`,
  });
  if (error) throw error;
}

export async function completeEmailAuthSession({
  accessToken,
  code,
  refreshToken,
  state,
}: {
  accessToken: string | null;
  code: string | null;
  refreshToken: string | null;
  state: string | null;
}) {
  const supabase = getBrowserSupabaseClient();

  await consumeEmailAuthState(state);

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
  } else {
    throw new Error("The email authentication link is incomplete.");
  }

  const claimStatus = await attemptPreparedGuestWorkspaceClaim();
  return { claimWarning: claimStatus === "failed" } as const;
}

export async function signOut() {
  const { error } = await getBrowserSupabaseClient().auth.signOut();
  if (error) throw error;
}
