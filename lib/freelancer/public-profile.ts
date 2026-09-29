import "server-only";

import type { FreelancerProfileResult } from "@/components/chat-contract";
import { fetchRealProfilesByIds } from "@/lib/data/freelancers";
import { presentSavedProfile } from "@/lib/presentation/chat";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Ein Profil für die eigene Profilseite.
 *
 * Dieselbe Darstellung wie auf der Merkliste: ohne Bewertung gegen ein
 * Projekt, weil die Seite keines kennt. Nur aktive, echte Profile; ein
 * pausiertes oder archiviertes zeigt die Seite nicht mehr, auch wenn der Link
 * noch in einer Mail steht. Die Kalenderadresse folgt denselben Regeln wie im
 * Suchergebnis (`presentSavedProfile`).
 */
export async function loadPublicProfile(profileId: string): Promise<FreelancerProfileResult | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return null;
  const [profile] = await fetchRealProfilesByIds(createAdminSupabaseClient(), [profileId]);
  if (!profile || profile.profileStatus !== "active") return null;
  return presentSavedProfile(profile);
}
