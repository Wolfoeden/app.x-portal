import "server-only";

import {
  importSourcedCandidates,
  type ImportOutcome,
} from "@/lib/freelancer/sourced-candidate-import";
import type { DemandBrief } from "@/lib/freelancer/outreach";
import { sendFreelancerOutreach } from "@/lib/freelancer/outreach-send";
import type { ExternalFreelancerCandidate } from "@/lib/openai/external-freelancer-search";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { candidateFromProfile } from "./candidate";
import {
  isAddressable,
  loadSkillIndex,
  sourceFromFreelancermap,
  type FreelancermapProfile,
} from "./freelancermap";

/**
 * Der Beschaffungslauf: von einer Lücke in der Nachfrage zu Menschen, die
 * eingeladen werden können.
 *
 * Der Lauf tut zwei Dinge, die bewusst getrennt bleiben. Er **beschafft** —
 * das kostet nichts und legt nur Zeilen an. Und er **lädt ein** — das erreicht
 * Menschen und ist damit nicht rückholbar. Zwischen beidem steht die
 * Informationspflicht aus Art. 14 DSGVO, deren Frist mit dem Anlegen zu laufen
 * beginnt. Ein Aufruf, der beides in einem Rutsch täte, wäre bequemer und
 * würde die Uhr für Menschen starten, die niemand angesehen hat.
 */

/** Der Absender. Ohne „300" — der Empfänger soll XPORTAL lesen. */
export const SENDER_NAME = "Roman Dering";

function senderEmail(): string {
  return process.env.EMAIL_FROM?.trim() || "info@x-portal.eu";
}

export type SourcingRunInput = {
  demandProfileKey: string;
  demandProfileLabel: string;
  /** Die Pflichtkompetenzen des Nachfrageprofils. */
  skills: readonly string[];
  adminId: string;
  /** Profile je Skill. Klein halten — dieselben Menschen tauchen mehrfach auf. */
  limitPerSkill?: number;
};

export type SourcingRunOutcome = {
  runId: string | null;
  demandProfileLabel: string;
  /** Skills, zu denen es bei der Quelle keine Liste gibt. */
  skippedSkills: string[];
  found: number;
  addressable: number;
  candidates: ExternalFreelancerCandidate[];
  import: ImportOutcome | null;
  /** Gesetzt, wenn heute schon ein Lauf zu diesem Profil stattgefunden hat. */
  alreadyRanToday: boolean;
};

/**
 * Beschafft zu einem Nachfrageprofil und legt die Treffer als Kandidaten an.
 *
 * Entdoppelt über `profileUrl`: Wer TypeScript **und** PostgreSQL kann, steht
 * in beiden Listen und ist trotzdem ein Mensch. Ohne diesen Schritt bekäme er
 * zwei Einladungen — gemessen an einem Probelauf betraf das drei von zwanzig.
 */
export async function runSourcingPass(
  input: SourcingRunInput,
): Promise<SourcingRunOutcome> {
  const admin = createAdminSupabaseClient();
  const limitPerSkill = Math.min(Math.max(input.limitPerSkill ?? 4, 1), 12);

  const index = await loadSkillIndex();
  const profiles = new Map<string, FreelancermapProfile>();
  const skippedSkills: string[] = [];

  for (const skill of input.skills) {
    const lauf = await sourceFromFreelancermap({
      skill,
      limit: limitPerSkill,
      skillIndex: index,
    });
    if (!lauf.skillPageFound) {
      skippedSkills.push(skill);
      continue;
    }
    for (const profil of lauf.profiles) {
      if (!profiles.has(profil.profileUrl)) profiles.set(profil.profileUrl, profil);
    }
  }

  const ansprechbar = [...profiles.values()].filter(isAddressable);
  const candidates = ansprechbar
    .map(candidateFromProfile)
    .filter((wert): wert is ExternalFreelancerCandidate => wert !== null);

  const eingelesen =
    candidates.length > 0
      ? await importSourcedCandidates({ candidates, adminId: input.adminId })
      : { created: 0, skipped: [] };

  // Woher der Kandidat stammt, nachtragen. Ein Kandidat aus einem
  // Beschaffungslauf belegt unsere eigene Vermutung, einer aus einer bezahlten
  // Kundensuche echte Nachfrage — in der Auswertung ist das der Unterschied
  // zwischen Angebot und Bedarf.
  if (eingelesen.created > 0) {
    await admin
      .from("freelancer_applications")
      .update({ sourcing_origin: "demand_run" })
      .in(
        "source_profile_url",
        candidates.map((wert) => wert.profileUrl),
      )
      .eq("status", "sourced")
      .is("sourcing_origin", null);
  }

  const { data, error } = await admin
    .from("sourcing_runs")
    .insert({
      demand_profile_key: input.demandProfileKey.slice(0, 200),
      demand_profile_label: input.demandProfileLabel.slice(0, 200),
      skills: input.skills.slice(0, 12),
      source: "freelancermap",
      found_count: profiles.size,
      addressable_count: ansprechbar.length,
      imported_count: eingelesen.created,
      skipped_skills: skippedSkills,
      triggered_by: input.adminId,
    })
    .select("id")
    .maybeSingle();

  // Der eindeutige Index lässt einen zweiten Lauf am selben Tag nicht zu. Das
  // ist kein Fehler, sondern die Kostenbremse — der Aufrufer erfährt es und
  // behält die Kandidaten, die er schon hat.
  const alreadyRanToday = Boolean(error && error.code === "23505");
  if (error && !alreadyRanToday) throw error;

  return {
    runId: (data as { id: string } | null)?.id ?? null,
    demandProfileLabel: input.demandProfileLabel,
    skippedSkills,
    found: profiles.size,
    addressable: ansprechbar.length,
    candidates,
    import: eingelesen,
    alreadyRanToday,
  };
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
  status: "sent" | "failed" | "suppressed";
  reason: string | null;
  subject: string | null;
  /** Falsch, wenn der Beleg nicht geschrieben werden konnte. */
  recorded: boolean;
};

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
