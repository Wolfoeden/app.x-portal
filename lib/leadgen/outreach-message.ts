import { IMPRINT_EMAIL } from "@/lib/legal/policy";

/**
 * Der Rahmen der Akquise-Mail.
 *
 * Geteilt in zwei Hälften, und die Trennung ist der eigentliche Punkt: den
 * werbenden Teil schreibt ein Sprachmodell, den Fuß schreibt dieser Code. Was
 * in jeder Nachricht stehen muss — wer schreibt, unter welcher Anschrift,
 * woher die Adresse stammt, wie lange sie bleibt und wie man das abstellt —,
 * darf nicht davon abhängen, was ein Modell in diesem Durchlauf für passend
 * hält.
 *
 * Der Fuß erfüllt drei Pflichten auf einmal: die Anbieterkennzeichnung nach
 * § 5 DDG, die Erkennbarkeit des Absenders nach § 6 DDG und die Information
 * nach Art. 14 DSGVO, weil die Adresse aus einer öffentlichen Ausschreibung
 * stammt und nicht von der Person selbst. Die Frist ist dieselbe, die
 * `run_leadgen_cleanup()` in der Datenbank tatsächlich durchsetzt — eine
 * Zusage, die niemand einhält, wäre schlimmer als keine.
 */

/** Anschrift und Kontakt des Anbieters, wortgleich zum Impressum. */
export const SENDER_IMPRINT_LINE =
  "300 – Inhaber Roman Dering, Heilig-Kreuz-Straße 18, 87600 Kaufbeuren";
export const SENDER_PERSON = "Roman Dering";
export const IMPRINT_URL = "https://x-portal.eu/imprint";
export const PRIVACY_URL = "https://x-portal.eu/privacy";

/** Deckungsgleich mit `retention_policies.leadgen_unhandled` in der Datenbank. */
export const LEAD_RETENTION_DAYS = 90;

export type LeadMessageInput = {
  /** Der werbende Teil, ohne Anrede und ohne Grußformel. */
  body: string;
  recipientName: string | null;
  company: string | null;
  /** Adresse, unter der die Antwort und ein Widerspruch ankommen. */
  senderEmail: string;
  /** Die Ausschreibung, auf die sich die Nachricht bezieht. */
  sourceUrl: string | null;
  /** Der Abmeldelink für diesen Empfänger. Siehe `legalFooter`. */
  unsubscribeUrl?: string | null;
  /**
   * Der Link ins Portal, mit der ausgeschriebenen Rolle vorausgefüllt.
   *
   * Er entsteht hier und nicht im Modell — aus demselben Grund wie der Fuß:
   * Der Ausschreibungstext ist Fremdmaterial, und ein Modell, das daraus einen
   * Link übernimmt, setzt eine fremde Adresse in eine Nachricht, die unter
   * unserem Namen rausgeht. Die Modellanweisung verbietet Links deshalb
   * ausdrücklich; dieser eine wird angebaut.
   */
  ctaUrl?: string | null;
  /**
   * Ob Anrede und Grußformel aus dem Text entfernt werden sollen.
   *
   * Richtig für einen Modellentwurf, der beides trotz Anweisung mitliefert.
   * Falsch für einen Text, den der Betreiber selbst getippt hat: dort hätte
   * eine Wendung wie „beste Grüße nach München" mitten im Absatz alles
   * Nachfolgende stillschweigend abgeschnitten.
   */
  trimModelPhrases?: boolean;
};

/**
 * Ohne Namen keine erfundene Anrede.
 *
 * „Sehr geehrte Damen und Herren" ist bei einer Firmenadresse richtig; ein
 * geratener Nachname wäre peinlich und bei `info@`-Adressen fast immer falsch.
 */
export function salutation(
  recipientName: string | null,
  company: string | null,
): string {
  const name = recipientName?.trim();
  if (name && /^\p{L}[\p{L}\p{M}'-]+(\s+\p{L}[\p{L}\p{M}'-]+)+$/u.test(name)) {
    return `Guten Tag ${name},`;
  }
  const firma = company?.trim();
  if (firma) {
    // Die Rechtsform wegzulassen macht aus „Krongaard GmbH Team" ein
    // „Krongaard Team", das sich lesen lässt.
    const ohneRechtsform = firma
      .replace(
        /\s+(GmbH(\s*&\s*Co\.?\s*KG)?|AG|UG(\s*\(haftungsbeschränkt\))?|KG|OHG|e\.?K\.?|SE|mbH|Ltd\.?|Inc\.?|GbR)$/iu,
        "",
      )
      .trim();
    return `Guten Tag ${ohneRechtsform || firma} Team,`;
  }
  return "Sehr geehrte Damen und Herren,";
}

/**
 * Der feste Fuß. Er nennt die Quelle der Adresse konkret, weil eine pauschale
 * Angabe („aus öffentlich zugänglichen Quellen") die Auskunft nach Art. 14
 * gerade nicht erfüllt, und er nennt die Speicherdauer in Tagen statt in
 * „solange erforderlich".
 */
export function legalFooter(input: {
  senderEmail: string;
  sourceUrl: string | null;
  /**
   * Der Abmeldelink. Er steht als erste Zeile des Fußes, noch vor der
   * Anschrift: Wer bis hierher liest, sucht meistens genau ihn, und ein
   * Widerspruch, den man erst hinter drei Absätzen Fließtext findet, ist
   * keiner, den jemand ausübt.
   *
   * Optional, damit die Textbausteine für sich prüfbar bleiben. Im Versand
   * fehlt er nie: `deliverEmail()` lässt eine werbliche Nachricht ohne
   * funktionierenden Abmeldeweg gar nicht erst durch.
   */
  unsubscribeUrl?: string | null;
  retentionDays?: number;
}): string[] {
  const tage = input.retentionDays ?? LEAD_RETENTION_DAYS;
  const herkunft = input.sourceUrl
    ? `aus der von Ihnen veröffentlichten Ausschreibung (${input.sourceUrl}) beziehungsweise dem dort verlinkten Firmenprofil`
    : "aus einer von Ihnen veröffentlichten Projektausschreibung beziehungsweise dem dort verlinkten Firmenprofil";

  // Ohne Link bleibt die formlose Antwort der einzige Weg. Der Satz ändert
  // sich dann mit, statt auf etwas zu verweisen, was nicht dasteht.
  const widerspruch = input.unsubscribeUrl
    ? `Sie können der Verarbeitung jederzeit widersprechen und Auskunft, Berichtigung oder Löschung verlangen — der Abmeldelink oben genügt, eine formlose Antwort an ${input.senderEmail} ebenso. Näheres unter ${PRIVACY_URL}.`
    : `Sie können der Verarbeitung jederzeit widersprechen und Auskunft, Berichtigung oder Löschung verlangen. Eine formlose Antwort an ${input.senderEmail} genügt — danach erhalten Sie keine weitere Nachricht von mir und der Eintrag wird gelöscht. Näheres unter ${PRIVACY_URL}.`;

  return [
    "—",
    ...(input.unsubscribeUrl
      ? [`Keine Werbung mehr von XPORTAL? Ein Klick: ${input.unsubscribeUrl}`, ""]
      : []),
    SENDER_PERSON,
    SENDER_IMPRINT_LINE,
    // Absender- und Impressumsadresse sind zurzeit dieselbe. Zweimal
    // hintereinander sah nach einem Fehler aus, und das war es auch.
    input.senderEmail.trim().toLowerCase() === IMPRINT_EMAIL.toLowerCase()
      ? `${IMPRINT_EMAIL} · ${IMPRINT_URL}`
      : `${input.senderEmail} · ${IMPRINT_EMAIL} · ${IMPRINT_URL}`,
    "",
    `Woher ich Ihre Daten habe: Firmenname, Ansprechpartner und Kontaktadresse stammen ${herkunft}. Gespeichert habe ich sie zu dem Zweck, Ihnen dieses eine Angebot zu schreiben; die Grundlage dafür ist mein berechtigtes Interesse an der Anbahnung eines Geschäfts (Art. 6 Abs. 1 lit. f DSGVO). Ohne Antwort lösche ich den Eintrag nach ${tage} Tagen automatisch.`,
    widerspruch,
  ];
}

/**
 * Die eigene Domain und die Adresse des Absenders. Alles andere hat im
 * Werbetext nichts verloren.
 */
const ERLAUBTE_HOSTS = ["x-portal.eu", "www.x-portal.eu"];

const LINK_PATTERN = /https?:\/\/[^\s<>"]+/giu;
const MAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/giu;

/**
 * Ein Satzzeichen am Ende gehört nicht zur Adresse. Ohne diesen Schnitt läse
 * die Prüfung „roman@dering.info." als fremde Adresse und hielte den eigenen
 * Absender auf — dieselbe Falle wie bei `leadSourceUrl`.
 */
function ohneSatzzeichen(wert: string): string {
  return wert.replace(/[).,;:!?"'»]+$/u, "");
}

/**
 * Prüft, ob ein Modelltext ohne menschliche Sicht verschickt werden darf.
 *
 * Der Ausschreibungstext ist Fremdmaterial von einer Projektbörse. Wer ihn
 * dort einstellt, kann eine Anweisung hineinschreiben — und ein Modell, das
 * ihr folgt, würde eine fremde Adresse oder einen fremden Link in die
 * Nachricht setzen, die dann unter unserem Namen an den Empfänger geht.
 *
 * Beim Einzelversand liest der Betreiber den Text, bevor er auf Senden
 * drückt; da ist das abgedeckt. Beim Stapel liest niemand mit, deshalb gilt
 * dort die einfachste haltbare Regel: der Werbetext enthält überhaupt keine
 * Adresse und keinen Link außer denen auf die eigene Domain. Er braucht
 * auch keine — die Quelle steht im Fuß, und der entsteht in diesem Modul.
 */
export function unattendedBodyIssue(
  body: string,
  senderEmail: string,
): string | null {
  for (const roh of body.match(LINK_PATTERN) ?? []) {
    const treffer = ohneSatzzeichen(roh);
    let host: string;
    try {
      host = new URL(treffer).hostname.toLowerCase();
    } catch {
      return "Der Text enthält eine unlesbare Adresse.";
    }
    if (!ERLAUBTE_HOSTS.includes(host)) {
      return `Der Text verweist auf ${host} — beim Stapelversand sind nur Links auf die eigene Domain zugelassen.`;
    }
  }

  for (const roh of body.match(MAIL_PATTERN) ?? []) {
    const treffer = ohneSatzzeichen(roh);
    if (treffer.toLowerCase() !== senderEmail.trim().toLowerCase()) {
      return `Der Text nennt die fremde Adresse ${treffer} — beim Stapelversand ist nur die Absenderadresse zugelassen.`;
    }
  }

  return null;
}

/**
 * Setzt Anrede, Text, Handlungsaufforderung und Fuß zusammen.
 *
 * Der Modelltext wird dabei entschärft: eine Anrede oder Grußformel, die es
 * trotz Anweisung mitgeliefert hat, stünde sonst doppelt.
 *
 * Die Grußformel nennt neben dem Namen das Portal. Aus den ersten hundert
 * Nachrichten kam die Rückmeldung, dass mindestens ein Empfänger den
 * Suchassistenten für den Absender persönlich hielt und ihn im Chat mit Namen
 * ansprach. Das ist kein Einzelfehler, sondern eine Folge des Aufbaus: Wenn
 * eine Nachricht durchgehend „ich" sagt und nirgends erklärt, dass dahinter
 * ein Werkzeug steht, ist die Verwechslung die naheliegende Lesart.
 */
export function buildLeadEmail(input: LeadMessageInput): string {
  const body =
    input.trimModelPhrases === false
      ? input.body.trim()
      : stripSalutationAndSignoff(input.body);
  return [
    salutation(input.recipientName, input.company),
    "",
    body,
    ...(input.ctaUrl
      ? [
          "",
          "Ihre Rolle ist im Portal schon eingetragen — Profile ansehen:",
          input.ctaUrl,
        ]
      : []),
    "",
    "Viele Grüße",
    `${SENDER_PERSON} — XPORTAL`,
    "",
    ...legalFooter({
      senderEmail: input.senderEmail,
      sourceUrl: input.sourceUrl,
      unsubscribeUrl: input.unsubscribeUrl,
    }),
  ].join("\n");
}

/**
 * Der Link ins Portal, mit der ausgeschriebenen Rolle als Suchbegriff.
 *
 * Der bisherige Abschluss war eine Frage („Darf ich Ihnen ein Profil
 * schicken?"). Sie verlangt eine Antwort und danach Warten — bei sieben
 * Antworten auf hundert Nachrichten ist das der Engpass, nicht der Wortlaut
 * davor. Ein Link kostet einen Klick und zeigt sofort etwas.
 *
 * Nur die Überschrift der Ausschreibung wandert hinein, nicht der ganze Text:
 * Sie ist der Teil, den der Empfänger selbst formuliert hat, und alles Weitere
 * würde die Adresse unlesbar lang machen.
 */
export function leadSearchUrl(input: {
  origin: string;
  headline: string;
}): string | null {
  const rolle = input.headline.trim().slice(0, 120);
  if (!rolle) return null;
  try {
    const url = new URL("/chat", input.origin);
    url.searchParams.set("q", rolle);
    return url.toString();
  } catch {
    return null;
  }
}

const SALUTATION_PATTERN =
  /^\s*(sehr geehrte[rs]?\b[^\n]*|guten tag\b[^\n]*|hallo\b[^\n]*|liebe[rs]?\b[^\n]*)[,:]?\s*\n+/iu;
const SIGNOFF_PATTERN =
  /\n+\s*(viele grüße|beste grüße|mit freundlichen grüßen|herzliche grüße|freundliche grüße)[^]*$/iu;

export function stripSalutationAndSignoff(body: string): string {
  return body
    .replace(SALUTATION_PATTERN, "")
    .replace(SIGNOFF_PATTERN, "")
    .trim();
}
