import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DossierLink, DossierProject } from "@/lib/profile/dossier";
import {
  LINK_KINDS,
  projectPeriod,
  type LinkKind,
  type ProfileLink,
  type ProfileProject,
  type ProjectSource,
} from "@/lib/profile/project-limits";

/**
 * Referenzprojekte und Links aus der Datenbank (Migration
 * 20261006090000_referenzprojekte). Fehlt die Tabelle oder Spalte noch,
 * liefern die Leser leer statt zu scheitern: Karten und Profile zeigen dann
 * schlicht keine Projekte.
 */

type ProjectRow = {
  profile_id: string;
  position: number;
  title: string;
  client_label: string | null;
  industry: string | null;
  project_role: string | null;
  started_on: string | null;
  ended_on: string | null;
  ongoing: boolean;
  technologies: string[] | null;
  outcome: string | null;
  link_url: string | null;
  is_public: boolean;
  source: ProjectSource;
  source_url: string | null;
  verified_at: string | null;
};

const PROJECT_COLUMNS =
  "profile_id,position,title,client_label,industry,project_role,started_on,ended_on,ongoing,technologies,outcome,link_url,is_public,source,source_url,verified_at";

/** Tabelle, Spalte oder Funktion fehlt: die Migration ist noch nicht eingespielt. */
export function isMissingSchema(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "42P01" || code === "42703" || code === "42883" || code === "PGRST202" || code === "PGRST204" || code === "PGRST205";
}

const toMonth = (date: string | null) => (date ? date.slice(0, 7) : null);
const fromMonth = (month: string | null) => (month ? `${month}-01` : null);

function rowToProject(row: ProjectRow): ProfileProject {
  return {
    title: row.title,
    client: row.client_label,
    industry: row.industry,
    role: row.project_role,
    startedOn: toMonth(row.started_on),
    endedOn: toMonth(row.ended_on),
    ongoing: row.ongoing,
    technologies: row.technologies ?? [],
    outcome: row.outcome,
    link: row.link_url,
    isPublic: row.is_public,
    verified: Boolean(row.verified_at),
    source: row.source,
    sourceUrl: row.source_url,
  };
}

/** Projekte je Profil in fester Reihenfolge; `publicOnly` für alles, was Kunden sehen. */
export async function fetchProjects(
  admin: SupabaseClient,
  ids: readonly string[],
  options: { publicOnly: boolean },
): Promise<Map<string, ProfileProject[]>> {
  const unique = [...new Set(ids)];
  const result = new Map<string, ProfileProject[]>();
  if (unique.length === 0) return result;
  let query = admin.from("freelancer_projects").select(PROJECT_COLUMNS).in("profile_id", unique);
  if (options.publicOnly) query = query.eq("is_public", true);
  const { data, error } = await query.order("profile_id").order("position");
  if (error) {
    if (isMissingSchema(error)) return result;
    throw error;
  }
  for (const row of data as ProjectRow[]) {
    const list = result.get(row.profile_id) ?? [];
    list.push(rowToProject(row));
    result.set(row.profile_id, list);
  }
  return result;
}

function isLink(value: unknown): value is ProfileLink {
  const link = value as { kind?: unknown; url?: unknown } | null;
  return (
    typeof link?.url === "string" &&
    link.url.startsWith("https://") &&
    (LINK_KINDS as readonly string[]).includes(String(link.kind))
  );
}

export async function fetchProfileLinks(
  admin: SupabaseClient,
  ids: readonly string[],
): Promise<Map<string, ProfileLink[]>> {
  const unique = [...new Set(ids)];
  const result = new Map<string, ProfileLink[]>();
  if (unique.length === 0) return result;
  const { data, error } = await admin.from("freelancer_profiles").select("id,profile_links").in("id", unique);
  if (error) {
    if (isMissingSchema(error)) return result;
    throw error;
  }
  for (const row of data as Array<{ id: string; profile_links: unknown }>) {
    const links = Array.isArray(row.profile_links) ? row.profile_links.filter(isLink) : [];
    if (links.length) result.set(row.id, links.map((link) => ({ kind: link.kind as LinkKind, url: link.url })));
  }
  return result;
}

/**
 * Ersetzt die Projektliste eines Profils (RPC, ein Zug). Ein Haken
 * „geprüft“ behält Zeitpunkt und Person der ersten Prüfung, solange das
 * Projekt gleich heißt; sonst zählt die Prüfung ab jetzt und gehört
 * `actorId`.
 */
export async function replaceProjects(
  admin: SupabaseClient,
  profileId: string,
  projects: readonly ProfileProject[],
  actorId: string,
): Promise<number> {
  const { data: previous, error: readError } = await admin
    .from("freelancer_projects")
    .select("title,verified_at,verified_by,created_at")
    .eq("profile_id", profileId);
  if (readError) throw readError;
  const known = new Map(
    (previous as Array<{ title: string; verified_at: string | null; verified_by: string | null; created_at: string }>).map((row) => [
      row.title.trim().toLowerCase(),
      row,
    ]),
  );
  const now = new Date().toISOString();
  const payload = projects.map((project) => {
    const before = known.get(project.title.trim().toLowerCase());
    return {
      title: project.title,
      client_label: project.client,
      industry: project.industry,
      project_role: project.role,
      started_on: fromMonth(project.startedOn),
      ended_on: fromMonth(project.endedOn),
      ongoing: project.ongoing,
      technologies: project.technologies,
      outcome: project.outcome,
      link_url: project.link,
      is_public: project.isPublic,
      source: project.source,
      source_url: project.sourceUrl,
      verified_at: project.verified ? (before?.verified_at ?? now) : null,
      // Wer zuerst geprüft hat, bleibt eingetragen, solange die Prüfung gilt.
      verified_by: project.verified ? (before?.verified_at ? before.verified_by : actorId) : null,
      created_at: before?.created_at ?? now,
    };
  });
  const { data, error } = await admin.rpc("replace_freelancer_projects", {
    p_profile_id: profileId,
    p_projects: payload,
  });
  if (error) throw error;
  return typeof data === "number" ? data : payload.length;
}

export async function updateProfileLinks(
  admin: SupabaseClient,
  profileId: string,
  links: readonly ProfileLink[],
): Promise<boolean> {
  const { data, error } = await admin
    .from("freelancer_profiles")
    .update({ profile_links: links })
    .eq("id", profileId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export function toDossierProject(project: ProfileProject): DossierProject {
  return {
    title: project.title,
    client: project.client,
    industry: project.industry,
    role: project.role,
    period: projectPeriod(project),
    technologies: project.technologies,
    outcome: project.outcome,
    link: project.link,
    verified: project.verified,
    source: project.source,
    sourceUrl: project.source === "research" ? project.sourceUrl : null,
  };
}

export function toDossierLinks(links: readonly ProfileLink[]): DossierLink[] {
  return links.map((link) => ({ kind: link.kind, url: link.url }));
}

let tableProbe: { at: number; available: boolean } | null = null;

/** Ob die Migration eingespielt ist; fünf Minuten gemerkt. */
export async function projectsTableAvailable(admin: SupabaseClient, now = Date.now()): Promise<boolean> {
  if (tableProbe && now - tableProbe.at < 5 * 60_000) return tableProbe.available;
  const { error } = await admin.from("freelancer_projects").select("id", { head: true, count: "exact" }).limit(1);
  const available = !error || !isMissingSchema(error);
  tableProbe = { at: now, available };
  return available;
}
