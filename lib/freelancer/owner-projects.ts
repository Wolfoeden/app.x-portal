import "server-only";

import { writeAuditEvent } from "@/lib/audit/write";
import { fetchProjects, replaceProjects } from "@/lib/data/freelancer-projects";
import { MAX_PROJECTS, type ProfileProject } from "@/lib/profile/project-limits";
import { isHiddenProposal, mergeOwnerProjects } from "@/lib/profile/project-merge";
import type { ProjectInput } from "@/lib/profile/project-schema";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/** Mehr Projekte, als zusammen mit offenen Vorschlägen Platz haben. */
export class ProjectLimitError extends Error {}

/**
 * Ein Freelancer speichert seine Referenzprojekte selbst. Nur das eigene
 * Profil (`owner_user_id`), „geprüft“ nach den Regeln aus
 * `mergeOwnerProjects`. Liefert, was der Freelancer danach sieht; `null`
 * ohne eigenes Profil.
 */
export async function saveOwnedProjects(userId: string, inputs: readonly ProjectInput[]): Promise<ProfileProject[] | null> {
  const admin = createAdminSupabaseClient();
  const { data: profile, error } = await admin.from("freelancer_profiles").select("id").eq("owner_user_id", userId).maybeSingle();
  if (error) throw error;
  if (!profile) return null;
  const id = (profile as { id: string }).id;

  const previous = (await fetchProjects(admin, [id], { publicOnly: false })).get(id) ?? [];
  const merged = mergeOwnerProjects(previous, inputs);
  if (merged.length > MAX_PROJECTS) throw new ProjectLimitError();
  await replaceProjects(admin, id, merged, userId);
  await writeAuditEvent({
    actorUserId: userId,
    action: "freelancer_projects_updated",
    targetType: "freelancer_profile",
    targetId: id,
    outcome: "success",
    metadata: { projects: inputs.length, stillVerified: merged.filter((project) => project.verified).length },
    required: true,
  });
  return merged.filter((project) => !isHiddenProposal(project));
}
