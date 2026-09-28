import { PLACEMENT_TERMS, PLACEMENT_TERMS_PATH } from "./config";

/**
 * Die Mails einer Vermittlung. Reiner Text, ohne Modell: Was hier steht,
 * kommt aus der Anfrage, dem Profil und den Vermittlungsbedingungen.
 *
 * Jede Mail an den Kunden nennt das Honorar noch einmal. Wer eine Vorstellung
 * bekommt, soll nicht erst bei der Rechnung erfahren, dass es eines gibt.
 */

export type IntroductionParties = {
  siteUrl: string;
  clientName: string | null;
  clientEmail: string;
  freelancerName: string;
  freelancerRole: string;
  projectTitle: string | null;
};

type Message = { subject: string; text: string };

function project(title: string | null): string {
  return title?.trim() || "Ihre Anfrage bei XPORTAL";
}

function greeting(name: string | null): string {
  return name?.trim() ? `Guten Tag ${name.trim()},` : "Guten Tag,";
}

const SIGNATURE = ["Viele Grüße", "Roman Dering", "XPORTAL"];

/** An den Betreiber: eine neue Anfrage wartet auf die Vorstellung. */
export function placementRequestNotice(input: {
  siteUrl: string;
  clientEmail: string | null;
  freelancerName: string;
  freelancerRole: string;
  projectTitle: string | null;
  requestId: string;
  freelancerReachable: boolean;
}): Message {
  return {
    subject: `Vermittlungsanfrage: ${input.freelancerName}`,
    text: [
      "Eine Vermittlungsanfrage wartet auf die Vorstellung.",
      "",
      `Freelancer: ${input.freelancerName} — ${input.freelancerRole}`,
      `Anfragende Person: ${input.clientEmail ?? "unbekannt"}`,
      `Projekt: ${project(input.projectTitle)}`,
      `Vermittlungsbedingungen: ${PLACEMENT_TERMS.version} (zugestimmt)`,
      input.freelancerReachable
        ? "Freelancer-E-Mail: vorhanden, die Vorstellung geht automatisch raus."
        : "Freelancer-E-Mail: fehlt. Bitte den Freelancer selbst informieren, bevor Sie vorstellen.",
      `Vorgang: ${input.requestId}`,
      "",
      `Vorstellen oder ablehnen: ${input.siteUrl}/chat/admin/vermittlungen`,
    ].join("\n"),
  };
}

/** An den Kunden, sobald die Vorstellung freigegeben ist. */
export function introductionForClient(
  input: IntroductionParties & { bookingUrl: string | null; freelancerNotified: boolean },
): Message {
  const t = PLACEMENT_TERMS;
  return {
    subject: `Vorstellung: ${input.freelancerName} für ${project(input.projectTitle)}`,
    text: [
      greeting(input.clientName),
      "",
      `wie angefragt stellen wir Ihnen ${input.freelancerName} vor (${input.freelancerRole}).`,
      "",
      `Projekt: ${project(input.projectTitle)}`,
      "",
      ...(input.bookingUrl
        ? ["Das Erstgespräch wählen Sie direkt im Kalender:", input.bookingUrl]
        : [`${input.freelancerName} meldet sich in den nächsten Tagen bei Ihnen, um ein Erstgespräch zu vereinbaren.`]),
      ...(input.freelancerNotified
        ? ["", `${input.freelancerName} hat Ihre Anfrage mit Ihrem Namen und Ihrer E-Mail-Adresse ebenfalls erhalten.`]
        : []),
      "",
      `Suche, Vorstellung und Erstgespräch sind kostenlos. Beauftragen Sie ${input.freelancerName}, fällt einmalig das Vermittlungshonorar an: ${t.feePercent} % des vereinbarten Honorars der ersten ${t.feeMonths} Monate, höchstens ${t.maxFeeDays} Projekttage. Bitte geben Sie uns Bescheid, wenn es zur Zusammenarbeit kommt; eine Antwort auf diese E-Mail genügt.`,
      "",
      `Vermittlungsbedingungen: ${input.siteUrl}${PLACEMENT_TERMS_PATH}`,
      "",
      ...SIGNATURE,
    ].join("\n"),
  };
}

/** An den Freelancer, zur selben Zeit. */
export function introductionForFreelancer(
  input: IntroductionParties & { hasCalendar: boolean },
): Message {
  return {
    subject: `Anfrage über XPORTAL: ${project(input.projectTitle)}`,
    text: [
      greeting(input.freelancerName),
      "",
      "ein Unternehmen möchte über XPORTAL mit Ihnen über eine Zusammenarbeit sprechen.",
      "",
      `Projekt: ${project(input.projectTitle)}`,
      `Ansprechpartner: ${input.clientName?.trim() ? `${input.clientName.trim()}, ` : ""}${input.clientEmail}`,
      "",
      input.hasCalendar
        ? "Der Kunde hat Ihren Kalenderlink erhalten und wählt dort einen Termin. Sie können sich auch direkt bei ihm melden."
        : "Bitte melden Sie sich direkt beim Kunden, um ein Erstgespräch zu vereinbaren.",
      "",
      "Die Vermittlung ist für Sie kostenlos. Bitte geben Sie uns kurz Bescheid, wenn es zu einer Beauftragung kommt; eine Antwort auf diese E-Mail genügt.",
      "",
      ...SIGNATURE,
    ].join("\n"),
  };
}

/** An den Kunden, wenn keine Vorstellung möglich ist. */
export function declineForClient(input: {
  siteUrl: string;
  clientName: string | null;
  freelancerName: string;
  projectTitle: string | null;
  reason: string | null;
}): Message {
  return {
    subject: `Ihre Anfrage zu ${input.freelancerName}`,
    text: [
      greeting(input.clientName),
      "",
      `leider können wir Ihnen ${input.freelancerName} für „${project(input.projectTitle)}“ derzeit nicht vorstellen.${input.reason?.trim() ? ` ${input.reason.trim()}` : ""}`,
      "",
      "In Ihrem Projekt finden Sie weitere passende Profile. Gern schlagen wir Ihnen auch selbst jemanden vor; antworten Sie dafür einfach auf diese E-Mail.",
      "",
      `Ihr Projekt: ${input.siteUrl}/chat`,
      "",
      ...SIGNATURE,
    ].join("\n"),
  };
}
