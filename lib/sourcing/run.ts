import "server-only";

import type { DemandBrief } from "@/lib/freelancer/outreach";
import { sendFreelancerOutreach } from "@/lib/freelancer/outreach-send";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Die Einladung an einen recherchierten Freelancer.
 *
 * Hier stand einmal auch ein Beschaffungslauf gegen freelancermap. Der ist
 * zurückgebaut: Freelancer kommen aus der bezahlten Nutzersuche, nicht aus
 * einem eigenen Suchlauf. Übrig bleibt der Weg nach draußen und sein Beleg.
 */

/** Der Absender. Ohne „300" — der Empfänger soll XPORTAL lesen. */
export const SENDER_NAME = "Roman Dering";

function senderEmail(): string {
  return process.env.EMAIL_FROM?.trim() || "info@x-portal.eu";
}

export type InviteInput = {
  candidate: {
    fullName: string;
    roleTitle: string;
    sourceUrls: readonly string[];
  };
  contactEmail: string;
  demandProfileLabel: string | null;
  /**
   * Der Bedarf, so konkret wie er belegt ist. Ohne ihn bleibt der Text bei
   * dem einen allgemeinen Satz — das ist zulässig, aber schwächer.
   */
  demand?: DemandBrief | null;
  runId?: string | null;
  applicationId?: string | null;
  profileUrl?: string | null;
};

export type InviteOutcome = {
  status: "sent" | "failed" | "suppressed" | "wrong_origin";
  reason: string | null;
  subject: string | null;
  /** Falsch, wenn der Beleg nicht geschrieben werden konnte. */
  recorded: boolean;
};

/**
 * Die einzige Herkunft, die eine Einladung rechtfertigt.
 *
 * Die Nachricht behauptet einen konkreten Anlass: „Ein Unternehmen sucht
 * gerade Unterstützung im Bereich X." Das stimmt nur bei einem Kandidaten aus
 * einer **bezahlten Nutzersuche** — dort steht ein Auftraggeber mit einem
 * Projekt dahinter, der dafür Credits ausgegeben hat.
 *
 * Ein Kandidat aus einem Beschaffungslauf zu einem Nachfrageprofil hat diesen
 * Anlass nicht. Dort haben wir aus alten Anfragen geschlossen, dass jemand
 * gebraucht werden könnte — eine Vermutung, kein Auftrag. Ihn mit demselben
 * Satz anzuschreiben wäre eine Behauptung, die wir nicht belegen können.
 *
 * Deshalb sitzt die Prüfung hier, an der einzigen Stelle, die verschickt, und
 * nicht in der Oberfläche: Ein Knopf lässt sich umgehen, dieser Weg nicht.
 */
const EINLADBARE_HERKUNFT = "user_search";

/**
 * Lädt eine recherchierte Person ein und schreibt den Beleg.
 *
 * Der Beleg entsteht in jedem Fall, auch wenn der Versand scheitert oder die
 * Sperrliste ihn aufhält. Nur so lässt sich später beantworten, wer
 * angeschrieben wurde und wer nicht — und das ist genau die Frage, die die
 * Informationspflicht aufwirft.
 */
export async function inviteSourcedCandidate(
  input: InviteInput,
): Promise<InviteOutcome> {
  const admin = createAdminSupabaseClient();

  // Herkunft prüfen, bevor irgendetwas rausgeht.
  //
  // Ohne Kandidatenzeile lässt sich die Herkunft nicht belegen — und was sich
  // nicht belegen lässt, wird nicht angeschrieben. Das trifft auch den
  // Probeversand an die eigene Adresse; der geht über `sendFreelancerOutreach()`
  // und braucht diesen Weg nicht.
  if (!input.applicationId) {
    return {
      status: "wrong_origin",
      reason: "ohne Kandidatenzeile lässt sich die Herkunft nicht belegen",
      subject: null,
      recorded: true,
    };
  }

  const { data: herkunftZeile, error: herkunftFehler } = await admin
    .from("freelancer_applications")
    .select("sourcing_origin")
    .eq("id", input.applicationId)
    .maybeSingle();

  const herkunft = herkunftFehler
    ? null
    : ((herkunftZeile as { sourcing_origin: string | null } | null)
        ?.sourcing_origin ?? null);

  if (herkunft !== EINLADBARE_HERKUNFT) {
    // Kein Beleg in `sourcing_outreach`: Es ging nichts raus, und eine Zeile
    // dort hieße für jeden späteren Leser, jemand sei angeschrieben worden.
    return {
      status: "wrong_origin",
      reason: `Herkunft „${herkunft ?? "unbekannt"}" — eingeladen wird nur aus einer bezahlten Nutzersuche`,
      subject: null,
      recorded: true,
    };
  }

  const versand = await sendFreelancerOutreach({
    candidate: input.candidate,
    contactEmail: input.contactEmail,
    projectHint: input.demandProfileLabel,
    demand: input.demand ?? null,
    senderName: SENDER_NAME,
    senderEmail: senderEmail(),
    applicationId: input.applicationId ?? null,
  });

  const status: InviteOutcome["status"] = versand.sent
    ? "sent"
    : versand.reason === "suppressed"
      ? "suppressed"
      : "failed";

  const { error } = await admin.from("sourcing_outreach").insert({
    run_id: input.runId ?? null,
    application_id: input.applicationId ?? null,
    demand_profile_label: input.demandProfileLabel,
    recipient_email: input.contactEmail.slice(0, 254),
    recipient_name: input.candidate.fullName.slice(0, 200),
    profile_url: input.profileUrl ?? input.candidate.sourceUrls[0] ?? null,
    channel: "email",
    subject: versand.sent ? versand.subject : null,
    body_text: versand.sent ? versand.body : null,
    status,
    error: versand.sent ? null : versand.reason,
  });

  // Die Nachricht ist raus; das macht ein fehlender Beleg nicht rückgängig, er
  // macht es nur unbelegbar. Genau das muss der Aufrufer erfahren, sonst hält
  // er den Versand für gescheitert und wiederholt ihn — und der Mensch am
  // anderen Ende bekommt dieselbe Post zweimal.
  //
  // Beim ersten Probeversand war es genau so: Die Mail kam an, die Zeile
  // fehlte, weil `service_role` kein INSERT auf der neuen Tabelle hatte. Ein
  // verschluckter Fehler hat das eine Runde lang unsichtbar gemacht.
  if (error) {
    return {
      status,
      reason: `${status}_not_recorded: ${error.message}`,
      subject: versand.sent ? versand.subject : null,
      recorded: false,
    };
  }

  return {
    status,
    reason: versand.sent ? null : versand.reason,
    subject: versand.sent ? versand.subject : null,
    recorded: true,
  };
}

export type SourcingOutreachRow = {
  id: string;
  createdAt: string;
  recipientEmail: string;
  recipientName: string | null;
  demandProfileLabel: string | null;
  profileUrl: string | null;
  channel: string;
  subject: string | null;
  status: "sent" | "failed" | "suppressed" | "manual";
  error: string | null;
};

/**
 * Die verschickten Einladungen für die Nachfrageseite.
 *
 * Ohne Nachrichtentext: Die Übersicht soll zeigen, **wer wann was** bekommen
 * hat. Wer den Wortlaut braucht, öffnet den Einzelfall — ein Listenaufruf
 * soll nicht dutzendweise Nachrichtentexte durch die Anwendung tragen.
 */
export async function listSourcingOutreach(
  limit = 50,
): Promise<SourcingOutreachRow[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("sourcing_outreach")
    .select(
      "id,created_at,recipient_email,recipient_name,demand_profile_label,profile_url,channel,subject,status,error",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw error;

  return (data ?? []).map((row) => {
    const zeile = row as Record<string, unknown>;
    return {
      id: String(zeile.id),
      createdAt: String(zeile.created_at),
      recipientEmail: String(zeile.recipient_email),
      recipientName: (zeile.recipient_name as string | null) ?? null,
      demandProfileLabel: (zeile.demand_profile_label as string | null) ?? null,
      profileUrl: (zeile.profile_url as string | null) ?? null,
      channel: String(zeile.channel),
      status: zeile.status as SourcingOutreachRow["status"],
      subject: (zeile.subject as string | null) ?? null,
      error: (zeile.error as string | null) ?? null,
    };
  });
}

export type SourcingOutreachBody = {
  id: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string | null;
  body: string | null;
  status: SourcingOutreachRow["status"];
  error: string | null;
  createdAt: string;
};

/**
 * Der Wortlaut einer einzelnen Nachricht.
 *
 * Getrennt von der Liste, damit der Text nur dann durch die Anwendung geht,
 * wenn ihn jemand sehen will. Auch eine gescheiterte Nachricht hat einen
 * Grund, und der gehört mit ausgegeben — sonst steht dort ein leeres Feld und
 * niemand weiß, ob der Text fehlt oder der Versand.
 */
export async function readSourcingOutreachBody(
  id: string,
): Promise<SourcingOutreachBody | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("sourcing_outreach")
    .select(
      "id,recipient_email,recipient_name,subject,body_text,status,error,created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const zeile = data as Record<string, unknown>;
  return {
    id: String(zeile.id),
    recipientEmail: String(zeile.recipient_email),
    recipientName: (zeile.recipient_name as string | null) ?? null,
    subject: (zeile.subject as string | null) ?? null,
    body: (zeile.body_text as string | null) ?? null,
    status: zeile.status as SourcingOutreachRow["status"],
    error: (zeile.error as string | null) ?? null,
    createdAt: String(zeile.created_at),
  };
}

export type SourcingRunRow = {
  id: string;
  createdAt: string;
  demandProfileLabel: string;
  skills: string[];
  foundCount: number;
  addressableCount: number;
  importedCount: number;
  skippedSkills: string[];
};

/** Die letzten Beschaffungsläufe, für die Nachfrageseite. */
export async function listSourcingRuns(limit = 20): Promise<SourcingRunRow[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("sourcing_runs")
    .select(
      "id,created_at,demand_profile_label,skills,found_count,addressable_count,imported_count,skipped_skills",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;

  return (data ?? []).map((row) => {
    const zeile = row as Record<string, unknown>;
    return {
      id: String(zeile.id),
      createdAt: String(zeile.created_at),
      demandProfileLabel: String(zeile.demand_profile_label),
      skills: (zeile.skills as string[] | null) ?? [],
      foundCount: Number(zeile.found_count ?? 0),
      addressableCount: Number(zeile.addressable_count ?? 0),
      importedCount: Number(zeile.imported_count ?? 0),
      skippedSkills: (zeile.skipped_skills as string[] | null) ?? [],
    };
  });
}
