/**
 * Die Angaben, auf die sich mehrere Rechtsseiten berufen.
 *
 * Sie stehen hier und nicht in der jeweiligen Seite, weil sie sonst
 * auseinanderlaufen: Die im Impressum zugesagte Reaktionszeit ist dieselbe, die
 * auf der Kontaktseite steht, und die Fassung der AGB ist dieselbe, der jemand
 * bei der Anmeldung zustimmt. Eine Abweichung wäre hier kein Schönheitsfehler,
 * sondern eine falsche Angabe.
 */

/** Was im Impressum als zweiter Kontaktweg zugesagt wird. */
export const CONTACT_RESPONSE_PROMISE =
  "Wir antworten in der Regel innerhalb eines Werktags.";

/**
 * Fassung und Stand der AGB. Wer zustimmt, stimmt einer bestimmten Fassung zu;
 * ohne diese Nummer ließe sich später nicht sagen, welcher.
 */
export const TERMS_VERSION = "1.0";
export const TERMS_EFFECTIVE_DATE = "28. August 2026";

/**
 * XPORTAL richtet sich ausschließlich an Unternehmer nach § 14 BGB. Der Satz
 * steht überall dort, wo jemand eine Entscheidung trifft — die Beschränkung
 * trägt nur, wenn sie vor der Bestellung sichtbar war und der Bestellweg sie
 * abfragt, nicht wenn sie allein in den AGB steht.
 */
export const BUSINESS_ONLY_NOTICE =
  "Angebot ausschließlich für Unternehmer im Sinne des § 14 BGB.";

/**
 * Die Adresse aus dem Impressum.
 *
 * Sie steht hier, weil inzwischen mehrere Stellen sie brauchen — der Fuß jeder
 * Transaktionsmail, die Kündigungsanschrift in der Vertragsbestätigung und der
 * Eingang des Kontaktformulars. Eine Mail, die eine andere Adresse nennt als
 * das Impressum, wäre keine Kleinigkeit: Sie verspräche einen Kontaktweg, den
 * es so nicht gibt.
 */
/**
 * Die Anbieterkennzeichnung, wie sie unter jeder ausgehenden Nachricht
 * steht.
 *
 * Ohne den eingetragenen Namen „300“. Der Empfänger kennt das Portal, nicht
 * das Einzelunternehmen dahinter, und eine Mail, die mit einer Zahl
 * unterschreibt, liest sich wie von einem fremden Absender.
 *
 * Die vollständige Firmierung steht weiterhin im Impressum, im Datenschutz
 * und in den AGB — dort gehört sie hin, und der Fuß jeder Mail verlinkt
 * dorthin. Die Aufteilung ist eine Abwägung und kein Versehen: § 5 DDG
 * verlangt die Firmierung in der Anbieterkennzeichnung selbst, ein Verweis
 * ist die knappere Form.
 *
 * Zwei Zeilen statt einer: Firmierung und Anschrift gehören optisch
 * getrennt, sonst entsteht die Bandwurmzeile, die den alten Fuß so
 * unleserlich gemacht hat.
 */
export const PROVIDER_NAME = "XPORTAL — Inhaber Roman Dering";
export const PROVIDER_ADDRESS = "Heilig-Kreuz-Straße 18, 87600 Kaufbeuren";

/** Beide Zeilen in der Reihenfolge, in der sie im Fuß erscheinen. */
export const PROVIDER_IMPRINT_LINES: readonly string[] = [
  PROVIDER_NAME,
  PROVIDER_ADDRESS,
];

export const IMPRINT_EMAIL = "info@x-portal.eu";
