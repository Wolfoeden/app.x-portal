import "server-only";

import {
  buildShortlist,
  parseFallbackBrief,
  type Shortlist,
} from "@/lib/domain";
import { fetchActiveBookableRealProfiles } from "@/lib/data/freelancers";
import { deliverEmail, publicMailOrigin } from "@/lib/email/deliver";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import {
  catalogVersion,
  demandActorForLead,
  recordLeadMatch,
} from "@/lib/leadgen/demand";
import { extractProjectBrief } from "@/lib/openai/brief";
import {
  claimPreparedDraft,
  discardPreparedDraft,
  listPreparedDrafts,
  recordLeadRun,
  recordOutreachSent,
  releaseOutreachClaim,
  savePreparedDraft,
  sentSince,
  updateLead,
} from "@/lib/leadgen/leads-data";
import {
  LEAD_BULK_SEND_LIMIT,
  LEAD_HOURLY_SEND_LIMIT,
  sendHourStart,
  LEAD_DRAFT_MAX_AGE_DAYS,
  isWithinLeadSendWindow,
  leadDayStart,
  leadHeadline,
  leadSourceUrl,
} from "@/lib/leadgen/limits";
import {
  buildMatchEmail,
  buildMatchSubject,
  leadSearchUrl,
  type MatchFacts,
} from "@/lib/leadgen/outreach-message";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Der Lead-Abgleich, in zwei Vorgängen.
 *
 * **Vorbereiten** hält jeden offenen Lead gegen den Katalog. Führt dieser ein
 * passendes Profil, entsteht ein fertiger Entwurf; führt er keins, wandert der
 * Lead ins Archiv und die Ausschreibung bleibt als unerfüllte Nachfrage
 * stehen. Ein Lead, den niemand bedienen kann, ist keine verlorene Zeile,
 * sondern die Auskunft darüber, welches Profil im Katalog fehlt.
 *
 * **Versenden** stellt die vorbereiteten Entwürfe zu, zwanzig am Tag.
 *
 * Getrennt, weil die beiden nichts gemeinsam haben außer der Reihenfolge. Der
 * Abgleich kostet nichts: kein Modell, kein Netz, nur Rechenzeit gegen
 * zweiundsiebzig Profile. Der Versand kostet eine SMTP-Runde je Nachricht und
 * ist gedeckelt, weil ein Postfach bei IONOS sonst im Spamfilter landet.
 * Zusammen in einem Durchgang richtete sich der Abgleich nach dem Deckel des
 * Versands — von 251 offenen Leads sah ein Durchgang fünfundfünfzig, und die
 * Nachfrageauskunft entstand nur so schnell, wie Werbemails rausgingen.
 *
 * Kein Sprachmodell in beiden. Der Brief entsteht deterministisch aus dem
 * Ausschreibungstext, die Rangliste ist ohnehin Code, und der Mailtext besteht
 * aus Profilangaben.
 */

export type LeadOutcome =
  /** Abgeglichen, Entwurf liegt bereit. */
  | { leadId: number; outcome: "prepared"; matchCount: number }
  /** Treffer, Nachricht zugestellt. */
  | { leadId: number; outcome: "sent"; matchCount: number }
  /** Kein Treffer: archiviert, Nachfrage vermerkt. */
  | { leadId: number; outcome: "no_match"; status: Shortlist["status"] }
  /** Der Ausschreibungstext gab keine Anforderung her. */
  | { leadId: number; outcome: "unreadable" }
  /** Der Entwurf trug nicht mehr und wurde zurückgestellt. */
  | { leadId: number; outcome: "discarded"; reason: string }
  /** Schon angeschrieben, Adresse gesperrt, Versand gescheitert. */
  | { leadId: number; outcome: "skipped"; reason: string };

export type MatchRunResult = {
  examined: number;
  /**
   * Wie viele Ausschreibungen das Modell gelesen hat und wie viele auf dem
   * deterministischen Weg gelandet sind. Der Unterschied erklaert die
   * Trefferquote: Ein Fallback-Brief traegt selten mehr als ein paar
   * Stichworte, und daran findet die Rangliste niemanden.
   */
  extractedByModel: number;
  extractedByFallback: number;
  /** Entwürfe, die dieser Durchgang angelegt hat. */
  prepared: number;
  sent: number;
  archived: number;
  skipped: number;
  /** Entwürfe, die nicht mehr trugen und zurückgestellt wurden. */
  discarded: number;
  outcomes: LeadOutcome[];
  /** Wie viele Fälle dieser Durchgang stehen ließ. */
  remaining: number;
  /** Was heute noch übrig ist, nachdem dieser Durchgang fertig war. */
  dailyBudgetLeft: number;
  /** Warum der Durchgang aufgehört hat. */
  stoppedBy:
    | "queue_empty"
    | "time"
    | "examined"
    | "daily_limit"
    | "outside_window"
    | "nothing_prepared";
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
 * Wie lange ein Aufruf höchstens arbeitet.
 *
 * Nicht frei gewählt: Die Funktion läuft hinter einem Gateway, das eine
 * synchrone Antwort nach gut dreißig Sekunden abbricht. Ein Durchgang, der
 * die Warteschlange in einem Rutsch leeren wollte, lief genau da hinein.
 *
 * Also arbeitet ein Aufruf ein Stück ab und sagt im Ergebnis, was liegen
 * blieb. Der Zeitgeber ruft mehrmals; was er nicht schafft, schafft der
 * nächste Durchgang.
 */
const TIME_BUDGET_MS = 20_000;

/**
 * Wie viele Leads ein Aufruf höchstens ansieht.
 *
 * Beim Vorbereiten großzügiger als beim Versenden: Ein Abgleich ist
 * Rechenzeit gegen den Katalog und kostet Bruchteile einer Sekunde, während
 * ein Versand auf den Mailserver wartet. Die Zeitgrenze bleibt in beiden
 * Fällen die eigentliche Bremse.
 */
const EXAMINE_BUDGET_PREPARE = 300;
const EXAMINE_BUDGET_SEND = 60;

export type MatchRunOptions = {
  senderEmail: string;
  /** Deckel für den ganzen Tag, nicht für diesen Aufruf. */
  dailyLimit?: number;
  /** Wie viele Fälle dieser Aufruf ansieht. */
  examineBudget?: number;
  timeBudgetMs?: number;
  dryRun?: boolean;
  now?: Date;
  /**
   * Nur innerhalb des Versandfensters arbeiten.
   *
   * Der Zeitgeber setzt das, der Betreiber nicht: Ein Lauf, den jemand
   * von Hand anstößt, hat einen Menschen davor, der weiß, wie spät es
   * ist. Die Grenze schützt vor dem Zeitplan, nicht vor der Bedienung.
   *
   * Gilt nur für den Versand. Abgleichen darf der Zeitgeber jederzeit — es
   * verlässt nichts das Haus dabei.
   */
  enforceWindow?: boolean;
  /** Wer den Lauf angestoßen hat. Steht im Beleg jeder Nachricht. */
  trigger?: "scheduler" | "admin";
  /**
   * Die Ausschreibung vom Modell lesen lassen, wie im Chat.
   *
   * Standardmäßig an. Auf `false` bleibt der deterministische Weg — für einen
   * Probelauf, der nichts kosten soll, und als Notausgang, wenn der Anbieter
   * teuer oder gestört ist.
   */
  useAi?: boolean;
};

function leeresErgebnis(
  stoppedBy: MatchRunResult["stoppedBy"],
): MatchRunResult {
  return {
    examined: 0,
    extractedByModel: 0,
    extractedByFallback: 0,
    prepared: 0,
    sent: 0,
    archived: 0,
    skipped: 0,
    discarded: 0,
    outcomes: [],
    remaining: 0,
    dailyBudgetLeft: 0,
    stoppedBy,
  };
}

/**
 * Jeden offenen Lead gegen den Katalog halten.
 *
 * Was dabei entsteht, verlässt das Haus nicht: ein Entwurf oder ein Eintrag
 * in der Nachfrage. Deshalb hat dieser Durchgang weder ein Tageslimit noch
 * ein Zeitfenster — er darf laufen, sooft er will.
 */
export async function runLeadPreparePass(
  options: MatchRunOptions,
): Promise<MatchRunResult> {
  const examineBudget = Math.min(
    Math.max(options.examineBudget ?? EXAMINE_BUDGET_PREPARE, 1),
    500,
  );
  const timeBudgetMs = Math.max(options.timeBudgetMs ?? TIME_BUDGET_MS, 1_000);
  const startedAt = Date.now();
  const now = options.now ?? new Date();

  const admin = createAdminSupabaseClient();

  const profiles = await fetchActiveBookableRealProfiles(admin);
  const profileCatalogVersion = catalogVersion(profiles);
  const origin = publicMailOrigin();

  // Leads, für die schon ein Entwurf bereitliegt, werden übergangen. Sie
  // jeden Morgen neu abzugleichen hieße, einen wartenden Entwurf täglich
  // durch einen fast gleichen zu ersetzen — und das Datum, an dem er
  // entstand, immer wieder vorzurücken, bis er nie abläuft.
  const { data: entwuerfe, error: entwurfFehler } = await admin
    .from("leadgen_outreach")
    .select("lead_id")
    .eq("state", "draft");
  if (entwurfFehler) throw entwurfFehler;
  const schonVorbereitet = new Set(
    (entwuerfe ?? []).map((zeile) => (zeile as { lead_id: number }).lead_id),
  );

  const { data, error } = await admin
    .from("leadgen_queue")
    .select("id, company, recipient_name, recipient_email, stellenanzeige")
    .eq("status", "new")
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const leads = (data ?? []).filter(
    (lead) => !schonVorbereitet.has((lead as OpenLead).id),
  ) as OpenLead[];

  const outcomes: LeadOutcome[] = [];
  let modellGelesen = 0;
  let fallbackGelesen = 0;
  let prepared = 0;
  let archived = 0;
  let skipped = 0;
  let examined = 0;
  let stoppedBy: MatchRunResult["stoppedBy"] = "queue_empty";

  for (const lead of leads) {
    if (examined >= examineBudget) {
      stoppedBy = "examined";
      break;
    }
    if (Date.now() - startedAt > timeBudgetMs) {
      stoppedBy = "time";
      break;
    }
    examined += 1;

    // Die Ausschreibung wird gelesen wie die Anfrage eines Nutzers im Chat:
    // dasselbe Modell, dieselben Regeln, derselbe Brief. Vorher lief hier nur
    // `parseFallbackBrief()` -- ein Notnagel, der Stichworte aus einer Zeile
    // klaubt. Aus einem freien Ausschreibungstext holt er kaum eine
    // Anforderung heraus, und ohne Anforderung findet die Rangliste
    // niemanden: 215 von 261 Abgleichen endeten ohne Treffer, die meisten
    // davon als `needs_clarification`.
    //
    // Das Pseudonym des Leads dient als Sicherheitskennung. Es ist stabil,
    // enthaelt keine Adresse und ist genau dafuer gedacht.
    //
    // Faellt das Modell aus, greift innerhalb von `extractProjectBrief()`
    // derselbe deterministische Weg wie zuvor. Ein Lauf bricht daran nicht
    // ab, aber das Ergebnis sagt, was gerechnet wurde.
    let brief;
    try {
      if (options.useAi === false) {
        brief = parseFallbackBrief(lead.stellenanzeige);
        fallbackGelesen += 1;
      } else {
        const extraction = await extractProjectBrief({
          originalRequest: lead.stellenanzeige,
          safetyIdentifier: demandActorForLead(lead.recipient_email),
          allowProvider: true,
        });
        brief = extraction.brief;
        if (extraction.mode === "openai") modellGelesen += 1;
        else fallbackGelesen += 1;
      }
    } catch {
      // Ein Fremdtext von einer Projektboerse darf unbrauchbar sein -- das ist
      // ein Befund ueber diesen einen Lead. Alles danach betrifft den Katalog
      // und den Code, und ein Fehler dort ist keine unlesbare Ausschreibung.
      outcomes.push({ leadId: lead.id, outcome: "unreadable" });
      continue;
    }
    const shortlist: Shortlist = buildShortlist(brief, profiles);

    if (!options.dryRun) {
      // Erst das Ergebnis festhalten, dann handeln. Andersherum wäre der Lead
      // bei einem Abbruch dazwischen aus der Liste verschwunden, ohne dass
      // irgendwo stünde, wonach gefragt worden war.
      await recordLeadMatch({
        leadId: lead.id,
        recipientEmail: lead.recipient_email,
        brief,
        shortlist,
        profileCatalogVersion,
      });
    }

    if (shortlist.status !== "ranked" || !shortlist.matches.length) {
      if (!options.dryRun) {
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
      outcomes.push({
        leadId: lead.id,
        outcome: "skipped",
        reason: "no_headline",
      });
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

    if (!options.dryRun) {
      await savePreparedDraft({
        leadId: lead.id,
        subject,
        body,
        ctaUrl,
        // Das angebotene Profil wandert mit in die Zeile. Der Versand prüft
        // es später gegen den dann gültigen Katalog.
        profileId: shortlist.matches[0].profile.id,
        preparedAt: now,
        recipientEmail: lead.recipient_email,
        company: lead.company,
      });
    }

    prepared += 1;
    outcomes.push({
      leadId: lead.id,
      outcome: "prepared",
      matchCount: shortlist.matches.length,
    });
  }

  const ergebnis: MatchRunResult = {
    examined,
    extractedByModel: modellGelesen,
    extractedByFallback: fallbackGelesen,
    prepared,
    sent: 0,
    archived,
    skipped,
    discarded: 0,
    outcomes,
    remaining: Math.max(leads.length - examined, 0),
    dailyBudgetLeft: 0,
    stoppedBy,
  };

  await recordLeadRun({
    started_at: new Date(startedAt).toISOString(),
    trigger: options.trigger ?? "scheduler",
    kind: "prepare",
    dry_run: options.dryRun ?? false,
    examined: ergebnis.examined,
    sent: ergebnis.prepared,
    archived: ergebnis.archived,
    skipped: ergebnis.skipped,
    remaining: ergebnis.remaining,
    daily_budget_left: 0,
    stopped_by: ergebnis.stoppedBy,
  });

  return ergebnis;
}

/**
 * Die vorbereiteten Entwürfe zustellen.
 *
 * Vor jedem Versand wird geprüft, ob das angebotene Profil noch trägt.
 * Zwischen Vorbereitung und Versand liegen Stunden bis Tage, und in dieser
 * Zeit kann es abgelaufen, ausgebucht oder zurückgezogen sein. Eine
 * Nachricht, die ein nicht mehr buchbares Profil anbietet, ist schlechter
 * als keine.
 */
export async function runLeadSendPass(
  options: MatchRunOptions,
): Promise<MatchRunResult> {
  const dailyLimit = Math.min(
    Math.max(options.dailyLimit ?? LEAD_BULK_SEND_LIMIT, 1),
    200,
  );
  const examineBudget = Math.min(
    Math.max(options.examineBudget ?? EXAMINE_BUDGET_SEND, 1),
    500,
  );
  const timeBudgetMs = Math.max(options.timeBudgetMs ?? TIME_BUDGET_MS, 1_000);
  const startedAt = Date.now();
  const now = options.now ?? new Date();

  // Vor jeder Abfrage: Ein Aufruf außerhalb des Fensters soll nichts kosten.
  // Der Zeitgeber weckt die Route großzügiger, als das Fenster ist — er plant
  // in UTC, das Fenster gilt in Ortszeit —, und die überzähligen Aufrufe
  // enden hier.
  if (options.enforceWindow && !isWithinLeadSendWindow(now)) {
    return leeresErgebnis("outside_window");
  }

  const heuteVersandt = options.dryRun ? 0 : await sentSince(leadDayStart(now));
  const budgetHeute = Math.max(dailyLimit - heuteVersandt, 0);
  if (budgetHeute <= 0) {
    return { ...leeresErgebnis("daily_limit"), dailyBudgetLeft: 0 };
  }

  const admin = createAdminSupabaseClient();
  const profiles = await fetchActiveBookableRealProfiles(admin);
  const buchbar = new Set(profiles.map((profile) => profile.id));

  const drafts = await listPreparedDrafts(
    Math.min(budgetHeute + examineBudget, 200),
  );
  if (!drafts.length) {
    return { ...leeresErgebnis("nothing_prepared"), dailyBudgetLeft: budgetHeute };
  }

  const hoechstalterMs = LEAD_DRAFT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const outcomes: LeadOutcome[] = [];
  let sent = 0;
  let skipped = 0;
  let discarded = 0;
  let examined = 0;
  let stoppedBy: MatchRunResult["stoppedBy"] = "queue_empty";

  for (const draft of drafts) {
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

    // Zwei Gründe, einen Entwurf nicht mehr zu verschicken: Das angebotene
    // Profil trägt nicht mehr, oder der Entwurf ist zu alt. In beiden Fällen
    // geht der Lead zurück in die Warteschlange und wird gegen den dann
    // gültigen Katalog neu abgeglichen.
    const alter = draft.prepared_at
      ? now.getTime() - new Date(draft.prepared_at).getTime()
      : 0;
    const grund =
      draft.prepared_profile_id && !buchbar.has(draft.prepared_profile_id)
        ? "profile_gone"
        : alter > hoechstalterMs
          ? "draft_expired"
          : null;

    if (grund) {
      if (!options.dryRun) {
        await discardPreparedDraft({
          outreachId: draft.outreach_id,
          reason: grund,
        });
      }
      discarded += 1;
      outcomes.push({
        leadId: draft.lead_id,
        outcome: "discarded",
        reason: grund,
      });
      continue;
    }

    if (options.dryRun) {
      sent += 1;
      outcomes.push({ leadId: draft.lead_id, outcome: "sent", matchCount: 0 });
      continue;
    }

    const zustellung = await deliverPreparedDraft(draft);
    if (!zustellung.sent) {
      outcomes.push({
        leadId: draft.lead_id,
        outcome: "skipped",
        reason: zustellung.reason,
      });
      skipped += 1;
      continue;
    }

    sent += 1;
    outcomes.push({ leadId: draft.lead_id, outcome: "sent", matchCount: 0 });
  }

  const ergebnis: MatchRunResult = {
    examined,
    extractedByModel: 0,
    extractedByFallback: 0,
    prepared: 0,
    sent,
    archived: 0,
    skipped,
    discarded,
    outcomes,
    remaining: Math.max(drafts.length - examined, 0),
    dailyBudgetLeft: Math.max(budgetHeute - sent, 0),
    stoppedBy,
  };

  await recordLeadRun({
    started_at: new Date(startedAt).toISOString(),
    trigger: options.trigger ?? "scheduler",
    kind: "send",
    dry_run: options.dryRun ?? false,
    examined: ergebnis.examined,
    sent: ergebnis.sent,
    archived: ergebnis.archived,
    skipped: ergebnis.skipped,
    remaining: ergebnis.remaining,
    daily_budget_left: ergebnis.dailyBudgetLeft,
    stopped_by: ergebnis.stoppedBy,
  });

  return ergebnis;
}

export type DraftDeliveryResult =
  | { sent: true }
  | { sent: false; reason: string };

/**
 * Einen vorbereiteten Entwurf zustellen — genau so, wie es der Tageslauf tut.
 *
 * Diese Funktion ist der einzige Weg, auf dem eine Akquise-Nachricht das Haus
 * verlässt. Vorher gab es zwei: den Tageslauf mit dem Text aus den
 * Profildaten und daneben einen Einzelversand aus der Arbeitsfläche, der sich
 * seinen Text von einem Modell schreiben ließ. Derselbe Lead bekam damit je
 * nach Knopf eine andere Nachricht, und ein Fehler zeigte sich nur auf einem
 * der beiden Wege.
 *
 * Ein Knopf und ein Zeitgeber dürfen sich darin unterscheiden, wann sie
 * auslösen — nicht darin, was sie verschicken.
 *
 * Erst beanspruchen, dann zustellen: Läge der Versand zwischen Prüfung und
 * Protokoll, könnten zwei gleichzeitige Aufrufe beide zustellen.
 */
export async function deliverPreparedDraft(draft: {
  outreach_id: string;
  lead_id: number | null;
  recipient_email: string | null;
  subject: string;
  body: string;
}): Promise<DraftDeliveryResult> {
  if (!draft.recipient_email) {
    return { sent: false, reason: "no_recipient" };
  }

  // Die Stundenbremse sitzt hier, weil hier zugestellt wird.
  //
  // Vorher hing die Mengenprüfung am Stapellauf. Der Einzelversand aus der
  // Arbeitsfläche ruft diese Funktion unmittelbar und ging deshalb an ihr
  // vorbei — am 8. September gingen so fünfundzwanzig statt zwanzig
  // Nachrichten raus. Eine Grenze, die ein zweiter Aufrufer umgehen kann, ist
  // keine.
  //
  // Gezählt wird stündlich und nicht täglich, weil das die Grenze ist, die
  // der Mailanbieter kennt: fünfzig in der Stunde verkraftet er, vierzig ist
  // der Zielwert mit Abstand. Vor dem Anspruch auf den Entwurf, damit ein
  // abgewiesener Versand ihn nicht blockiert.
  const inDieserStunde = await sentSince(sendHourStart(new Date()));
  if (inDieserStunde >= LEAD_HOURLY_SEND_LIMIT) {
    return { sent: false, reason: "hourly_limit" };
  }

  const claim = await claimPreparedDraft(draft.outreach_id);
  if (!claim.claimed) return { sent: false, reason: claim.reason };

  const delivery = await deliverEmail({
    to: draft.recipient_email,
    subject: draft.subject,
    text: draft.body,
    kind: "cold_outreach",
  });
  if (!delivery.delivered) {
    await releaseOutreachClaim({
      outreachId: draft.outreach_id,
      // Der Text des Mailservers, wenn es einen gibt. Ohne ihn stünde im
      // Beleg nur, dass es nicht ging.
      reason: delivery.detail
        ? `${delivery.reason}: ${delivery.detail}`
        : delivery.reason,
    });
    return { sent: false, reason: delivery.reason };
  }

  await recordOutreachSent(draft.outreach_id);
  if (draft.lead_id !== null) {
    await updateLead({
      id: draft.lead_id,
      status: "contacted",
      archived: true,
    });
  }
  return { sent: true };
}
