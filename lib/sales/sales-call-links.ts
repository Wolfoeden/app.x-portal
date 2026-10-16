/**
 * Links auf „Gespräch vereinbaren“. Eigenes Modul ohne zod und ohne
 * Rechtstexte, weil auch die Chat-Oberfläche im Browser darauf verlinkt.
 *
 * Seit 14.10.2026 gibt es dafür keine eigene Seite mehr: „Gespräch
 * vereinbaren“ und „Kontakt“ führen auf dieselbe Kontaktseite. Die alte
 * Adresse /gespraech leitet dorthin weiter (next.config.ts).
 */

export const SALES_CALL_PATH = "/contact";

/** Der Kalenderknopf der Kontaktseite: zählt den Klick, leitet zum Kalender. */
export const SALES_CALENDAR_PATH = "/contact/termin";

/** So erscheint die Anfrage im CRM; die Kontaktliste filtert nach diesem Typ. */
export const SALES_CALL_KIND = "Gesprächsanfrage (Website)";

/**
 * Woher ein Klick auf „Gespräch vereinbaren“ oder „Erstgespräch buchen“ kam.
 * Steht als `?von=` in den Links und wird beim Aufruf der Kontaktseite und
 * beim Öffnen des Kalenders (/contact/termin) gezählt; anderes wird
 * verworfen.
 */
export const SALES_CALL_ENTRIES = [
  "header",
  "menu",
  "hero",
  "process",
  "roles",
  "closing",
  "role_page",
  "pricing",
  "chat",
  "profile",
  "mail",
  "footer",
  "praxis",
] as const;
export type SalesCallEntry = (typeof SALES_CALL_ENTRIES)[number];

export function isSalesCallEntry(value: unknown): value is SalesCallEntry {
  return typeof value === "string" && (SALES_CALL_ENTRIES as readonly string[]).includes(value);
}

/**
 * Von den Seiten zum Talent Index geht es um Freelancer; die Kontaktseite
 * wählt dieses Thema dann vor und zeigt die passende Überschrift.
 */
export function salesCallHref(entry: SalesCallEntry): string {
  return `${SALES_CALL_PATH}?thema=freelancer&von=${entry}`;
}
