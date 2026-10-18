/**
 * „Gespräch vereinbaren“: Ein Unternehmen möchte mit XPORTAL sprechen,
 * statt selbst einen Projekttext einzufügen. Seit 14.10.2026 läuft das über
 * die Kontaktseite (/contact) und ihr Formular; hier stehen nur noch der
 * Kalenderlink und die Links auf die Seite.
 */

import { SALES_CONTACT } from "./sales-contact-model";

export {
  SALES_CALENDAR_CLICK_PATH,
  SALES_CALENDAR_PATH,
  SALES_CALL_ENTRIES,
  SALES_CALL_KIND,
  SALES_CALL_PATH,
  isSalesCallEntry,
  salesCallHref,
  type SalesCallEntry,
} from "./sales-call-links";

/** Wie lang das Gespräch ist — steht auf der Seite und in der Bestätigung. */
export const SALES_CALL_MINUTES = 30;

/**
 * Der Kalenderlink mit vorausgefüllten Angaben, damit niemand Name und
 * Adresse ein zweites Mal tippt. `name`, `email` und `a1` (die erste eigene
 * Frage) sind die Parameter von Calendly; andere Dienste ignorieren sie.
 * Nur https; alles andere ergibt `null`.
 */
export function salesCalendarUrl(
  base: string | null | undefined,
  prefill?: { fullName: string; email: string | null; role: string | null },
): string | null {
  let url: URL;
  try {
    url = new URL((base ?? "").trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.includes(".")) return null;
  if (prefill) {
    url.searchParams.set("name", prefill.fullName);
    if (prefill.email) url.searchParams.set("email", prefill.email);
    if (prefill.role) url.searchParams.set("a1", prefill.role);
  }
  url.searchParams.set("utm_source", "x-portal");
  return url.toString();
}

/**
 * „Erstgespräch buchen“ ohne Vorbelegung: der Kalender des Ansprechpartners,
 * direkt verlinkt und schon beim Build berechnet. Ein abweichendes
 * `SALES_CALL_URL` gilt nur serverseitig (Vorbelegung, freie Termine auf
 * /praxis); wer den Kalender wechselt, ändert `SALES_CONTACT.calendarUrl`.
 */
export const SALES_CALENDAR_HREF = salesCalendarUrl(SALES_CONTACT.calendarUrl) ?? SALES_CONTACT.calendarUrl;
