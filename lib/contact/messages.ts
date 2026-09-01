import {
  CONTACT_RESPONSE_PROMISE,
  IMPRINT_EMAIL,
} from "@/lib/legal/policy";

/**
 * Die beiden Nachrichten zum Kontaktformular.
 *
 * Bisher landete eine Anfrage nur in `contact_requests`: Der Absender bekam
 * keine Bestätigung, und im Postfach kam nichts an. Wer über das Impressum
 * schrieb, konnte nicht wissen, ob die Nachricht angekommen ist, und niemand
 * erfuhr, dass sie da ist, ohne die Tabelle von Hand anzusehen. Eine
 * Oberfläche, die Anfragen anzeigt, gibt es nicht — die Benachrichtigung ist
 * deshalb der einzige Weg, auf dem eine Anfrage tatsächlich gelesen wird.
 */

/**
 * Wohin die Benachrichtigung geht.
 *
 * Voreinstellung ist die Adresse aus dem Impressum. Sie lässt sich übersteuern,
 * weil "im Impressum genannt" und "wird tatsächlich gelesen" zwei verschiedene
 * Dinge sind: Eine Anfrage, die an ein Postfach geht, in das niemand schaut,
 * ist so gut wie nicht angekommen.
 */
export function contactInbox(): string {
  return process.env.CONTACT_NOTIFICATION_EMAIL?.trim() || IMPRINT_EMAIL;
}

/** Zitiert den Text so, wie eine Antwort ihn zitieren würde. */
function quoted(text: string): string[] {
  return text.split(/\r?\n/u).map((zeile) => (zeile ? `> ${zeile}` : ">"));
}

/**
 * Die Eingangsbestätigung an den Absender.
 *
 * Sie zitiert die Nachricht zurück, wie es bei Kontaktformularen üblich ist —
 * der Absender behält damit einen Beleg dessen, was er geschickt hat, ohne
 * ihn selbst aufheben zu müssen.
 *
 * Das ist eine bewusste Abwägung: Die Adresse im Formular ist ungeprüft, wer
 * sie einträgt, muss nicht ihr Inhaber sein. Zurückgezitierter Text bedeutet
 * deshalb, dass sich über das Formular fremden Postfächern Text zustellen
 * lässt. Was das begrenzt, sind hCaptcha und fünf Anfragen je Stunde und IP —
 * und der Umstand, dass die Nachricht sichtbar als zitierte Eingabe
 * gekennzeichnet ist und nicht als unsere eigene Aussage auftritt.
 */
export function contactAcknowledgementMessage(input: {
  fullName: string;
  subject: string;
  message: string;
}): { subject: string; text: string } {
  return {
    subject: `Ihre Nachricht an XPORTAL: ${input.subject}`,
    text: [
      `Hallo ${input.fullName},`,
      "",
      "wir haben Ihre Nachricht über das Kontaktformular erhalten.",
      CONTACT_RESPONSE_PROMISE,
      "",
      "Zur Bestätigung Ihre Nachricht im Wortlaut:",
      "",
      `> Betreff: ${input.subject}`,
      ">",
      ...quoted(input.message),
      "",
      "Diese Bestätigung ist automatisch erzeugt; antworten müssen Sie darauf",
      "nicht. Falls Sie uns nicht geschrieben haben, hat jemand Ihre Adresse in",
      "unser Formular eingetragen — schreiben Sie uns, wenn Sie das geklärt",
      "haben möchten.",
      "",
      "300 – Inhaber Roman Dering, Heilig-Kreuz-Straße 18, 87600 Kaufbeuren",
      `${IMPRINT_EMAIL} · https://x-portal.eu/imprint`,
    ].join("\n"),
  };
}

/**
 * Die Benachrichtigung ins eigene Postfach.
 *
 * Hier steht alles, was der Absender geschrieben hat — sie geht an die eigene
 * Adresse, nicht an eine fremde. Ein `replyTo` gibt es im Versandweg nicht,
 * deshalb steht die Adresse des Absenders im Text, damit sich die Antwort ohne
 * Umweg über die Datenbank schreiben lässt.
 */
export function contactNotificationMessage(input: {
  fullName: string;
  email: string;
  subject: string;
  message: string;
}): { subject: string; text: string } {
  return {
    subject: `Kontaktformular: ${input.subject}`,
    text: [
      `Von:     ${input.fullName}`,
      `Adresse: ${input.email}`,
      `Betreff: ${input.subject}`,
      "",
      "Nachricht:",
      input.message,
      "",
      "—",
      "Automatisch erzeugt aus dem Kontaktformular auf https://x-portal.eu/contact.",
      "Die Anfrage steht vollständig in der Tabelle contact_requests.",
    ].join("\n"),
  };
}
