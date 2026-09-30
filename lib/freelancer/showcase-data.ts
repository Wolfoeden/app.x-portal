import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchActiveBookableRealProfiles } from "@/lib/data/freelancers";
import {
  EMPTY_AUTOMATION_SHOWCASE,
  selectAutomationShowcase,
  type RegisteredShowcase,
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
 * Kurz gemerkt, weil jeder Klick auf den Shortcut sonst drei Abfragen auslöst.
 * Eine neue Freigabe erscheint damit spätestens nach fünf Minuten.
 */
const CACHE_MS = 5 * 60_000;
let cached: { at: number; value: RegisteredShowcase } | null = null;

export async function loadAutomationShowcase(now = Date.now()): Promise<RegisteredShowcase> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return EMPTY_AUTOMATION_SHOWCASE;
  if (cached && now - cached.at < CACHE_MS) return cached.value;

  const admin = createAdminSupabaseClient();
  const [profiles, registered] = await Promise.all([
    fetchActiveBookableRealProfiles(admin),
    fetchRegisteredProfileIds(admin),
  ]);
  const value = selectAutomationShowcase(profiles, registered);
  cached = { at: now, value };
  return value;
}
