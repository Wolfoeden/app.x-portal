import "server-only";

import { profileField } from "@/lib/profile/field";
import { PROFILE_FIELD_LABELS, type ProfileField } from "@/lib/profile/identity";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Die Zahlen der Startseite. Wo andere Anbieter Kundenlogos zeigen, zeigt
 * XPORTAL, was tatsächlich im Bestand ist: freigegebene Profile je
 * Fachgebiet und wie viele Projektbeschreibungen schon analysiert wurden.
 * Nur echte, aktive Profile; Demo-Profile zählen nicht.
 *
 * Gebiete mit weniger als {@link MIN_FIELD_PROFILES} Profilen bleiben weg:
 * Eine Kachel „SAP · 2 Profile“ verspricht einen Bestand, den es nicht gibt.
 */

export const MIN_FIELD_PROFILES = 3;
const MAX_FIELDS = 6;

export type LandingField = { field: ProfileField; label: string; count: number };
export type LandingStats = { profiles: number; projects: number; fields: readonly LandingField[] };

type ProfileRow = { role_title: string | null; skill_tags: string[] | null };

export function summarizeLandingStats(rows: readonly ProfileRow[], projects: number): LandingStats {
  const counts = new Map<ProfileField, number>();
  for (const row of rows) {
    const field = profileField(row.role_title ?? "", row.skill_tags ?? []) ?? "other";
    counts.set(field, (counts.get(field) ?? 0) + 1);
  }
  const fields = [...counts]
    .filter(([field, count]) => field !== "other" && count >= MIN_FIELD_PROFILES)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_FIELDS)
    .map(([field, count]) => ({ field, label: PROFILE_FIELD_LABELS[field], count }));
  return { profiles: rows.length, projects, fields };
}

/** Wirft nie: Ohne Datenbank zeigt die Seite ihre Inhalte ohne Zahlen. */
export async function landingStats(): Promise<LandingStats | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return null;
  try {
    const admin = createAdminSupabaseClient();
    const [profiles, projects] = await Promise.all([
      admin
        .from("freelancer_profiles")
        .select("role_title,skill_tags")
        .eq("profile_status", "active")
        .eq("demo_status", "real")
        .limit(2000),
      admin.from("projects").select("id", { count: "exact", head: true }),
    ]);
    if (profiles.error || projects.error || !profiles.data?.length) return null;
    return summarizeLandingStats(profiles.data as ProfileRow[], projects.count ?? 0);
  } catch {
    return null;
  }
}
