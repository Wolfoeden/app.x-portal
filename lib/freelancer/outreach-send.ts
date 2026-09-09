import "server-only";

import {
  deliverEmail,
  publicMailOrigin,
  type DeliveryFailure,
} from "@/lib/email/deliver";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import {
  INVITE_TOKEN_PARAM,
  mintInviteToken,
} from "@/lib/sourcing/invite-token";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import {
  buildOutreachDraft,
  type DemandBrief,
  type OutreachCandidate,
} from "./outreach";

/**
 * Hält fest, dass eine Person informiert wurde.
 *
 * Der Nachweis, nicht die Zustellung: ohne Zeitpunkt keine belegbare
 * Einhaltung der Frist aus Art. 14 DSGVO. Ein bereits vermerkter Zeitpunkt
 * wird nicht überschrieben — der erste ist der, auf den es ankommt.
 *
 * Stand bis zum 9. September in einer eigenen Datei neben einer Liste für die
 * Adminseite „Informationspflicht". Die Seite ist weg, der Nachweis bleibt.
 */
async function markOutreachSent(input: {
  applicationId: string;
  channel: "email" | "linkedin" | "website" | "other";
  sentAt?: Date;
}): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("freelancer_applications")
    .update({
      outreach_sent_at: (input.sentAt ?? new Date()).toISOString(),
      outreach_channel: input.channel,
    })
    .eq("id", input.applicationId)
    .eq("source", "web_research")
    .eq("status", "sourced")
    .is("outreach_sent_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/**
 * Verschickt die Erstansprache an eine recherchierte Person.
 *
 * Die Nachricht ist Werbung, auch wenn sie überwiegend aus Pflichtangaben
 * besteht: Sie wirbt darum, sich einzutragen. Sie geht deshalb als
 * `cold_outreach` raus und läuft durch dieselbe Sperrliste wie die Ansprache
 * an Auftraggeber — eine Liste für beide Richtungen, damit ein Widerspruch
 * nicht nur den Kanal trifft, aus dem er kam.
 *
 * Der Vermerk im Protokoll entsteht erst nach zugestellter Nachricht. Wäre es
 * umgekehrt, stünde bei einem gescheiterten Versand eine erfüllte
 * Informationspflicht in der Datenbank, die nie erfüllt wurde — und die Frist
 * aus Art. 14 DSGVO liefe stillschweigend ab.
 */

/** Wohin der Link führt. Dort ergänzt die Person ihre Angaben selbst. */
const INVITE_PATH = "/freelancer/apply";

export type OutreachSendResult =
  | { sent: true; subject: string; body: string }
  | { sent: false; reason: DeliveryFailure | "not_recorded" };

export async function sendFreelancerOutreach(input: {
  candidate: OutreachCandidate;
  contactEmail: string;
  /** Wonach der Auftraggeber sucht. Ohne Angabe bleibt der Text allgemein. */
  projectHint?: string | null;
  /** Der Bedarf mit Thema, Arbeitsform und überschneidenden Erfahrungen. */
  demand?: DemandBrief | null;
  senderName: string;
  senderEmail: string;
  /** Gesetzt, wenn der Versand an einem Kandidaten vermerkt werden soll. */
  applicationId?: string | null;
}): Promise<OutreachSendResult> {
  const origin = publicMailOrigin();
  // Das Kennzeichen macht die Einladung rückverfolgbar: Wer darüber kommt und
  // sich einträgt, wird dem Kandidaten zugeordnet, statt als zweite Zeile
  // danebenzustehen. Fehlt das Geheimnis, geht die Einladung trotzdem raus —
  // ohne Zähler ist besser als gar nicht.
  const inviteUrl = new URL(INVITE_PATH, origin);
  const token = input.applicationId ? mintInviteToken(input.applicationId) : null;
  if (token) inviteUrl.searchParams.set(INVITE_TOKEN_PARAM, token);

  const draft = buildOutreachDraft({
    channel: "email",
    candidate: input.candidate,
    inviteUrl: inviteUrl.toString(),
    senderName: input.senderName,
    senderEmail: input.senderEmail,
    contactEmail: input.contactEmail,
    projectHint: input.projectHint ?? null,
    demand: input.demand ?? null,
    unsubscribeUrl: unsubscribeUrl(origin, input.contactEmail),
  });

  const delivery = await deliverEmail({
    to: input.contactEmail,
    subject: draft.subject ?? "XPORTAL",
    text: draft.body,
    kind: "cold_outreach",
  });

  if (!delivery.delivered) {
    return { sent: false, reason: delivery.reason };
  }

  if (input.applicationId) {
    const recorded = await markOutreachSent({
      applicationId: input.applicationId,
      channel: "email",
    });
    // Die Mail ist raus. Ein fehlender Vermerk macht das nicht rückgängig, er
    // macht es nur unbelegbar — und genau das muss der Aufrufer erfahren,
    // damit er es nicht für einen gescheiterten Versand hält und wiederholt.
    if (!recorded) return { sent: false, reason: "not_recorded" };
  }

  return { sent: true, subject: draft.subject ?? "XPORTAL", body: draft.body };
}
