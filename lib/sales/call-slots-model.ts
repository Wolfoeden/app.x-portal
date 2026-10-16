import { salesCalendarUrl } from "./sales-call-model";

/**
 * Freie Zeiten für das Erstgespräch, wie sie die Praxisseite (/praxis)
 * vorschlägt: drei Werktage, je eine Zeit. Ein Klick öffnet den Kalender
 * (Calendly) direkt bei dieser Zeit; gebucht wird dort.
 *
 * Ohne Server- und Netzabhängigkeit: Die Seite im Browser baut den Link mit
 * den eingetippten Angaben, die Tests prüfen die Auswahl.
 */

export type CallSlot = {
  /** Beginn wie im Kalender, mit Versatz zu UTC: 2026-10-20T10:00:00+02:00 */
  start: string;
  /** „Di, 20.10., 10:00“ */
  label: string;
};

export type CalendarDay = {
  date: string;
  status?: string;
  spots?: readonly { status?: string; start_time?: string }[];
};

const SLOT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):00(?:[+-]\d{2}:\d{2}|Z)$/u;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;
/** Die bevorzugte Uhrzeit: vormittags, nicht zur ersten Minute. */
const PREFERRED_MINUTES = 10 * 60;

export function isSlotStart(value: unknown): value is string {
  return typeof value === "string" && SLOT.test(value);
}

/** Der Wochentag eines Kalendertags (0 = Sonntag), unabhängig von der Zeitzone. */
function weekday(date: string): number {
  const [, year, month, day] = DATE.exec(date)!;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay();
}

/** Das heutige Datum in Berlin als JJJJ-MM-TT. */
export function berlinDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function slotLabel(start: string): string {
  const [, , month, day, hour, minute] = SLOT.exec(start)!;
  return `${WEEKDAYS[weekday(start.slice(0, 10))]}, ${day}.${month}., ${hour}:${minute}`;
}

/**
 * Drei Vorschläge: die nächsten drei Werktage ab morgen mit freier Zeit, je
 * die Zeit am nächsten an 10 Uhr. Der Kalender liefert die Zeiten in der
 * Zeitzone, nach der gefragt wurde (Europe/Berlin); die Uhrzeit steht also
 * schon so im Text, wie sie auf der Seite erscheinen soll.
 */
export function pickCallSlots(days: readonly CalendarDay[], now: Date, count = 3): CallSlot[] {
  const today = berlinDate(now);
  const slots: CallSlot[] = [];
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (slots.length >= count) break;
    if (!DATE.test(day.date) || day.date <= today) continue;
    const dow = weekday(day.date);
    if (dow === 0 || dow === 6) continue;
    const starts = (day.spots ?? [])
      .filter((spot) => (spot.status ?? "available") === "available" && isSlotStart(spot.start_time) && spot.start_time.startsWith(day.date))
      .map((spot) => spot.start_time!);
    if (!starts.length) continue;
    const minutes = (start: string) => Number(start.slice(11, 13)) * 60 + Number(start.slice(14, 16));
    const best = starts.reduce((a, b) => (Math.abs(minutes(b) - PREFERRED_MINUTES) < Math.abs(minutes(a) - PREFERRED_MINUTES) ? b : a));
    slots.push({ start: best, label: slotLabel(best) });
  }
  return slots;
}

/** `https://calendly.com/<profil>/<termin>` → beide Teile; andere Links: `null`. */
export function calendlyEventPath(base: string | null | undefined): { profile: string; event: string } | null {
  let url: URL;
  try {
    url = new URL((base ?? "").trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "calendly.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] === "d") return null;
  const safe = /^[A-Za-z0-9_-]{1,80}$/u;
  if (!safe.test(parts[0]!) || !safe.test(parts[1]!)) return null;
  return { profile: parts[0]!, event: parts[1]! };
}

/**
 * Der Kalenderlink für eine bestimmte Zeit, mit den Angaben, die schon
 * eingetippt sind. Ohne Zeit (oder bei einer ungültigen) der Kalender
 * selbst.
 */
export function calendarBookingUrl(
  base: string | null | undefined,
  options: { start?: string | null; name?: string; email?: string; note?: string } = {},
): string | null {
  const calendar = salesCalendarUrl(base);
  if (!calendar) return null;
  const url = new URL(calendar);
  if (options.start && isSlotStart(options.start) && calendlyEventPath(base)) {
    url.pathname = `${url.pathname.replace(/\/+$/u, "")}/${options.start}`;
    url.searchParams.set("month", options.start.slice(0, 7));
    url.searchParams.set("date", options.start.slice(0, 10));
  }
  const name = options.name?.trim();
  const email = options.email?.trim();
  const note = options.note?.trim();
  if (name) url.searchParams.set("name", name.slice(0, 100));
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) url.searchParams.set("email", email.slice(0, 160));
  if (note) url.searchParams.set("a1", note.slice(0, 300));
  return url.toString();
}
