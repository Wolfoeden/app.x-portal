import "server-only";

import { berlinDate, calendlyEventPath, pickCallSlots, type CalendarDay, type CallSlot } from "./call-slots-model";
import { salesCallUrl } from "./sales-call";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TIMEOUT_MS = 2500;
const RANGE_DAYS = 14;

/**
 * Die nächsten freien Zeiten aus dem eigenen Calendly-Kalender, für die
 * Terminkarte der Praxisseite. Gefragt wird vom Server aus, über die
 * öffentlichen Angaben der Buchungsseite; der Browser des Besuchers spricht
 * erst mit Calendly, wenn er eine Zeit anklickt (Datenschutzhinweise,
 * Abschnitt 6: kein eingebetteter Kalender).
 *
 * Wirft nie. Ohne Kalender, bei einem anderen Anbieter oder wenn Calendly
 * nicht antwortet, gibt es keine Zeiten; die Karte zeigt dann nur den
 * Knopf zum Kalender.
 */
export async function nextCallSlots(now: Date = new Date()): Promise<CallSlot[]> {
  const path = calendlyEventPath(salesCallUrl());
  if (!path) return [];
  try {
    const lookup = await fetch(
      `https://calendly.com/api/booking/event_types/lookup?event_type_slug=${path.event}&profile_slug=${path.profile}`,
      { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!lookup.ok) return [];
    const uuid = ((await lookup.json()) as { uuid?: unknown }).uuid;
    if (typeof uuid !== "string" || !UUID.test(uuid)) return [];

    const start = berlinDate(now);
    const end = berlinDate(new Date(now.getTime() + RANGE_DAYS * 24 * 60 * 60 * 1000));
    const range = await fetch(
      `https://calendly.com/api/booking/event_types/${uuid}/calendar/range?timezone=Europe%2FBerlin&diagnostics=false&range_start=${start}&range_end=${end}`,
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!range.ok) return [];
    const days = ((await range.json()) as { days?: unknown }).days;
    return Array.isArray(days) ? pickCallSlots(days as CalendarDay[], now) : [];
  } catch {
    return [];
  }
}
