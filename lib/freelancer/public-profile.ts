import "server-only";

import type { FreelancerProfileResult } from "@/components/chat-contract";
import { fetchRealProfilesByIds } from "@/lib/data/freelancers";
import { fetchProfileLinks, fetchProjects, toDossierLinks, toDossierProject } from "@/lib/data/freelancer-projects";
import { cardExtrasFor, fetchReferenceSummaries } from "@/lib/data/profile-extras";
import { isContactLinkKind } from "@/lib/profile/contact-links";
import type { ProfileLink, ProfileProject } from "@/lib/profile/project-limits";
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
  // Notiz, Projekte und Links sind Zusätze: Fehlt einer, bleibt das Profil vollständig.
  const [references, projects, links] = await Promise.all([
    fetchReferenceSummaries(admin, [profile.id]).catch(() => new Map<string, string>()),
    fetchProjects(admin, [profile.id], { publicOnly: true }).catch(() => new Map<string, ProfileProject[]>()),
    fetchProfileLinks(admin, [profile.id]).catch(() => new Map<string, ProfileLink[]>()),
  ]);
  const placement = placementRequestsEnabled();
  // Im Vermittlungsmodell sind LinkedIn und GitHub ein direkter Weg zum
  // Freelancer: Sie öffnen sich über die Kurzlinks im Suchergebnis, mit Abo.
  // Auf der öffentlichen Seite stünden sie an der Abo-Grenze vorbei.
  const publicLinks = (links.get(profile.id) ?? []).filter((link) => !placement || !isContactLinkKind(link.kind));
  const dossier = buildProfileDossier(
    profile,
    {
      avatarUrl: presented.avatarUrl ?? null,
      field: presented.field ?? null,
      rate: presented.rate,
      referencesSummary: references.get(profile.id) ?? null,
      projects: (projects.get(profile.id) ?? []).map(toDossierProject),
      links: toDossierLinks(publicLinks),
    },
    { placement },
  );
  return { profile: { ...presented, ...cardExtrasFor(profile.id, references, projects) }, dossier };
}

/** Nur die Karte, für Stellen, die keine Detailansicht brauchen. */
export async function loadPublicProfile(profileId: string): Promise<FreelancerProfileResult | null> {
  return (await loadPublicProfileView(profileId))?.profile ?? null;
}
