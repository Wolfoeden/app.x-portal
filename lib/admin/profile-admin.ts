import "server-only";

import { writeAuditEvent } from "@/lib/audit/write";
import { fetchRealProfilesByIds } from "@/lib/data/freelancers";
import {
  fetchProfileLinks,
  fetchProjects,
  isMissingSchema,
  replaceProjects,
  toDossierLinks,
  toDossierProject,
  updateProfileLinks,
} from "@/lib/data/freelancer-projects";
import type { FreelancerProfile } from "@/lib/domain";
import { profileStrength, type ProfileStrength } from "@/lib/freelancer/profile-strength";
import { placementRequestsEnabled } from "@/lib/placement/config";
import { presentSavedProfile } from "@/lib/presentation/chat";
import { buildProfileDossier, type ProfileDossier } from "@/lib/profile/dossier";
import type { ProfileLink, ProfileProject } from "@/lib/profile/project-limits";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Pflege veröffentlichter Profile durch den Betreiber: Projekte, Links,
 * Referenznotiz, Sichtbarkeit. Die Liste steht nach Profilstärke sortiert,
 * die schwächsten zuerst — dort lohnt die Arbeit am meisten.
 */

export type AdminProfileStatus = "active" | "paused";

type MetaRow = {
  id: string;
  owner_user_id: string | null;
  seeking: "projects" | "employment" | "both" | null;
  references_summary: string | null;
  profile_status: string;
};

export type AdminProfileListRow = {
  id: string;
  displayName: string;
  role: string;
  selfRegistered: boolean;
  hasPhoto: boolean;
  hasReferences: boolean;
  links: number;
  projects: number;
  verifiedProjects: number;
  proposals: number;
  strength: ProfileStrength;
};

function industriesOf(profile: FreelancerProfile): number {
  return profile.contextEvidence.filter((fact) => fact.value.startsWith("Industry:")).length;
}

function strengthOf(profile: FreelancerProfile, seeking: MetaRow["seeking"], projects: readonly ProfileProject[], now: Date) {
  const visible = projects.filter((project) => project.isPublic);
  return profileStrength({
    hasPhoto: Boolean(profile.avatarUrl),
    summaryLength: profile.experienceSummary.value.trim().length,
    projects: visible.map((project) => ({ hasOutcome: Boolean(project.outcome) })),
    hasRate: Boolean(profile.dayRate ?? profile.hourlyRate),
    seeking: seeking ?? "projects",
    availabilityUpdatedAt: profile.availability.checkedAt,
    skillsCount: profile.skillTags.length,
    industriesCount: industriesOf(profile),
    now,
  });
}

async function loadMeta(ids: readonly string[]): Promise<Map<string, MetaRow>> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("freelancer_profiles")
    .select("id,owner_user_id,seeking,references_summary,profile_status")
    .in("id", [...ids]);
  if (error) throw error;
  return new Map((data as MetaRow[]).map((row) => [row.id, row]));
}

export async function listAdminProfiles(status: AdminProfileStatus, now = new Date()) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("freelancer_profiles")
    .select("id,profile_status")
    .eq("demo_status", "real")
    .in("profile_status", ["active", "paused"]);
  if (error) throw error;
  const all = data as Array<{ id: string; profile_status: string }>;
  const counts = {
    active: all.filter((row) => row.profile_status === "active").length,
    paused: all.filter((row) => row.profile_status === "paused").length,
  };
  const ids = all.filter((row) => row.profile_status === status).map((row) => row.id);

  const [profiles, meta, projects, links, projectsProbe] = await Promise.all([
    fetchRealProfilesByIds(admin, ids),
    loadMeta(ids),
    fetchProjects(admin, ids, { publicOnly: false }),
    fetchProfileLinks(admin, ids),
    admin.from("freelancer_projects").select("id", { head: true, count: "exact" }).limit(1),
  ]);
  const projectsAvailable = !projectsProbe.error || !isMissingSchema(projectsProbe.error);

  const rows: AdminProfileListRow[] = profiles.map((profile) => {
    const list = projects.get(profile.id) ?? [];
    const row = meta.get(profile.id);
    return {
      id: profile.id,
      displayName: profile.displayName,
      role: profile.role,
      selfRegistered: Boolean(row?.owner_user_id),
      hasPhoto: Boolean(profile.avatarUrl),
      hasReferences: Boolean(row?.references_summary?.trim()),
      links: links.get(profile.id)?.length ?? 0,
      projects: list.filter((project) => project.isPublic).length,
      verifiedProjects: list.filter((project) => project.isPublic && project.verified).length,
      proposals: list.filter((project) => !project.isPublic).length,
      strength: strengthOf(profile, row?.seeking ?? null, list, now),
    };
  });
  rows.sort((a, b) => a.strength.done - b.strength.done || a.displayName.localeCompare(b.displayName, "de-DE"));
  return { rows, counts, projectsAvailable };
}

export type AdminProfileDetail = {
  id: string;
  status: string;
  selfRegistered: boolean;
  referencesSummary: string | null;
  projects: ProfileProject[];
  links: ProfileLink[];
  strength: ProfileStrength;
  /** So sehen Kunden das Profil: nur öffentliche Projekte. */
  dossier: ProfileDossier;
  projectsAvailable: boolean;
};

export async function loadAdminProfile(id: string, now = new Date()): Promise<AdminProfileDetail | null> {
  const admin = createAdminSupabaseClient();
  const [[profile], meta] = await Promise.all([fetchRealProfilesByIds(admin, [id]), loadMeta([id])]);
  const row = meta.get(id);
  if (!profile || !row) return null;

  let projectsAvailable = true;
  const [projects, links] = await Promise.all([
    fetchProjects(admin, [id], { publicOnly: false }).then((map) => map.get(id) ?? []),
    fetchProfileLinks(admin, [id]).then((map) => map.get(id) ?? []),
  ]);
  const probe = await admin.from("freelancer_projects").select("id", { head: true, count: "exact" }).eq("profile_id", id);
  if (probe.error && isMissingSchema(probe.error)) projectsAvailable = false;

  const presented = presentSavedProfile(profile);
  const dossier = buildProfileDossier(
    profile,
    {
      avatarUrl: presented.avatarUrl ?? null,
      field: presented.field ?? null,
      rate: presented.rate,
      referencesSummary: row.references_summary,
      projects: projects.filter((project) => project.isPublic).map(toDossierProject),
      links: toDossierLinks(links),
    },
    { placement: placementRequestsEnabled() },
  );

  return {
    id,
    status: row.profile_status,
    selfRegistered: Boolean(row.owner_user_id),
    referencesSummary: row.references_summary,
    projects,
    links,
    strength: strengthOf(profile, row.seeking, projects, now),
    dossier,
    projectsAvailable,
  };
}

export async function saveAdminProjects(id: string, projects: readonly ProfileProject[], actorId: string): Promise<number> {
  const admin = createAdminSupabaseClient();
  const count = await replaceProjects(admin, id, projects, actorId);
  await writeAuditEvent({
    actorUserId: actorId,
    action: "freelancer_projects_admin_replaced",
    targetType: "freelancer_profile",
    targetId: id,
    outcome: "success",
    metadata: {
      projects: projects.length,
      public: projects.filter((project) => project.isPublic).length,
      verified: projects.filter((project) => project.verified).length,
    },
    required: true,
  });
  return count;
}

export type AdminProfilePatch = {
  referencesSummary?: string | null;
  links?: ProfileLink[];
  status?: AdminProfileStatus;
};

export async function updateAdminProfile(id: string, patch: AdminProfilePatch, actorId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const fields: Record<string, unknown> = {};
  if (patch.referencesSummary !== undefined) fields.references_summary = patch.referencesSummary;
  if (patch.status !== undefined) fields.profile_status = patch.status;
  if (Object.keys(fields).length) {
    const { data, error } = await admin
      .from("freelancer_profiles")
      .update(fields)
      .eq("id", id)
      .eq("demo_status", "real")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return false;
  }
  if (patch.links !== undefined && !(await updateProfileLinks(admin, id, patch.links))) return false;
  await writeAuditEvent({
    actorUserId: actorId,
    action: "freelancer_profile_admin_updated",
    targetType: "freelancer_profile",
    targetId: id,
    outcome: "success",
    metadata: {
      fields: Object.keys(patch).join(","),
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.links ? { links: patch.links.length } : {}),
    },
    required: true,
  });
  return true;
}
