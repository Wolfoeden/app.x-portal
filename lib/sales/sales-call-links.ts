/**
 * Links auf „Gespräch buchen“. Eigenes Modul ohne zod und ohne
 * Rechtstexte, weil auch die Chat-Oberfläche im Browser darauf verlinkt.
 */

export const SALES_CALL_PATH = "/gespraech";

/** So erscheint die Anfrage im CRM; die Kontaktliste filtert nach diesem Typ. */
export const SALES_CALL_KIND = "Gesprächsanfrage (Website)";

/**
 * Woher ein Klick auf „Gespräch buchen“ kam. Steht als `?von=` in den
 * Links und wird beim Aufruf der Seite gezählt; anderes wird verworfen.
 */
export const SALES_CALL_ENTRIES = [
  "header",
  "menu",
  "hero",
  "closing",
  "role_page",
  "pricing",
  "chat",
  "profile",
  "mail",
] as const;
export type SalesCallEntry = (typeof SALES_CALL_ENTRIES)[number];

export function isSalesCallEntry(value: unknown): value is SalesCallEntry {
  return typeof value === "string" && (SALES_CALL_ENTRIES as readonly string[]).includes(value);
}

export function salesCallHref(entry: SalesCallEntry): string {
  return `${SALES_CALL_PATH}?von=${entry}`;
}
