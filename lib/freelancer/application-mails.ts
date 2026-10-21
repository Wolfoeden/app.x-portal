/**
 * Die zwei Mails an Bewerber (21.10.2026). Bis dahin erfuhr niemand, was aus
 * seiner Bewerbung wurde: Das Formular sagte „wird geprüft“, und dann kam
 * nichts. Reiner Text wie jede Vorgangsmail (lib/email/deliver.ts).
 */

import { SIGNATURE_LINES } from "@/lib/email/signature";

type Message = { subject: string; text: string };

function greeting(name: string): string {
  return name.trim() ? `Guten Tag ${name.trim()},` : "Guten Tag,";
}

/**
 * Das Profil ist live: sofort (`reviewed: false`) oder nach der Sichtung durch
 * das Team.
 */
export function profileLiveMessage(input: { name: string; profileUrl: string; portalUrl: string; reviewed: boolean }): Message {
  return {
    subject: "Ihr Profil bei XPORTAL ist online",
    text: [
      greeting(input.name),
      "",
      "Ihr Profil ist ab sofort im Matching. Unternehmen, die ein passendes Projekt beschreiben, sehen es ohne Ihre E-Mail-Adresse und Telefonnummer.",
      "",
      `Ihr Profil: ${input.profileUrl}`,
      `Bearbeiten, Verfügbarkeit ändern oder pausieren: ${input.portalUrl}`,
      "",
      input.reviewed
        ? "Unser Team hat Ihr Profil gesichtet. Angaben, die wir mit einem Nachweis abgeglichen haben, stehen dort als „Von XPORTAL geprüft“."
        : "Ihre Angaben stehen als „Angaben laut Freelancer“ im Profil. Einzelne gleicht XPORTAL später mit Nachweisen ab; dann steht dort „Von XPORTAL geprüft“.",
      "",
      "Passt eine Anfrage, melden wir uns per E-Mail. Die Vermittlung ist für Sie kostenlos.",
      "",
      ...SIGNATURE_LINES,
    ].join("\n"),
  };
}

/** Die Bewerbung wartet auf das Team, mit den Gründen. */
export function applicationReceivedMessage(input: { name: string; reasons: readonly string[]; portalUrl: string }): Message {
  return {
    subject: "Ihre Bewerbung bei XPORTAL ist eingegangen",
    text: [
      greeting(input.name),
      "",
      input.reasons.length
        ? "danke für Ihr Profil. Bevor es online geht, sieht es sich jemand aus unserem Team an:"
        : "danke für Ihr Profil. Bevor es online geht, sieht es sich jemand aus unserem Team an.",
      "",
      ...(input.reasons.length ? [...input.reasons.map((reason) => `- ${reason}`), ""] : []),
      "Das dauert in der Regel ein bis zwei Werktage. Fehlt etwas, fragen wir per E-Mail nach.",
      `Den Stand sehen Sie hier: ${input.portalUrl}`,
      "",
      ...SIGNATURE_LINES,
    ].join("\n"),
  };
}
