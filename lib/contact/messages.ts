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
 * erfuhr, dass sie da ist, ohne die Tabelle von Hand anzusehen.
 *
 * Es sind zwei Nachrichten, weil sie zwei verschiedene Empfänger haben und
 * unterschiedlich viel enthalten dürfen.
 */

/** Wohin die Benachrichtigung geht. Dieselbe Adresse wie im Impressum. */
export const CONTACT_INBOX = IMPRINT_EMAIL;

/**
 * Die Eingangsbestätigung an den Absender.
 *
 * **Sie enthält bewusst nichts, was der Absender selbst eingegeben hat** —
 * keinen Betreff, keinen Nachrichtentext, keinen Namen. Die Adresse im
 * Formular ist ungeprüft: Wer sie einträgt, muss nicht ihr Inhaber sein. Würde
 * die Bestätigung eingegebenen Text zurückspiegeln, wäre das Formular ein Weg,
 * fremden Postfächern beliebigen Text zu schicken — mit unserer Absenderadresse
 * davor. hCaptcha und das Limit von fünf Anfragen je Stunde begrenzen die
 * Menge, aber sie ändern nichts an der Art des Missbrauchs.
 *
 * Was der Absender braucht, ist ohnehin nur die Auskunft, dass die Nachricht
 * angekommen ist und wann er mit Antwort rechnen darf.
 */
export function contactAcknowledgementMessage(): {
  subject: string;
  text: string;
} {
  return {
    subject: "Ihre Nachricht an XPORTAL ist angekommen",
    text: [
      "Guten Tag,",
      "",
      "wir haben Ihre Nachricht über das Kontaktformular erhalten.",
      CONTACT_RESPONSE_PROMISE,
      "",
      "Diese Bestätigung ist automatisch erzeugt. Sie brauchen darauf nicht zu",
      "antworten — melden Sie sich gern erneut, wenn etwas fehlt.",
      "",
      "Falls Sie uns nicht geschrieben haben, hat jemand Ihre Adresse in unser",
      "Formular eingetragen. Dann ist hier nichts weiter zu tun: Wir antworten",
      "auf die Nachricht, löschen aber nichts, was Sie uns nicht geschickt",
      "haben. Schreiben Sie uns, wenn Sie das geklärt haben möchten.",
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
 * Adresse, nicht an eine fremde. `replyTo` gibt es im Versandweg nicht,
 * deshalb steht die Adresse des Absenders im Text, damit sich die Antwort
 * ohne Umweg über die Datenbank schreiben lässt.
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
