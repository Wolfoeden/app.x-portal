import "server-only";

import type { FreelancerProfileResult } from "@/components/chat-contract";
import { fetchRealProfilesByIds } from "@/lib/data/freelancers";
import { fetchReferenceSummaries } from "@/lib/data/profile-extras";
import { placementRequestsEnabled } from "@/lib/placement/config";
import { presentSavedProfile } from "@/lib/presentation/chat";
import { buildProfileDossier, type ProfileDossier } from "@/lib/profile/dossier";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type PublicProfileView = { profile: FreelancerProfileResult; dossier: ProfileDossier };

/**
 * Ein Profil für die eigene Profilseite und das Seitenpanel im Chat.
 *
 * Dieselbe Darstellung wie auf der Merkliste: ohne Bewertung gegen ein
 * Projekt, weil weder Seite noch Panel eines kennen. Nur aktive, echte
 * Profile; ein pausiertes oder archiviertes zeigt die Seite nicht mehr, auch
 * wenn der Link noch in einer Mail steht. Die Kalenderadresse folgt denselben
 * Regeln wie im Suchergebnis (`presentSavedProfile`).
 */
export async function loadPublicProfileView(profileId: string): Promise<PublicProfileView | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return null;
  const admin = createAdminSupabaseClient();
  const [profile] = await fetchRealProfilesByIds(admin, [profileId]);
  if (!profile || profile.profileStatus !== "active") return null;
  const presented = presentSavedProfile(profile);
  // Die Referenznotiz ist ein Zusatz: Fehlt sie, bleibt das Profil vollständig.
  const references = await fetchReferenceSummaries(admin, [profile.id]).catch(() => new Map<string, string>());
  const dossier = buildProfileDossier(
    profile,
    {
      avatarUrl: presented.avatarUrl ?? null,
      field: presented.field ?? null,
      rate: presented.rate,
      referencesSummary: references.get(profile.id) ?? null,
    },
    { placement: placementRequestsEnabled() },
  );
  return { profile: { ...presented, referencesSummary: dossier.referencesSummary }, dossier };
}

/** Nur die Karte, für Stellen, die keine Detailansicht brauchen. */
export async function loadPublicProfile(profileId: string): Promise<FreelancerProfileResult | null> {
  return (await loadPublicProfileView(profileId))?.profile ?? null;
}
