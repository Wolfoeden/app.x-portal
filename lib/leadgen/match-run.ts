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
  sentSince,
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
  /** Wie viele offene Leads dieser Durchgang stehen ließ. */
  remaining: number;
  /** Was heute noch übrig ist, nachdem dieser Durchgang fertig war. */
  dailyBudgetLeft: number;
  /** Warum der Durchgang aufgehört hat. */
  stoppedBy: "queue_empty" | "time" | "examined" | "daily_limit";
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
/**
 * Wie lange ein Aufruf höchstens arbeitet.
 *
 * Nicht frei gewählt: Die Funktion läuft hinter einem Gateway, das eine
 * synchrone Antwort nach gut dreißig Sekunden abbricht. Ein Durchgang, der
 * die Warteschlange in einem Rutsch leeren wollte, lief genau da hinein —
 * 247 offene Leads, und jeder Versand kostet zusätzlich eine SMTP-Runde.
 *
 * Also arbeitet ein Aufruf ein Stück ab und sagt im Ergebnis, was liegen
 * blieb. Der Zeitgeber ruft mehrmals am Morgen; was er nicht schafft,
 * schafft der nächste Tag.
 */
const TIME_BUDGET_MS = 20_000;

/**
 * Wie viele Leads ein Aufruf höchstens ansieht.
 *
 * Die Zeitgrenze allein genügt nicht: Sie greift erst, wenn die Zeit weg
 * ist, und ein Aufruf, der 200 unbrauchbare Ausschreibungen durchrechnet,
 * hätte sie dann auch verbraucht. Diese Grenze hält die Antwortzeit im
 * Rahmen, auch wenn nichts zu verschicken ist.
 */
const EXAMINE_BUDGET = 60;

export type MatchRunOptions = {
  senderEmail: string;
  /** Deckel für den ganzen Tag, nicht für diesen Aufruf. */
  dailyLimit?: number;
  /** Wie viele Leads dieser Aufruf ansieht. */
  examineBudget?: number;
  timeBudgetMs?: number;
  dryRun?: boolean;
  now?: Date;
};

export async function runLeadMatchPass(
  options: MatchRunOptions,
): Promise<MatchRunResult> {
  const dailyLimit = Math.min(
    Math.max(options.dailyLimit ?? LEAD_BULK_SEND_LIMIT, 1),
    200,
  );
  const examineBudget = Math.min(
    Math.max(options.examineBudget ?? EXAMINE_BUDGET, 1),
    500,
  );
  const timeBudgetMs = Math.max(options.timeBudgetMs ?? TIME_BUDGET_MS, 1_000);
  const startedAt = Date.now();
  const now = options.now ?? new Date();

  // Mitternacht in der Zeitzone, in der der Betrieb stattfindet. UTC wäre
  // im Sommer zwei Stunden daneben und würde den Tag mitten im Vormittag
  // umschalten.
  const tagesbeginn = new Date(
    new Date(now.toLocaleString("en-US", { timeZone: "Europe/Berlin" })).setHours(
      0,
      0,
      0,
      0,
    ),
  );
  const heuteVersandt = options.dryRun ? 0 : await sentSince(tagesbeginn);
  const budgetHeute = Math.max(dailyLimit - heuteVersandt, 0);

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

  let stoppedBy: MatchRunResult["stoppedBy"] = "queue_empty";

  for (const lead of leads) {
    // Drei Gründe aufzuhören, und alle drei gehören ins Ergebnis: Sonst
    // sieht ein Durchgang, der nach zwanzig Sekunden abbricht, genauso aus
    // wie einer, der fertig geworden ist.
    if (sent >= budgetHeute) {
      stoppedBy = "daily_limit";
      break;
    }
    if (examined >= examineBudget) {
      stoppedBy = "examined";
      break;
    }
    if (Date.now() - startedAt > timeBudgetMs) {
      stoppedBy = "time";
      break;
    }
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
    dailyBudgetLeft: Math.max(budgetHeute - sent, 0),
    stoppedBy,
  };
}
