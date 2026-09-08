import "server-only";

import type { DemandBrief } from "@/lib/freelancer/outreach";
import { importSourcedCandidates } from "@/lib/freelancer/sourced-candidate-import";
import type { ProjectBrief } from "@/lib/domain/brief";
import type { ExternalFreelancerCandidate } from "@/lib/openai/external-freelancer-search";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { isPaused, readSourcingAutomation } from "./automation";

/**
 * Was ein Auftraggeber gesucht hat, wird zur Einladung an die Gefundenen.
 *
 * Die bezahlte Websuche unter `/api/freelancer-search` ist der stärkste
 * Anlass, den XPORTAL hat: Es sucht nicht das Portal auf Verdacht, sondern ein
 * Unternehmen mit einem konkreten Projekt — und die gefundene Person erfüllt
 * belegbar einen Teil seiner Anforderungen. Genau das gehört in die Nachricht,
 * und genau das ging bisher verloren: acht Suchläufe, dreizehn gefundene
 * Menschen, kein einziger Kandidat.
 *
 * Diese Übernahme läuft **im Anschluss an die Antwort an den Kunden**, nicht
 * in ihr. Sie darf seine Suche weder verlangsamen noch scheitern lassen: Er
 * hat für Treffer bezahlt, nicht für unsere Nachwuchsgewinnung.
 */

/**
 * Der Anlass in der Form, die die Einladung braucht.
 *
 * `matchedRequirements` stammt aus dem Abgleich der Suche mit der
 * Ausschreibung — es ist bereits die Überschneidung zwischen Bedarf und
 * Person und muss nicht noch einmal ausgerechnet werden.
 */
export function demandFromSearch(input: {
  brief: ProjectBrief;
  candidate: ExternalFreelancerCandidate;
}): DemandBrief {
  const { brief, candidate } = input;
  const thema =
    brief.projectTitle?.trim() ||
    (brief.requiredSkills ?? []).slice(0, 2).join(" und ") ||
    "Ihrem Fachgebiet";

  const erfuellt = candidate.matchedRequirements
    .map((wert) => wert.trim())
    .filter(Boolean)
    .slice(0, 5);

  // Was die Ausschreibung sonst noch verlangt, ohne die schon genannten.
  const bekannt = new Set(erfuellt.map((wert) => wert.toLowerCase()));
  const weitere = (brief.requiredSkills ?? [])
    .map((wert) => wert.trim())
    .filter((wert) => wert && !bekannt.has(wert.toLowerCase()))
    .slice(0, 4);

  return {
    headline: thema,
    workMode: brief.workMode === "unknown" ? "unknown" : brief.workMode,
    location: brief.location,
    matchingSkills: erfuellt,
    otherSkills: weitere,
  };
}

export type AbsorbOutcome = {
  /** Falsch, wenn der Schalter aus ist oder die Automatik ruht. */
  ran: boolean;
  created: number;
  skipped: { reason: string; profileUrl: string }[];
  reason?: "switch_off" | "paused" | "no_candidates";
};

/**
 * Legt die Treffer einer Kundensuche als Kandidaten an.
 *
 * Wirft nicht. Der Aufrufer ist eine Kundenroute, die bereits geantwortet hat
 * oder gleich antworten will — ein Fehler hier darf dort nichts auslösen.
 */
export async function absorbSearchCandidates(input: {
  candidates: readonly ExternalFreelancerCandidate[];
  brief: ProjectBrief;
  /** Wer die Suche ausgelöst hat. Steht als Veranlasser am Kandidaten. */
  actorUserId: string;
  /** Übergeht den Schalter — für den Knopf im Adminbereich. */
  force?: boolean;
}): Promise<AbsorbOutcome> {
  if (input.candidates.length === 0) {
    return { ran: false, created: 0, skipped: [], reason: "no_candidates" };
  }

  if (!input.force) {
    const automation = await readSourcingAutomation();
    if (!automation.absorbUserSearches) {
      return { ran: false, created: 0, skipped: [], reason: "switch_off" };
    }
    if (isPaused(automation)) {
      return { ran: false, created: 0, skipped: [], reason: "paused" };
    }
  }

  const ergebnis = await importSourcedCandidates({
    candidates: input.candidates,
    adminId: input.actorUserId,
  });

  // Herkunft und Anlass nachtragen. Getrennt vom Anlegen, weil die Übernahme
  // ein gemeinsamer Weg für beide Spuren ist und ihre Spalten nicht kennen
  // muss.
  const admin = createAdminSupabaseClient();
  for (const kandidat of input.candidates) {
    const demand = demandFromSearch({ brief: input.brief, candidate: kandidat });
    const { error } = await admin
      .from("freelancer_applications")
      .update({
        sourcing_origin: "user_search",
        sourcing_demand: demand,
      })
      .eq("source_profile_url", kandidat.profileUrl)
      .eq("status", "sourced")
      .is("sourcing_origin", null);
    // Ein fehlgeschlagener Nachtrag kostet die konkrete Ansprache, nicht den
    // Kandidaten. Er bleibt bestehen und bekommt den allgemeinen Text.
    if (error) continue;
  }

  return {
    ran: true,
    created: ergebnis.created,
    skipped: ergebnis.skipped.map((wert) => ({
      reason: wert.reason,
      profileUrl: wert.profileUrl,
    })),
  };
}
