import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Was eine Profilkarte zusätzlich zum gespeicherten Abgleich zeigt, live aus
 * der Datenbank: die Referenznotiz des Betreibers.
 *
 * Sie steht nicht im Match-Snapshot (`FreelancerProfileSchema` bleibt
 * unverändert, gespeicherte Ergebnisse bleiben gültig) und wird deshalb an
 * die fertigen Ergebnisse angehängt — wie `attachFreelancerCvAccess`.
 *
 * Sichtbar erst, wenn `PROFILE_REFERENCES_VISIBLE=true` gesetzt ist: Die
 * Notizen wurden nie gezeigt und können Kundennamen enthalten. Der Betreiber
 * schaltet sie frei, nachdem er sie gelesen hat.
 */
export function referencesVisible(): boolean {
  return process.env.PROFILE_REFERENCES_VISIBLE?.trim() === "true";
}

export async function fetchReferenceSummaries(
  admin: SupabaseClient,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (!referencesVisible() || unique.length === 0) return new Map();
  const { data, error } = await admin
    .from("freelancer_profiles")
    .select("id,references_summary")
    .in("id", unique)
    .not("references_summary", "is", null);
  if (error) throw error;
  return new Map(
    (data as Array<{ id: string; references_summary: string | null }>).flatMap((row) =>
      row.references_summary?.trim() ? [[row.id, row.references_summary.trim()] as const] : [],
    ),
  );
}

/** Hängt die Referenznotiz an; scheitert die Abfrage, bleiben die Karten wie sie sind. */
export async function attachProfileExtras<T extends { id: string }>(
  admin: SupabaseClient,
  profiles: readonly T[],
): Promise<Array<T & { referencesSummary?: string | null }>> {
  if (!referencesVisible() || profiles.length === 0) return [...profiles];
  try {
    const references = await fetchReferenceSummaries(
      admin,
      profiles.map((profile) => profile.id),
    );
    return profiles.map((profile) => ({ ...profile, referencesSummary: references.get(profile.id) ?? null }));
  } catch {
    return [...profiles];
  }
}
