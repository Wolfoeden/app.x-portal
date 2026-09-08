import "server-only";

import { fetchActiveBookableRealProfiles } from "@/lib/data/freelancers";
import { buildShortlist, ProjectBriefSchema } from "@/lib/domain";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Archivierte Leads noch einmal gegen den heutigen Katalog halten.
 *
 * Ein Lead wird archiviert, wenn der Abgleich niemanden fand — nicht weil die
 * Anfrage schlecht war, sondern weil XPORTAL zu dem Zeitpunkt niemanden hatte.
 * Genau das ändert sich, sobald sich über die Beschaffung ein Freelancer
 * einträgt: Derselbe Recruiter, der vor drei Wochen nichts bekam, ist jetzt
 * bedienbar — und er ist der beste Neukunde, den es gibt, weil er seinen
 * Bedarf schon bewiesen hat.
 *
 * **Der Neuabgleich kostet nichts.** Der Brief zu jedem Lead liegt bereits in
 * `shortlists.brief_snapshot`; er wurde beim ersten Durchgang vom Modell
 * gelesen und gespeichert. Hier wird nur `buildShortlist()` erneut gerechnet,
 * und das ist reine Arithmetik. Ein Lauf über alle Archivleads ist damit so
 * billig wie eine Abfrage.
 *
 * Wiederbelebt wird, indem der Lead auf `new` zurückgesetzt wird. Den Entwurf
 * schreibt danach der gewöhnliche Vorbereitungslauf — mit seinen Limits,
 * seinem Zeitfenster und seinen Textregeln. Diese Maschinerie hier zu
 * verdoppeln wäre der sichere Weg, sie auseinanderlaufen zu lassen.
 */

export type RematchOutcome = {
  /** Geprüfte Archivleads. */
  examined: number;
  /** Davon ohne gespeicherten Brief — nicht prüfbar. */
  withoutBrief: number;
  /** Davon jetzt mit Treffer, also zurück in die Warteschlange. */
  revived: number;
  /** Davon weiterhin ohne Treffer. */
  stillEmpty: number;
  /** Was wiederbelebt wurde, für die Rückmeldung im Adminbereich. */
  leads: {
    leadId: number;
    company: string | null;
    matchCount: number;
    /** Die Profile, die den Ausschlag gaben. */
    matched: string[];
  }[];
};

type ArchivLead = {
  id: number;
  company: string | null;
  recipient_email: string;
  stellenanzeige: string;
};

/**
 * Ein Lead, dessen Ausschreibungstext die Aufbewahrungsfrist überlebt hat,
 * trägt statt seines Textes einen Vermerk. Er wird nicht neu abgeglichen:
 * Der Bedarf ist vier Wochen alt und in dieser Branche erledigt.
 */
const ENTFERNTER_TEXT = "[Ausschreibung nach";

export async function runLeadRematchPass(
  options: { limit?: number; dryRun?: boolean } = {},
): Promise<RematchOutcome> {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 1_000);
  const admin = createAdminSupabaseClient();

  const ergebnis: RematchOutcome = {
    examined: 0,
    withoutBrief: 0,
    revived: 0,
    stillEmpty: 0,
    leads: [],
  };

  const { data: archiv, error } = await admin
    .from("leadgen_queue")
    .select("id, company, recipient_email, stellenanzeige")
    .eq("status", "dismissed")
    .not("archived_at", "is", null)
    // Wer schon angeschrieben wurde, wird nicht ein zweites Mal angeschrieben.
    .is("last_contacted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const leads = ((archiv ?? []) as ArchivLead[]).filter(
    (lead) => !lead.stellenanzeige.startsWith(ENTFERNTER_TEXT),
  );
  if (leads.length === 0) return ergebnis;

  // Die Briefe in einem Zug holen: bei zweihundert Leads sonst zweihundert
  // Abfragen.
  const { data: briefe, error: briefFehler } = await admin
    .from("shortlists")
    .select("lead_id, brief_snapshot, created_at")
    .in(
      "lead_id",
      leads.map((lead) => lead.id),
    )
    .order("created_at", { ascending: false });
  if (briefFehler) throw briefFehler;

  // Je Lead der jüngste Brief. Die Liste kommt absteigend, der erste gewinnt.
  const briefJeLead = new Map<number, unknown>();
  for (const zeile of briefe ?? []) {
    const wert = zeile as { lead_id: number | null; brief_snapshot: unknown };
    if (wert.lead_id === null || briefJeLead.has(wert.lead_id)) continue;
    briefJeLead.set(wert.lead_id, wert.brief_snapshot);
  }

  const profile = await fetchActiveBookableRealProfiles(admin);

  for (const lead of leads) {
    ergebnis.examined += 1;

    const roh = briefJeLead.get(lead.id);
    const brief = ProjectBriefSchema.safeParse(roh);
    if (!brief.success) {
      // Ohne gespeicherten Brief bliebe nur, den Text erneut vom Modell lesen
      // zu lassen. Das kostet je Lead Geld und ist den Aufwand für ein
      // Archivstück nicht wert — der reguläre Lauf holt es beim nächsten
      // Import ohnehin.
      ergebnis.withoutBrief += 1;
      continue;
    }

    const shortlist = buildShortlist(brief.data, profile);
    if (shortlist.status !== "ranked" || shortlist.matches.length === 0) {
      ergebnis.stillEmpty += 1;
      continue;
    }

    ergebnis.revived += 1;
    ergebnis.leads.push({
      leadId: lead.id,
      company: lead.company,
      matchCount: shortlist.matches.length,
      matched: shortlist.matches
        .slice(0, 3)
        .map((treffer) => treffer.profile.displayName),
    });

    if (!options.dryRun) {
      // Zurück in die Warteschlange. Den Entwurf schreibt der gewöhnliche
      // Vorbereitungslauf — samt Tageslimit, Zeitfenster und Textprüfung.
      const { error: updateFehler } = await admin
        .from("leadgen_queue")
        .update({
          status: "new",
          archived_at: null,
          notes: `Neu abgeglichen: ${shortlist.matches.length} Treffer im aktuellen Katalog.`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id);
      if (updateFehler) throw updateFehler;
    }
  }

  return ergebnis;
}
