import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchActiveBookableRealProfiles } from "@/lib/data/freelancers";
import { fetchReferenceSummaries } from "@/lib/data/profile-extras";
import type { FreelancerProfile } from "@/lib/domain";
import {
  emptyShowcase,
  selectShowcase,
  type RegisteredShowcase,
  type ShowcaseTheme,
} from "@/lib/freelancer/showcase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Profile, hinter denen eine eigene Anmeldung steht.
 *
 * Zwei Wege führen dahin, und beide setzen voraus, dass die Person selbst
 * gehandelt hat: Sie hat ein Konto, das dem Profil gehört (`owner_user_id`),
 * oder das Profil ist aus ihrer freigegebenen Bewerbung entstanden — auch wenn
 * sie ursprünglich recherchiert und dann eingeladen wurde, denn eine Bewerbung
 * gibt es erst nach ihrer Zustimmung. Was ein Betreiber ohne Bewerbung
 * angelegt hat, zählt nicht.
 */
export async function fetchRegisteredProfileIds(
  admin: SupabaseClient,
): Promise<Set<string>> {
  const [owned, approved] = await Promise.all([
    admin.from("freelancer_profiles").select("id").not("owner_user_id", "is", null),
    admin
      .from("freelancer_applications")
      .select("published_profile_id")
      .eq("status", "approved")
      .not("published_profile_id", "is", null),
  ]);
  if (owned.error) throw owned.error;
  if (approved.error) throw approved.error;

  return new Set([
    ...(owned.data as Array<{ id: string }>).map((row) => row.id),
    ...(approved.data as Array<{ published_profile_id: string | null }>).flatMap((row) =>
      row.published_profile_id ? [row.published_profile_id] : [],
    ),
  ]);
}

/**
 * Kurz gemerkt, weil jeder Klick auf einen Shortcut sonst zwei Abfragen
 * auslöst. Gemerkt werden die Profile, nicht die Auswahl: Sie gilt für alle
 * Rollen, und ob eine Verfügbarkeitsangabe noch frisch ist, hängt vom
 * Zeitpunkt des Aufrufs ab. Eine neue Freigabe erscheint spätestens nach fünf
 * Minuten.
 */
const CACHE_MS = 5 * 60_000;
let cached: {
  at: number;
  profiles: FreelancerProfile[];
  registered: Set<string>;
  references: Map<string, string>;
} | null = null;

export async function loadShowcase(theme: ShowcaseTheme, now = Date.now()): Promise<RegisteredShowcase> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return emptyShowcase(theme);
  if (!cached || now - cached.at >= CACHE_MS) {
    const admin = createAdminSupabaseClient();
    const [profiles, registered] = await Promise.all([
      fetchActiveBookableRealProfiles(admin),
      fetchRegisteredProfileIds(admin),
    ]);
    // Die Notizen sind ein Zusatz: Scheitert die Abfrage, kommt die Liste ohne.
    const references = await fetchReferenceSummaries(admin, [...registered]).catch(() => new Map<string, string>());
    cached = { at: now, profiles, registered, references };
  }
  const showcase = selectShowcase(theme, cached.profiles, cached.registered, new Date(now));
  const references = cached.references;
  if (references.size === 0) return showcase;
  return {
    ...showcase,
    profiles: showcase.profiles.map((profile) => ({ ...profile, referencesSummary: references.get(profile.id) ?? null })),
  };
}
