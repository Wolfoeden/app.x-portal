import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { FreelancerProfileSchema, ShortlistMatchSchema, type FreelancerProfile } from "@/lib/domain";

/**
 * Wurde dieses Profil dem Konto in diesem Projekt gezeigt?
 *
 * Empfohlene Profile stehen in `matches`. Teiltreffer nicht: Sie liegen nur
 * im Snapshot der Shortlist (`partial_matches_snapshot`). Bis zum 06.10.2026
 * prüfte die Anfrage nur `matches` und wies jede Anfrage an einen Teiltreffer
 * mit 409 ab — bei einem Drittel aller Suchen, die nur Teiltreffer finden.
 *
 * `matchId` ist bei einem Teiltreffer leer; `intro_bookings.match_id` darf
 * das sein.
 */
export type ShownProfile = { matchId: string | null; profile: FreelancerProfile };

type Admin = Pick<SupabaseClient, "from">;

/** Der Teiltreffer zu `profileId` aus einem gespeicherten Snapshot, sonst null. */
export function partialProfileFromSnapshot(snapshot: unknown, profileId: string): FreelancerProfile | null {
  if (!Array.isArray(snapshot)) return null;
  for (const entry of snapshot) {
    const parsed = ShortlistMatchSchema.safeParse(entry);
    if (
      parsed.success &&
      parsed.data.recommendationRole === "partial" &&
      parsed.data.profile.demoStatus === "real" &&
      parsed.data.profile.id === profileId
    ) {
      return parsed.data.profile;
    }
  }
  return null;
}

export async function findShownProfile(
  admin: Admin,
  input: { projectId: string; ownerUserId: string; profileId: string },
): Promise<ShownProfile | null> {
  const { data: match, error: matchError } = await admin
    .from("matches")
    .select("id,profile_snapshot")
    .eq("project_id", input.projectId)
    .eq("owner_user_id", input.ownerUserId)
    .eq("freelancer_profile_id", input.profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (matchError) throw matchError;
  if (match) {
    const row = match as { id: string; profile_snapshot: unknown };
    return { matchId: row.id, profile: FreelancerProfileSchema.parse(row.profile_snapshot) };
  }

  // Nur die neueste Shortlist: Ein Teiltreffer aus einer überholten Suche
  // ist nicht mehr das, was das Konto gerade sieht.
  const { data: shortlist, error: shortlistError } = await admin
    .from("shortlists")
    .select("partial_matches_snapshot")
    .eq("project_id", input.projectId)
    .eq("owner_user_id", input.ownerUserId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (shortlistError) throw shortlistError;
  const profile = partialProfileFromSnapshot(
    (shortlist as { partial_matches_snapshot?: unknown } | null)?.partial_matches_snapshot,
    input.profileId,
  );
  return profile ? { matchId: null, profile } : null;
}
