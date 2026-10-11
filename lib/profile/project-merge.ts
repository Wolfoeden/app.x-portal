import type { ProfileProject } from "@/lib/profile/project-limits";
import type { ProjectInput } from "@/lib/profile/project-schema";

/**
 * Was ein Freelancer an seinen Projekten ändern darf.
 *
 * Den Haken „geprüft“ und die Freigabe setzt nur XPORTAL. Ein Freelancer
 * behält beides, solange er das Projekt nicht inhaltlich ändert. Ein neues
 * oder geändertes Projekt wartet auf Freigabe und ist bis dahin für Kunden
 * unsichtbar (Oktober 2026) — sonst stünde online, was niemand gesehen hat.
 * Vorschläge aus der Recherche sieht er nicht; sie bleiben beim Speichern
 * unverändert hinten in der Liste, bis der Betreiber entscheidet.
 */

const normalized = (value: string) => value.trim().toLowerCase();

export function isHiddenProposal(project: ProfileProject): boolean {
  return project.source === "research" && !project.isPublic;
}

/** Was für Kunden zählt; Sichtbarkeit und Herkunft zählen nicht dazu. */
export function sameContent(a: ProfileProject, b: ProfileProject): boolean {
  return (
    normalized(a.title) === normalized(b.title) &&
    (a.client ?? "") === (b.client ?? "") &&
    (a.industry ?? "") === (b.industry ?? "") &&
    (a.role ?? "") === (b.role ?? "") &&
    a.startedOn === b.startedOn &&
    a.endedOn === b.endedOn &&
    a.ongoing === b.ongoing &&
    a.technologies.join("|") === b.technologies.join("|") &&
    (a.outcome ?? "") === (b.outcome ?? "") &&
    (a.link ?? "") === (b.link ?? "")
  );
}

export function mergeOwnerProjects(previous: readonly ProfileProject[], incoming: readonly ProjectInput[]): ProfileProject[] {
  const hidden = previous.filter(isHiddenProposal);
  const known = new Map(previous.filter((project) => !isHiddenProposal(project)).map((project) => [normalized(project.title), project]));
  const merged = incoming.map((input): ProfileProject => {
    const before = known.get(normalized(input.title));
    const candidate: ProfileProject = {
      ...input,
      source: before?.source ?? "freelancer",
      sourceUrl: before?.sourceUrl ?? null,
      verified: false,
      approved: false,
    };
    const unchanged = Boolean(before && sameContent(before, candidate));
    return {
      ...candidate,
      verified: Boolean(before?.verified && unchanged),
      approved: Boolean(before && before.approved !== false && unchanged),
    };
  });
  return [...merged, ...hidden];
}
