import "server-only";

import { createHash } from "node:crypto";

import { MATCHING_RULE_VERSION, type ProjectBrief, type Shortlist } from "@/lib/domain";
import { pseudonymizeSubject } from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Eine Ausschreibung, für die der Katalog niemanden führt, ist Nachfrage.
 *
 * Die Nachfrageanalyse zählt bisher nur, wonach angemeldete Nutzer im Chat
 * gesucht haben. Das ist die Nachfrage, die wir sehen, weil sie zu uns kam —
 * und sie ist nach oben verzerrt: Wer im Portal sucht, hat vorher irgendwo
 * gelesen, dass es sich lohnt. Eine Ausschreibung auf einer Projektbörse ist
 * unbeeinflusst davon, und wenn wir dazu niemanden haben, ist das die
 * ehrlichste Auskunft darüber, welche Profile fehlen.
 *
 * Geschrieben wird in dieselbe Tabelle, aus der der Bericht ohnehin liest.
 * Eine zweite Tabelle wären zwei Aggregationen und irgendwann zwei Wahrheiten
 * darüber, wonach gesucht wird.
 */

/**
 * Die Kennung, unter der die Auswertung Suchende zählt.
 *
 * Nicht die Adresse selbst: Sie stünde damit ein zweites Mal in der Datenbank,
 * an einer Stelle, die nur Statistik betreibt. Ein HMAC über die Adresse
 * bleibt über Läufe hinweg gleich — dieselbe Agentur, die vierzehnmal
 * ausschreibt, bleibt ein Akteur — und lässt sich nicht zurückrechnen.
 */
export function demandActorForLead(recipientEmail: string): string {
  return pseudonymizeSubject(`lead:${recipientEmail.trim().toLowerCase()}`);
}

/**
 * Die Fassung des Katalogs, gegen den abgeglichen wurde.
 *
 * Ohne sie ließe sich ein altes Ergebnis nicht einordnen: „kein Treffer" heißt
 * etwas anderes, wenn der Katalog zu dem Zeitpunkt zwölf Profile hatte, als
 * wenn er sechshundert hatte.
 */
export function catalogVersion(
  profiles: readonly { id: string; dataVersion: string }[],
): string {
  return createHash("sha256")
    .update(
      profiles
        .map((profile) => `${profile.id}:${profile.dataVersion}`)
        .sort()
        .join("|"),
    )
    .digest("hex");
}

export type DemandRecordResult =
  | { recorded: true }
  /** Für diesen Lead steht schon eine Zeile — ein zweiter Lauf zählt nicht doppelt. */
  | { recorded: false; reason: "already_recorded" };

export async function recordLeadDemand(input: {
  leadId: number;
  recipientEmail: string;
  brief: ProjectBrief;
  shortlist: Shortlist;
  profileCatalogVersion: string;
}): Promise<DemandRecordResult> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("shortlists").insert({
    source: "lead",
    lead_id: input.leadId,
    project_id: null,
    owner_user_id: null,
    demand_actor: demandActorForLead(input.recipientEmail),
    matching_rule_version: MATCHING_RULE_VERSION,
    brief_snapshot: input.brief,
    result_count: input.shortlist.matches.length,
    profile_catalog_version: input.profileCatalogVersion,
    result_status: input.shortlist.status,
    decision_snapshot: input.shortlist.decisionSnapshot,
  });

  // 23505 ist die eindeutige Verletzung von shortlists_one_per_lead_idx. Sie
  // ist kein Fehler, sondern die Zusage, dass zwei gleichzeitige Läufe
  // denselben Lead nicht zweimal als Nachfrage zählen.
  if (error?.code === "23505") {
    return { recorded: false, reason: "already_recorded" };
  }
  if (error) throw error;
  return { recorded: true };
}
