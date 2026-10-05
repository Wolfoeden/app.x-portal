"use client";

import type { Provider } from "@supabase/supabase-js";

import { appPath } from "@/lib/app-path";
import { TERMS_VERSION } from "@/lib/legal/policy";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

const supportedOauthProviders = {
  google: "google",
  microsoft: "azure",
  // Nur im Freelancer-Zugang (AuthDialog audience="freelancer").
  linkedin: "linkedin_oidc",
  github: "github",
} as const satisfies Record<string, Provider>;

export type OauthProviderName = keyof typeof supportedOauthProviders;

/**
 * Was der Anbieter herausgeben soll, und nicht mehr: bei LinkedIn die
 * OpenID-Angaben (Name, E-Mail, Bild). GitHub bleibt bei der Vorgabe von
 * Supabase (`user:email`); öffentliche Repositorys liest der Import ohne
 * Zugriffsrecht des Nutzers. Keine Nachrichten, keine Kontakte.
 */
const PROVIDER_SCOPES: Partial<Record<OauthProviderName, string>> = {
  microsoft: "email",
  linkedin: "openid profile email",
};

function siteUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3001"
  );
}

function authDestination(requestedDestination?: string) {
  const chatPath = appPath("/chat");
  if (typeof window === "undefined") return chatPath;
  if (
    requestedDestination?.startsWith("/") &&
    !requestedDestination.startsWith("//") &&
    !/[\\\u0000-\u001f\u007f]/u.test(requestedDestination)
  ) {
    return appPath(requestedDestination);
  }
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
  providerName: OauthProviderName,
  requestedDestination?: string,
) {
  const supabase = getBrowserSupabaseClient();
  const claims = await ensureGuestSession();
  await prepareGuestClaim();
  const provider = supportedOauthProviders[providerName];
  const destination = authDestination(requestedDestination);
  const redirectTo = `${siteUrl()}${appPath("/auth/callback")}?next=${encodeURIComponent(destination)}`;
  const scopes = PROVIDER_SCOPES[providerName];
  const options = {
    redirectTo,
    ...(scopes ? { scopes } : {}),
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

/**
 * Ein Konto ohne Passwort: E-Mail eingeben, Link öffnen, weiter.
 *
 * Vorher verlangte der Termin ein Konto mit Passwort und Wiederholung. Von 18
 * Personen, die die Registrierung begannen, kamen 5 durch (Stand 28.09.2026).
 * Ein Passwort schützt hier nichts, was der Bestätigungslink nicht ohnehin
 * schützt: Wer die Mail öffnen kann, kann auch jedes Passwort zurücksetzen.
 *
 * `signInWithOtp` legt ein neues Konto an und sendet die Bestätigung; für eine
 * Adresse mit Konto sendet es einen Anmeldelink. Beides endet auf derselben
 * Seite, die den Gastarbeitsplatz überträgt. Die Metadaten gelten nur für ein
 * neues Konto — ein bestehendes hat den AGB schon zugestimmt.
 */
export async function registerEmailAccount(
  email: string,
  displayName: string,
  consent: { termsAcceptedAt: string; marketingEmails: boolean },
  requestedDestination?: string,
) {
  const supabase = getBrowserSupabaseClient();
  await ensureGuestSession();
  await prepareGuestClaim();
  const destination = authDestination(requestedDestination);
  const state = await prepareEmailAuthState();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${siteUrl()}${appPath("/auth/complete")}?next=${encodeURIComponent(destination)}&state=${encodeURIComponent(state)}`,
      // Die Einwilligung entsteht in derselben Schreiboperation wie das Konto.
      // Es gibt damit kein Fenster, in dem ein Konto ohne den Nachweis
      // existiert — anders als bei einem nachgelagerten zweiten Aufruf.
      data: {
        display_name: displayName.trim(),
        terms_accepted_at: consent.termsAcceptedAt,
        // Ohne die Fassung ist der Zeitstempel wenig wert: Er belegt, dass
        // jemand zugestimmt hat, aber nicht, wozu. Sobald sich die AGB
        // ändern, ist das der Unterschied zwischen einem Nachweis und einer
        // Behauptung.
        terms_version: TERMS_VERSION,
        marketing_emails: consent.marketingEmails,
      },
    },
  });
  if (error) throw error;
  return { confirmationRequired: true } as const;
}

/**
 * Anmelden ohne Passwort, nur für ein bestehendes Konto.
 *
 * Ein Konto ohne Passwort braucht diesen Weg; über „Passwort vergessen“ ginge
 * es auch, sagt aber das Falsche. Ein neues Konto entsteht hier nicht, weil
 * dafür die Zustimmung zu den AGB fehlt.
 *
 * Gibt es zur Adresse kein Konto, lehnt Supabase ab. Die Oberfläche sagt dann
 * dasselbe wie bei Erfolg, damit sich nicht abfragen lässt, welche Adressen
 * ein Konto haben.
 */
export async function requestSignInLink(email: string, requestedDestination?: string) {
  const supabase = getBrowserSupabaseClient();
  await ensureGuestSession();
  await prepareGuestClaim();
  const destination = authDestination(requestedDestination);
  const state = await prepareEmailAuthState();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${siteUrl()}${appPath("/auth/complete")}?next=${encodeURIComponent(destination)}&state=${encodeURIComponent(state)}`,
    },
  });
  if (error && !isUnknownAccountRejection(error)) throw error;
}

function isUnknownAccountRejection(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (
    code === "otp_disabled" ||
    code === "user_not_found" ||
    (typeof message === "string" && message.toLowerCase().includes("signups not allowed"))
  );
}

export async function signInExistingAccount(email: string, password: string) {
  const supabase = getBrowserSupabaseClient();
  await ensureGuestSession();
  await prepareGuestClaim();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  await claimPreparedGuestWorkspace();
}

/**
 * Speichert den Kontonamen und holt ein Zugriffstoken, das ihn schon enthält.
 * Ohne die Erneuerung sähe der Server den neuen Namen erst beim nächsten
 * regulären Tokenwechsel.
 */
export async function saveAccountName(name: string) {
  const response = await fetch(appPath("/api/account/name"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? "Der Name konnte nicht gespeichert werden.");
  }

  const { error } = await getBrowserSupabaseClient().auth.refreshSession();
  if (error) throw error;
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
