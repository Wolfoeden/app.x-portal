import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Ein GitHub-Login: Buchstaben, Ziffern, einzelne Bindestriche, bis 39 Zeichen. */
export const GITHUB_LOGIN_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/iu;

type IdentityLike = {
  provider?: unknown;
  identity_data?: unknown;
};

/**
 * Der GitHub-Nutzername einer verknüpften Identität, rein ausgewertet.
 *
 * Supabase legt ihn als `user_name` (ältere Konten: `preferred_username`) in
 * die Identitätsdaten. Ein Wert, der kein gültiger GitHub-Login ist, zählt
 * als nicht vorhanden.
 */
export function githubLoginFromIdentities(identities: readonly IdentityLike[] | null | undefined): string | null {
  for (const identity of identities ?? []) {
    if (identity.provider !== "github") continue;
    const data = identity.identity_data;
    if (!data || typeof data !== "object") continue;
    const record = data as Record<string, unknown>;
    for (const key of ["user_name", "preferred_username"]) {
      const value = record[key];
      if (typeof value === "string" && GITHUB_LOGIN_PATTERN.test(value)) return value;
    }
  }
  return null;
}

/**
 * Welche Anbieter mit dem angemeldeten Konto verknüpft sind und, falls
 * GitHub dabei ist, unter welchem Namen. Die Claims des Tokens enthalten die
 * Identitäten nicht, deshalb ein eigener Abruf. Fehler zählen als „keine“.
 */
export async function linkedIdentities(): Promise<{ providers: string[]; githubLogin: string | null }> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return { providers: [], githubLogin: null };
    const identities = data.user.identities ?? [];
    return {
      providers: [...new Set(identities.map((identity) => identity.provider))],
      githubLogin: githubLoginFromIdentities(identities),
    };
  } catch {
    return { providers: [], githubLogin: null };
  }
}
