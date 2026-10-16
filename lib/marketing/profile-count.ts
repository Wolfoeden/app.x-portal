import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Wie viele echte, freigegebene Profile der Talent Index gerade hat — für
 * „Demo mit 68 echten Profilen“ auf der Startseite und „68 Profile geprüft“
 * in der Demo. Demo-Profile zählen nicht.
 *
 * Wirft nie: Ohne Datenbank steht dort „echte Profile“ ohne Zahl.
 */
export async function activeProfileCount(): Promise<number | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return null;
  try {
    const { count, error } = await createAdminSupabaseClient()
      .from("freelancer_profiles")
      .select("id", { count: "exact", head: true })
      .eq("profile_status", "active")
      .eq("demo_status", "real");
    return error || !count ? null : count;
  } catch {
    return null;
  }
}
