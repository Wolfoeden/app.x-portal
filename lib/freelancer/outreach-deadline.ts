/**
 * Die Frist aus Art. 14 Abs. 3 lit. a DSGVO.
 *
 * Wer Daten nicht bei der betroffenen Person selbst erhebt, muss sie
 * informieren — spätestens einen Monat nach der Erhebung. Für XPORTAL sind das
 * die Profile, die der Websuche-Agent findet: Diese Personen haben nichts
 * ausgefüllt und wissen nichts von der Plattform.
 *
 * `lib/freelancer/outreach.ts` erzeugt den Text dafür vorbildlich, verschickt
 * ihn aber bewusst nicht selbst. Damit hing die Einhaltung der Frist daran,
 * dass jemand daran denkt — genau das, was der Kommentar dort ausschließen
 * wollte. Dieses Modul macht die Frist sichtbar und rechenbar.
 *
 * Die Löschung nach 30 Tagen erledigt bereits `run_sourced_candidate_cleanup()`
 * (siehe `20260825120000_sourced_candidates.sql`). Der Schaden ist damit
 * gedeckelt — aber eine gelöschte Person ist nicht dasselbe wie eine
 * informierte, und die Information ist die Pflicht.
 */

/** Art. 14 Abs. 3 lit. a DSGVO: „innerhalb einer angemessenen Frist … längstens jedoch innerhalb eines Monats“. */
export const ART14_DEADLINE_DAYS = 30;

/** Neun Tage Vorlauf: genug, um eine Nachricht noch von Hand zu schreiben. */
export const ART14_WARNING_DAYS = 21;

export const DAY_IN_MS = 86_400_000;

export type OutreachState =
  /** Information ist raus. Nichts zu tun. */
  | "informed"
  /** Frist läuft, noch reichlich Zeit. */
  | "open"
  /** Frist läuft ab; ab hier gehört der Fall nach oben. */
  | "warning"
  /** Frist verstrichen. Die Information ist verspätet. */
  | "overdue";

export type OutreachDeadline = {
  state: OutreachState;
  /** Tage seit der Recherche, abgerundet. */
  ageDays: number;
  /** Verbleibende Tage bis zur Frist; negativ, wenn sie verstrichen ist. */
  remainingDays: number;
  /** Der Tag, an dem die Information spätestens draußen sein muss. */
  dueAt: Date | null;
};

function toDate(value: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function outreachDeadline(input: {
  sourcedAt: string | Date | null;
  outreachSentAt: string | Date | null;
  now?: Date;
}): OutreachDeadline {
  const now = input.now ?? new Date();
  const sourcedAt = toDate(input.sourcedAt);
  const sentAt = toDate(input.outreachSentAt);

  // Ohne Erhebungszeitpunkt lässt sich die Frist nicht berechnen. Das als
  // "alles in Ordnung" zu behandeln wäre die falsche Richtung: der Fall
  // gehört angesehen.
  if (!sourcedAt) {
    return {
      state: sentAt ? "informed" : "overdue",
      ageDays: 0,
      remainingDays: 0,
      dueAt: null,
    };
  }

  const dueAt = new Date(sourcedAt.getTime() + ART14_DEADLINE_DAYS * DAY_IN_MS);
  const ageDays = Math.floor((now.getTime() - sourcedAt.getTime()) / DAY_IN_MS);
  const remainingDays = Math.ceil((dueAt.getTime() - now.getTime()) / DAY_IN_MS);

  if (sentAt) return { state: "informed", ageDays, remainingDays, dueAt };
  if (ageDays >= ART14_DEADLINE_DAYS) {
    return { state: "overdue", ageDays, remainingDays, dueAt };
  }
  if (ageDays >= ART14_WARNING_DAYS) {
    return { state: "warning", ageDays, remainingDays, dueAt };
  }
  return { state: "open", ageDays, remainingDays, dueAt };
}

/** Offene Fristen nach Dringlichkeit; bereits informierte Fälle immer zuletzt. */
export function byUrgency(
  left: OutreachDeadline,
  right: OutreachDeadline,
): number {
  const rank: Record<OutreachState, number> = {
    overdue: 0,
    warning: 1,
    open: 2,
    informed: 3,
  };
  const stateDifference = rank[left.state] - rank[right.state];
  if (stateDifference !== 0) return stateDifference;
  return left.remainingDays - right.remainingDays;
}

export const OUTREACH_STATE_LABELS: Readonly<Record<OutreachState, string>> = {
  informed: "Informiert",
  open: "Frist läuft",
  warning: "Frist knapp",
  overdue: "Frist verstrichen",
};
