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
  retentionDays?: number;
}): string[] {
  const tage = input.retentionDays ?? LEAD_RETENTION_DAYS;
  const herkunft = input.sourceUrl
    ? `aus der von Ihnen veröffentlichten Ausschreibung (${input.sourceUrl}) beziehungsweise dem dort verlinkten Firmenprofil`
    : "aus einer von Ihnen veröffentlichten Projektausschreibung beziehungsweise dem dort verlinkten Firmenprofil";

  return [
    "—",
    SENDER_PERSON,
    SENDER_IMPRINT_LINE,
    `${input.senderEmail} · ${IMPRINT_EMAIL} · ${IMPRINT_URL}`,
    "",
    `Woher ich Ihre Daten habe: Firmenname, Ansprechpartner und Kontaktadresse stammen ${herkunft}. Gespeichert habe ich sie zu dem Zweck, Ihnen dieses eine Angebot zu schreiben; die Grundlage dafür ist mein berechtigtes Interesse an der Anbahnung eines Geschäfts (Art. 6 Abs. 1 lit. f DSGVO). Ohne Antwort lösche ich den Eintrag nach ${tage} Tagen automatisch.`,
    `Sie können der Verarbeitung jederzeit widersprechen und Auskunft, Berichtigung oder Löschung verlangen. Eine formlose Antwort an ${input.senderEmail} genügt — danach erhalten Sie keine weitere Nachricht von mir und der Eintrag wird gelöscht. Näheres unter ${PRIVACY_URL}.`,
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
 * Setzt Anrede, Text und Fuß zusammen.
 *
 * Der Modelltext wird dabei entschärft: eine Anrede oder Grußformel, die es
 * trotz Anweisung mitgeliefert hat, stünde sonst doppelt.
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
    "",
    "Viele Grüße",
    SENDER_PERSON,
    "",
    ...legalFooter({
      senderEmail: input.senderEmail,
      sourceUrl: input.sourceUrl,
    }),
  ].join("\n");
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
