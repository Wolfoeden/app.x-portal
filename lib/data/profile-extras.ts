import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchProfileLinks, fetchProjects } from "@/lib/data/freelancer-projects";
import { contactLinkFlags, type ContactLinkFlags } from "@/lib/profile/contact-links";
import {
  pickHighlight,
  projectTeaser,
  type ProfileLink,
  type ProfileProject,
  type ProjectTeaser,
} from "@/lib/profile/project-limits";

/**
 * Was eine Profilkarte zusätzlich zum gespeicherten Abgleich zeigt, live aus
 * der Datenbank: das Referenzprojekt und die Referenznotiz des Betreibers.
 *
 * Beides steht nicht im Match-Snapshot (`FreelancerProfileSchema` bleibt
 * unverändert, gespeicherte Ergebnisse bleiben gültig) und wird deshalb an
 * die fertigen Ergebnisse angehängt — wie `attachFreelancerCvAccess`.
 *
 * Die Notiz ist erst sichtbar, wenn `PROFILE_REFERENCES_VISIBLE=true` gesetzt
 * ist: Sie wurde nie gezeigt und kann Kundennamen enthalten. Projekte sind
 * öffentlich, sobald sie es in der Datenbank sind (`is_public`).
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

export type CardExtras = { referencesSummary?: string | null; highlight?: ProjectTeaser | null; projectCount?: number };

export function cardExtrasFor(
  id: string,
  references: ReadonlyMap<string, string>,
  projects: ReadonlyMap<string, readonly ProfileProject[]>,
): CardExtras {
  const list = projects.get(id) ?? [];
  const highlight = pickHighlight(list);
  return {
    ...(references.size ? { referencesSummary: references.get(id) ?? null } : {}),
    ...(list.length ? { highlight: highlight ? projectTeaser(highlight) : null, projectCount: list.length } : {}),
  };
}

/**
 * Hängt Projekt, Notiz und die Kurzlink-Arten an; scheitert eine Abfrage,
 * fehlt nur ihr Teil. `contactLinks` sagt nur, ob LinkedIn oder GitHub
 * hinterlegt sind — die Adressen öffnet allein `/api/freelancers/<id>/link`.
 */
export async function attachProfileExtras<T extends { id: string }>(
  admin: SupabaseClient,
  profiles: readonly T[],
): Promise<Array<T & CardExtras & { contactLinks?: ContactLinkFlags }>> {
  if (profiles.length === 0) return [...profiles];
  const ids = profiles.map((profile) => profile.id);
  const [references, projects, links] = await Promise.all([
    fetchReferenceSummaries(admin, ids).catch(() => new Map<string, string>()),
    fetchProjects(admin, ids, { publicOnly: true }).catch(() => new Map<string, ProfileProject[]>()),
    fetchProfileLinks(admin, ids).catch(() => null as Map<string, ProfileLink[]> | null),
  ]);
  return profiles.map((profile) => ({
    ...profile,
    ...cardExtrasFor(profile.id, references, projects),
    ...(links ? { contactLinks: contactLinkFlags(links.get(profile.id) ?? []) } : {}),
  }));
}
