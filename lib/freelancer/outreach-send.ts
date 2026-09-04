import "server-only";

import {
  deliverEmail,
  publicMailOrigin,
  type DeliveryFailure,
} from "@/lib/email/deliver";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";

import { buildOutreachDraft, type OutreachCandidate } from "./outreach";
import { markOutreachSent } from "./sourced-candidates-data";

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
  senderName: string;
  senderEmail: string;
  /** Gesetzt, wenn der Versand an einem Kandidaten vermerkt werden soll. */
  applicationId?: string | null;
}): Promise<OutreachSendResult> {
  const origin = publicMailOrigin();
  const draft = buildOutreachDraft({
    channel: "email",
    candidate: input.candidate,
    inviteUrl: new URL(INVITE_PATH, origin).toString(),
    senderName: input.senderName,
    senderEmail: input.senderEmail,
    contactEmail: input.contactEmail,
    projectHint: input.projectHint ?? null,
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
