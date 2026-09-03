/**
 * Der Weg, auf dem der bezahlte Plan gebucht wird.
 *
 * x-portal.eu verkauft zwei Dinge: die Gratisstufe und Enterprise. Enterprise
 * laeuft ueber einen Stripe Payment Link — 50 Euro netto beim Buchen, die
 * tatsaechliche Nutzung wird am Monatsende in Rechnung gestellt.
 *
 * Der Link steht hier und nicht in der Oberflaeche, damit die Zuordnung einer
 * Zahlung zu einem Konto an einer Stelle entschieden wird.
 */

/** Der Stripe Payment Link fuer Enterprise. Oeffentlich, kein Geheimnis. */
export const ENTERPRISE_PAYMENT_LINK = "https://buy.stripe.com/9B614m38Bb9DbuO2SMa3u02";

/**
 * Was beim Buchen sofort faellig wird, in Euro und netto. Seit September 2026
 * der volle Monatspreis statt eines symbolischen Startbetrags.
 *
 * Steht hier und nicht mehr in der Kontokarte, weil inzwischen zwei Stellen
 * denselben Betrag nennen muessen: die Karte, auf der jemand bucht, und die
 * Vertragsbestaetigung, die danach rausgeht. Zwei Zahlen von Hand waeren keine
 * Doppelung, sondern ein Widerspruch zwischen dem, was angezeigt wurde, und
 * dem, was bestaetigt wird.
 */
export const ENTERPRISE_START_EURO = 50;

/** Wer bei Fragen zur Abrechnung antwortet. */
export const ENTERPRISE_CONTACT = {
  email: "info@x-portal.eu",
  phone: "+491758934338",
  phoneDisplay: "+49 175 8934338",
  person: "Roman Dering",
} as const;

/**
 * Haengt die Kontokennung an den Zahlungslink.
 *
 * Ohne sie kommt bei Stripe eine Zahlung an, aber nichts, woran sich das
 * zugehoerige Konto erkennen laesst. Ueber die E-Mail-Adresse zu gehen ist
 * unzuverlaessig: bei einem Unternehmen zahlt oft die Buchhaltung und nicht
 * die Person, die das Konto angelegt hat.
 *
 * `client_reference_id` ist das Feld, das Stripe genau dafuer vorsieht — es
 * taucht in der Zahlung und spaeter im Webhook wieder auf. Es ergaenzt das
 * `internal_sku` aus den Produktdaten: das sagt, *was* gekauft wurde, dies
 * sagt, *wer* es gekauft hat.
 *
 * Erlaubt sind Buchstaben, Ziffern, Unterstrich und Bindestrich; eine Kennung,
 * die davon abweicht, wird weggelassen statt verstuemmelt uebertragen.
 */
export function enterprisePaymentLink(customerReference: string | null): string {
  const reference = customerReference?.trim();
  if (!reference || !/^[\w-]{1,200}$/u.test(reference)) return ENTERPRISE_PAYMENT_LINK;

  const url = new URL(ENTERPRISE_PAYMENT_LINK);
  url.searchParams.set("client_reference_id", reference);
  return url.toString();
}
