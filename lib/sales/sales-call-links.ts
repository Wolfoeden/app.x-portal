/**
 * Links auf „Gespräch vereinbaren“. Eigenes Modul ohne zod und ohne
 * Rechtstexte, weil auch die Chat-Oberfläche im Browser darauf verlinkt.
 *
 * Seit 14.10.2026 gibt es dafür keine eigene Seite mehr: „Gespräch
 * vereinbaren“ und „Kontakt“ führen auf dieselbe Kontaktseite. Die alte
 * Adresse /gespraech leitet dorthin weiter (next.config.ts).
 */

export const SALES_CALL_PATH = "/contact";

/**
 * Der Kalender mit Vorbelegung nach einer Anfrage (`?t=` aus der
 * Bestätigung): liest Name und Adresse zum Token und leitet weiter.
 */
export const SALES_CALENDAR_PATH = "/contact/termin";

/**
 * Seit 18.10.2026 öffnet „Erstgespräch buchen“ den Kalender direkt (der
 * Umweg über /contact/termin dauerte bis zu sechs Sekunden); den Klick meldet
 * der Browser nebenher an diese Route.
 */
export const SALES_CALENDAR_CLICK_PATH = "/api/sales-call/click";

/** Der Aufruf der (statischen) Kontaktseite, gemeldet vom Browser. */
export const SALES_CALL_VIEW_PATH = "/api/sales-call/view";

/** So erscheint die Anfrage im CRM; die Kontaktliste filtert nach diesem Typ. */
export const SALES_CALL_KIND = "Gesprächsanfrage (Website)";

/**
 * Woher ein Klick auf „Gespräch vereinbaren“ oder „Erstgespräch buchen“ kam.
 * Steht als `?von=` in den Links zur Kontaktseite und wird beim Aufruf
 * gezählt, ebenso beim Klick auf den Kalender; anderes wird verworfen.
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
  "contact",
] as const;
export type SalesCallEntry = (typeof SALES_CALL_ENTRIES)[number];

export function isSalesCallEntry(value: unknown): value is SalesCallEntry {
  return typeof value === "string" && (SALES_CALL_ENTRIES as readonly string[]).includes(value);
}

/**
 * Von den Seiten zum Talent Index geht es um Freelancer: die Kontaktseite
 * zu diesem Thema, mit passender Überschrift und Vorauswahl.
 */
export function salesCallHref(entry: SalesCallEntry): string {
  return `${SALES_CALL_PATH}/freelancer?von=${entry}`;
}
