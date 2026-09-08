/**
 * HTML zu Text — an einer Stelle und richtig.
 *
 * Drei Module haben das vorher je für sich gemacht, und alle drei hatten
 * dieselben Fehler. CodeQL hat sie gefunden, und sie sind nicht bloß formal:
 *
 * 1. `/<script[\s\S]*?<\/script>/g` **ohne `i`** lässt `<SCRIPT>` in
 *    Großbuchstaben stehen. Der Quelltext des Skripts landet dann im
 *    „Impressumstext", und dort suchen wir nach E-Mail-Adressen und nach dem
 *    Namen der Person. Wer auf seiner Seite `<SCRIPT>var a="chef@fremd.de"`
 *    schreibt, verschiebt damit unsere Entscheidung, welche Adresse zu wem
 *    gehört. Das ist der Grund, warum diese Datei existiert.
 * 2. Entities nacheinander zu ersetzen entschlüsselt zweimal: Aus
 *    `&amp;lt;` wird erst `&lt;` und dann `<`. Hier wird deshalb **in einem
 *    Durchgang** aufgelöst.
 * 3. Ein Ersetzen ohne Wiederholung lässt verschachtelte Reste stehen.
 *
 * Der Text, der hier herauskommt, wird nie wieder als HTML ausgegeben — er
 * wird nur gelesen. Deshalb ist das Ziel Vollständigkeit der Extraktion, nicht
 * Ausgabesicherheit.
 */

/** Die Entities, die auf deutschen Firmenseiten tatsächlich vorkommen. */
const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  shy: "",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
  euro: "€",
  commat: "@",
  period: ".",
  bull: "·",
  middot: "·",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

/**
 * Löst Zeichenkodierungen in **einem** Durchgang auf.
 *
 * `&commat;` und `&#64;` sind dabei kein Kuriosum: Genau so verstecken Seiten
 * ihre E-Mail-Adressen vor Sammlern. Wer sie nicht auflöst, findet die Adresse
 * nicht, die die Person selbst veröffentlicht hat.
 */
export function decodeEntities(value: string): string {
  return value.replace(
    /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/gu,
    (treffer, dezimal, hex, name) => {
      if (dezimal) {
        const code = Number(dezimal);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : treffer;
      }
      if (hex) {
        const code = Number.parseInt(hex, 16);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : treffer;
      }
      const wert = NAMED[name as string];
      return wert === undefined ? treffer : wert;
    },
  );
}

/**
 * Entfernt einen Elementtyp samt Inhalt, unabhängig von der Schreibweise.
 *
 * Wiederholt, bis nichts mehr wegfällt: `<scr<script>ipt>` liefe sonst durch
 * einen einzelnen Durchgang und stünde danach als `<script>` da.
 */
function stripElement(html: string, tag: string): string {
  const muster = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "giu");
  let vorher = html;
  for (let runde = 0; runde < 5; runde += 1) {
    const nachher = vorher.replace(muster, " ");
    if (nachher === vorher) return nachher;
    vorher = nachher;
  }
  return vorher;
}

/** Der Inhalt einer Seite als Zeilen, ohne Auszeichnung. */
export function htmlToLines(html: string): string[] {
  return htmlToText(html, "\n")
    .split("\n")
    .map((zeile) => zeile.trim())
    .filter(Boolean);
}

/**
 * Der Inhalt einer Seite als Fließtext.
 *
 * `separator` bestimmt, was aus einem Element wird: ein Zeilenumbruch, wenn
 * die Gliederung gebraucht wird (Skills untereinander), ein Leerzeichen, wenn
 * der Text am Stück gelesen wird (Impressum).
 */
export function htmlToText(html: string, separator = " "): string {
  let text = html;
  for (const tag of ["script", "style", "template", "noscript", "svg"]) {
    text = stripElement(text, tag);
  }
  // Kommentare können ebenfalls Adressen enthalten, sind aber nicht sichtbar
  // veröffentlicht — was dort steht, hat die Person nicht gezeigt.
  text = text.replace(/<!--[\s\S]*?-->/gu, " ");
  text = text.replace(/<[^>]*>/gu, separator);
  // Erst jetzt entschlüsseln: Sonst könnte ein `&lt;script&gt;` im Quelltext
  // nach dem Auflösen wie ein Element aussehen, das keines mehr ist.
  text = decodeEntities(text);
  return separator === "\n" ? text : text.replace(/\s+/gu, " ").trim();
}
