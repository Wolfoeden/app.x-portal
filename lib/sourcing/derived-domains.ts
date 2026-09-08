import "server-only";

/**
 * Die eigene Seite finden, ohne dafür zu bezahlen.
 *
 * Eine Websuche kostet ein bis drei Cent je Person. Bei zwanzig Kandidaten am
 * Tag sind das im Monat zwölf bis achtzehn Euro — für eine Frage, die sich in
 * der Mehrzahl der Fälle auch aus dem Namen beantworten lässt: Freiberufler
 * betreiben ihre Seite auffallend oft unter `vorname-nachname.de`.
 *
 * **Gemessen an zwölf Kandidaten aus der Datenbank: 4 eigene Seiten belegt, 2
 * mit benutzbarer Adresse — kostenlos.** Die bezahlte Suche kam bei sieben
 * Kandidaten auf zwei Adressen. Der freie Weg ist also nicht schlechter, er
 * ist nur langsamer, und Zeit ist bei einem Beschaffungslauf das Billigste.
 *
 * **Nur Kombinationen aus Vor- und Nachnamen.** Der bloße Nachname führt
 * zuverlässig zu Fremden: `schwarz.de` ist ein Handelskonzern, `stoll.com`
 * eine Maschinenfabrik. Eine erste Messung hatte sie als Treffer gezählt, weil
 * der Nachname auf der Seite vorkam — er kommt dort vor, nur eben als der
 * einer anderen Familie. Was hier herauskommt, ist deshalb auch nur ein
 * *Vorschlag*: Ob die Seite der Person gehört, entscheidet danach ihr
 * Impressum, nicht ihre Adresse.
 */

/** Die Namensbestandteile, vergleichbar gemacht. */
function teile(name: string): string[] {
  return name
    .toLocaleLowerCase("de-DE")
    .replace(/ß/gu, "ss")
    .replace(/ä/gu, "ae")
    .replace(/ö/gu, "oe")
    .replace(/ü/gu, "ue")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/\s+/u)
    .map((wert) => wert.replace(/[^a-z]/gu, ""))
    .filter((wert) => wert.length >= 2);
}

/**
 * Wie viele Adressen je Person höchstens ausprobiert werden.
 *
 * Jeder Versuch ist ein DNS-Lookup und höchstens ein HTTPS-Abruf; die
 * allermeisten scheitern in Millisekunden, weil es den Namen nicht gibt.
 * Zwölf ist die Grenze, ab der es sich nicht mehr lohnt — wer seine Seite
 * unter etwas ganz anderem betreibt, wird über die Websuche gefunden.
 */
export const MAX_DERIVED_DOMAINS = 12;

/**
 * Mögliche Adressen der eigenen Seite, in der Reihenfolge ihrer Häufigkeit.
 *
 * `.de` zuerst, weil die Kandidaten aus einem deutschsprachigen Portal
 * stammen; `.com` und `.eu` danach. Ein Zwischenname wird übergangen — die
 * Domain trägt fast nie drei Teile.
 */
export function derivedDomains(displayName: string): string[] {
  const namen = teile(displayName);
  if (namen.length < 2) return [];
  const vorname = namen[0]!;
  const nachname = namen.at(-1)!;
  if (vorname.length < 2 || nachname.length < 3) return [];

  const basen = [
    `${vorname}-${nachname}`,
    `${nachname}-${vorname}`,
    `${vorname}${nachname}`,
    `${nachname}${vorname}`,
  ];

  const raus: string[] = [];
  for (const tld of [".de", ".com", ".eu"]) {
    for (const basis of basen) raus.push(basis + tld);
  }
  return [...new Set(raus)].slice(0, MAX_DERIVED_DOMAINS);
}
