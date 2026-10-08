import type { AvailabilityStatus } from "../chat-contract";

/**
 * Verfügbarkeit mit Stand statt ohne.
 *
 * Die Karte sagte bei jedem verfügbaren Profil „Grundsätzlich verfügbar“ und
 * unter den Belegen „Projektverfügbarkeit ist aktuell bestätigt“. Am
 * 28.09.2026 stammte diese Angabe bei 56 von 68 aktiven Profilen aus der Zeit
 * vor dem 14.08. — „aktuell“ war sie nicht, und niemand konnte das sehen.
 *
 * Das Datum ist `availability_updated_at`: Es wird gesetzt, wenn der
 * Freelancer sein Profil speichert oder sich Status oder Startdatum ändern.
 * Es heißt deshalb „Stand“, nicht „geprüft“.
 *
 * Das Matching bleibt davon unberührt. Es hängt bewusst nicht vom heutigen
 * Datum ab, damit ein gespeichertes Ergebnis nachvollziehbar bleibt; die
 * Frage, ob eine Angabe noch frisch ist, stellt erst die Anzeige.
 */

/** Ab wie vielen Tagen eine Angabe im Erstgespräch bestätigt werden sollte. */
export const AVAILABILITY_FRESH_DAYS = 30;

/** Der Beleg, den das Matching für „verfügbar“ vergibt (lib/domain/matching.ts). */
export const AVAILABILITY_CONFIRMED_REASON = "Projektverfügbarkeit ist aktuell bestätigt.";

const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_LABELS: Readonly<Record<AvailabilityStatus, string>> = {
  available: "Verfügbar",
  limited: "Begrenzt verfügbar",
  unavailable: "Nicht verfügbar",
  unknown: "Verfügbarkeit offen",
};

export type AvailabilityNotice = {
  /** Text des Badges, z. B. „Verfügbar · Stand 21.09.“. */
  label: string;
  /** CSS-Ton: der Status, oder `stale` für eine alte Angabe. */
  tone: AvailabilityStatus | "stale";
  /** Das Datum ausgeschrieben, für Vorlesehilfen und den Tooltip. */
  title: string | null;
  /** Ersetzt den Beleg des Matchings; `null` heißt: Beleg entfällt. */
  reason: string | null;
  /** Ein offener Punkt für das Erstgespräch, wenn die Angabe alt ist. */
  openPoint: string | null;
  /** Der Tag der Angabe, z. B. „21.09.2026“; `null` ohne Datum. */
  statedOn: string | null;
  /** Älter als {@link AVAILABILITY_FRESH_DAYS} Tage: vor einer Zusage bestätigen. */
  stale: boolean;
};

export type AvailabilityOptions = {
  /** Das angegebene Startdatum des Freelancers (ISO-Datum), falls es eines gibt. */
  availableFrom?: string | null;
  /**
   * Wer eine alte Angabe bestätigt. Im Vermittlungsmodell prüft XPORTAL die
   * Verfügbarkeit vor der Vorstellung (Audit F05); sonst klärt es der Kunde
   * im Erstgespräch.
   */
  confirmedBy?: "call" | "introduction";
};

function validDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** „21.09.“ im laufenden Jahr, sonst „15.12.2025“. */
function dayMonth(date: Date, now: Date): string {
  if (date.getFullYear() !== now.getFullYear()) return fullDate(date);
  const text = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(date);
  return text.endsWith(".") ? text : `${text}.`;
}

function fullDate(date: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/**
 * „Frei ab 01.11.“ statt „Verfügbar“, wenn der Freelancer ein Startdatum in
 * der Zukunft angegeben hat: Der Status allein sagt über das konkrete
 * Projekt wenig (Audit F05).
 */
function statusLabelFor(status: AvailabilityStatus, availableFrom: string | null | undefined, now: Date): string {
  const from = availableFrom && /^\d{4}-\d{2}-\d{2}$/u.test(availableFrom) ? validDate(`${availableFrom}T00:00:00`) : null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!from || from <= today || (status !== "available" && status !== "limited")) return STATUS_LABELS[status];
  return `${status === "limited" ? "Begrenzt frei" : "Frei"} ab ${dayMonth(from, now)}`;
}

export function availabilityNotice(
  status: AvailabilityStatus,
  updatedAt: string | null,
  now: Date = new Date(),
  options: AvailabilityOptions = {},
): AvailabilityNotice {
  const date = validDate(updatedAt);
  const statusLabel = statusLabelFor(status, options.availableFrom, now);
  const reason = status === "available" ? AVAILABILITY_CONFIRMED_REASON : null;

  // „Offen“ hat keinen Stand, und ohne Datum lässt sich keiner nennen. Ein
  // „verfügbar“ ohne Datum bleibt deshalb vorsichtig formuliert.
  if (status === "unknown" || !date) {
    return {
      label: status === "available" && statusLabel === STATUS_LABELS.available ? "Grundsätzlich verfügbar" : statusLabel,
      tone: status,
      title: null,
      reason,
      openPoint: null,
      statedOn: null,
      stale: false,
    };
  }

  const stand = `Stand ${dayMonth(date, now)}`;
  const title = `Angabe vom ${fullDate(date)}`;
  const ageDays = Math.floor((now.getTime() - date.getTime()) / DAY_MS);
  const stale = ageDays > AVAILABILITY_FRESH_DAYS && status !== "unavailable";

  if (!stale) {
    return {
      label: `${statusLabel} · ${stand}`,
      tone: status,
      title,
      reason: status === "available" ? `Als verfügbar angegeben am ${fullDate(date)}.` : null,
      openPoint: null,
      statedOn: fullDate(date),
      stale: false,
    };
  }

  return {
    label: `${statusLabel} · ${stand}`,
    tone: "stale",
    title,
    reason: null,
    openPoint:
      options.confirmedBy === "introduction"
        ? `Verfügbarkeit zuletzt am ${fullDate(date)} angegeben; im Erstgespräch bestätigen lassen.`
        : `Verfügbarkeit zuletzt am ${fullDate(date)} angegeben; im Erstgespräch bestätigen lassen.`,
    statedOn: fullDate(date),
    stale: true,
  };
}
