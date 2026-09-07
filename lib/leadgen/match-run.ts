import "server-only";

import {
  buildShortlist,
  parseFallbackBrief,
  type Shortlist,
} from "@/lib/domain";
import { fetchActiveBookableRealProfiles } from "@/lib/data/freelancers";
import { deliverEmail, publicMailOrigin } from "@/lib/email/deliver";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { catalogVersion, recordLeadDemand } from "@/lib/leadgen/demand";
import {
  claimOutreach,
  recordOutreachSent,
  releaseOutreachClaim,
  updateLead,
} from "@/lib/leadgen/leads-data";
import { LEAD_BULK_SEND_LIMIT, leadHeadline, leadSourceUrl } from "@/lib/leadgen/limits";
import {
  buildMatchEmail,
  buildMatchSubject,
  leadSearchUrl,
  type MatchFacts,
} from "@/lib/leadgen/outreach-message";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Der Tageslauf: jeden offenen Lead gegen den Katalog halten und danach
 * entscheiden, was mit ihm geschieht.
 *
 * Zwei Ausgänge, und der zweite ist der wichtigere. Führt der Katalog ein
 * passendes Profil, geht die Nachricht mit dessen Eckdaten raus. Führt er
 * keins, wird nichts verschickt — der Lead wandert ins Archiv, und die
 * Ausschreibung bleibt als unerfüllte Nachfrage stehen. Ein Lead, den niemand
 * bedienen kann, ist keine verlorene Zeile, sondern die Auskunft darüber,
 * welches Profil im Katalog fehlt.
 *
 * Kein Sprachmodell. Der Brief entsteht deterministisch aus dem
 * Ausschreibungstext, die Rangliste ist ohnehin Code, und der Mailtext besteht
 * aus Profilangaben. Damit kostet ein Durchlauf über alle offenen Leads nichts
 * und lässt sich beliebig oft wiederholen.
 */

export type LeadOutcome =
  /** Treffer, Nachricht zugestellt. */
  | { leadId: number; outcome: "sent"; matchCount: number }
  /** Kein Treffer: archiviert, Nachfrage vermerkt. */
  | { leadId: number; outcome: "no_match"; status: Shortlist["status"] }
  /** Der Ausschreibungstext gab keine Anforderung her. */
  | { leadId: number; outcome: "unreadable" }
  /** Schon angeschrieben, Adresse gesperrt, Versand gescheitert. */
  | { leadId: number; outcome: "skipped"; reason: string };

export type MatchRunResult = {
  examined: number;
  sent: number;
  archived: number;
  skipped: number;
  outcomes: LeadOutcome[];
  /** Wie viele offene Leads der Deckel stehen ließ. */
  remaining: number;
};

type OpenLead = {
  id: number;
  company: string | null;
  recipient_name: string | null;
  recipient_email: string;
  stellenanzeige: string;
};

/**
 * Die Eckdaten, die in die Nachricht wandern.
 *
 * Nur belegte Kompetenzen: eine selbst angegebene Fähigkeit ist eine Aussage
 * der Person über sich, und die als Zusage an einen Auftraggeber
 * weiterzureichen wäre eine Behauptung, für die niemand einsteht.
 */
function factsFor(profile: {
  role: string;
  skillTags: readonly { value: string; source: string }[];
  workModes: readonly string[];
  location: { value: string } | null;
  availability: {
    status: "available" | "limited" | "unavailable" | "unknown";
    availableFrom: string | null;
  };
  hourlyRate: { amount: number; currency: string } | null;
}): MatchFacts {
  return {
    role: profile.role,
    verifiedSkills: profile.skillTags
      .filter((tag) => tag.source === "verified")
      .map((tag) => tag.value),
    workModes: profile.workModes,
    location: profile.location?.value ?? null,
    availabilityStatus: profile.availability.status,
    availableFrom: profile.availability.availableFrom,
    hourlyRate: profile.hourlyRate,
  };
}

/**
 * @param limit Wie viele Leads ein Durchgang anfasst. Der Deckel gilt dem
 *   Versand, nicht dem Abgleich — er ist die Tagesmenge, die ein Postfach bei
 *   IONOS unauffällig verschickt.
 */
export async function runLeadMatchPass(
  options: { limit?: number; senderEmail: string; dryRun?: boolean } = {
    senderEmail: "",
  },
): Promise<MatchRunResult> {
  const limit = Math.min(Math.max(options.limit ?? LEAD_BULK_SEND_LIMIT, 1), 200);
  const admin = createAdminSupabaseClient();

  const profiles = await fetchActiveBookableRealProfiles(admin);
  const profileCatalogVersion = catalogVersion(profiles);
  const origin = publicMailOrigin();

  const { data, error } = await admin
    .from("leadgen_queue")
    .select("id, company, recipient_name, recipient_email, stellenanzeige")
    .eq("status", "new")
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const leads = (data ?? []) as OpenLead[];
  const outcomes: LeadOutcome[] = [];
  let sent = 0;
  let archived = 0;
  let skipped = 0;
  let examined = 0;

  for (const lead of leads) {
    // Der Deckel zählt Versendetes, nicht Betrachtetes: Ein Lauf, den zwanzig
    // unlesbare Ausschreibungen aufbrauchen, hätte keine einzige Mail
    // verschickt und trotzdem behauptet, fertig zu sein.
    if (sent >= limit) break;
    examined += 1;

    // Nur das Lesen der Ausschreibung wird aufgefangen. Ein Fremdtext von
    // einer Projektbörse darf unbrauchbar sein — das ist ein Befund über
    // diesen einen Lead. Alles danach betrifft den Katalog und den Code, und
    // ein Fehler dort ist keine unlesbare Ausschreibung: Er muss den Lauf
    // anhalten, statt sich als Reihe von "unreadable" zu tarnen.
    let brief;
    try {
      brief = parseFallbackBrief(lead.stellenanzeige);
    } catch {
      outcomes.push({ leadId: lead.id, outcome: "unreadable" });
      continue;
    }
    const shortlist: Shortlist = buildShortlist(brief, profiles);

    if (shortlist.status !== "ranked" || !shortlist.matches.length) {
      // Erst die Nachfrage festhalten, dann archivieren. Andersherum wäre der
      // Lead bei einem Abbruch dazwischen aus der Liste verschwunden, ohne
      // dass irgendwo stünde, wonach gefragt worden war.
      if (!options.dryRun) {
        await recordLeadDemand({
          leadId: lead.id,
          recipientEmail: lead.recipient_email,
          brief,
          shortlist,
          profileCatalogVersion,
        });
        await updateLead({ id: lead.id, status: "dismissed", archived: true });
      }
      archived += 1;
      outcomes.push({
        leadId: lead.id,
        outcome: "no_match",
        status: shortlist.status,
      });
      continue;
    }

    const headline = leadHeadline(lead.stellenanzeige);
    const ctaUrl = leadSearchUrl({ origin, headline });
    if (!ctaUrl) {
      outcomes.push({ leadId: lead.id, outcome: "skipped", reason: "no_headline" });
      skipped += 1;
      continue;
    }

    const subject = buildMatchSubject({
      matchCount: shortlist.matches.length,
      headline,
    });
    const body = buildMatchEmail({
      recipientName: lead.recipient_name,
      company: lead.company,
      senderEmail: options.senderEmail,
      sourceUrl: leadSourceUrl(lead.stellenanzeige),
      unsubscribeUrl: unsubscribeUrl(origin, lead.recipient_email),
      headline,
      matchCount: shortlist.matches.length,
      ctaUrl,
      best: factsFor(shortlist.matches[0].profile),
    });

    if (options.dryRun) {
      sent += 1;
      outcomes.push({
        leadId: lead.id,
        outcome: "sent",
        matchCount: shortlist.matches.length,
      });
      continue;
    }

    // Erst beanspruchen, dann zustellen — dieselbe Reihenfolge wie im
    // Einzelversand. Läge der Versand zwischen Prüfung und Protokoll, könnten
    // zwei gleichzeitige Läufe beide zustellen.
    const claim = await claimOutreach({
      leadId: lead.id,
      subject,
      body,
      model: null,
      credits: null,
      createdBy: null,
    });
    if (!claim.claimed) {
      outcomes.push({ leadId: lead.id, outcome: "skipped", reason: claim.reason });
      skipped += 1;
      continue;
    }

    const delivery = await deliverEmail({
      to: lead.recipient_email,
      subject,
      text: body,
      kind: "cold_outreach",
    });
    if (!delivery.delivered) {
      await releaseOutreachClaim({
        outreachId: claim.outreachId,
        reason: delivery.reason,
      });
      outcomes.push({
        leadId: lead.id,
        outcome: "skipped",
        reason: delivery.reason,
      });
      skipped += 1;
      continue;
    }

    await recordOutreachSent(claim.outreachId);
    await updateLead({ id: lead.id, status: "contacted", archived: true });
    sent += 1;
    outcomes.push({
      leadId: lead.id,
      outcome: "sent",
      matchCount: shortlist.matches.length,
    });
  }

  return {
    examined,
    sent,
    archived,
    skipped,
    outcomes,
    remaining: Math.max(leads.length - examined, 0),
  };
}
