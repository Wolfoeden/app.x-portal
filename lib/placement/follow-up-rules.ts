/**
 * Wann XPORTAL nach einer Vorstellung nachfragt und was eine Antwort heißt.
 *
 * Nach der Vorstellung verabreden Kunde und Freelancer alles Weitere
 * untereinander, am Kalender vorbei. Ob es zu einer Beauftragung kam, erfährt
 * XPORTAL nur, wenn jemand es sagt. Deshalb zwei Nachfragen, nach 14 und nach
 * 45 Tagen, an beide Seiten, mit drei Antworten zum Anklicken.
 */

export const PLACEMENT_OUTCOMES = ["engaged", "talking", "no_engagement"] as const;
export type PlacementOutcome = (typeof PLACEMENT_OUTCOMES)[number];

export function isPlacementOutcome(value: unknown): value is PlacementOutcome {
  return typeof value === "string" && (PLACEMENT_OUTCOMES as readonly string[]).includes(value);
}

export const PLACEMENT_OUTCOME_LABELS: Readonly<Record<PlacementOutcome, string>> = {
  engaged: "Ja, beauftragt",
  talking: "Noch im Gespräch",
  no_engagement: "Nein, keine Zusammenarbeit",
};

/** Tage nach der Vorstellung, an denen nachgefragt wird. */
export const FOLLOW_UP_DAYS = [14, 45] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const INTRODUCED = new Set(["ready_to_book", "booked", "completed"]);

export type FollowUpCandidate = {
  status: string;
  confirmedAt: string | null;
  outcome: PlacementOutcome | null;
  followUpCount: number;
  hasEngagement: boolean;
};

/**
 * Welche Nachfrage fällig ist: 1, 2 oder keine.
 *
 * Keine, sobald feststeht, wie es ausging: bei einer erfassten Beauftragung,
 * bei „beauftragt“ (dann ist der Betreiber dran, nicht der Kunde) und bei
 * „keine Zusammenarbeit“. „Noch im Gespräch“ hält die zweite Nachfrage nicht
 * auf; genau dafür ist sie da.
 */
export function followUpDue(candidate: FollowUpCandidate, now: Date): 1 | 2 | null {
  if (!INTRODUCED.has(candidate.status) || !candidate.confirmedAt) return null;
  if (candidate.hasEngagement) return null;
  if (candidate.outcome === "engaged" || candidate.outcome === "no_engagement") return null;
  const introducedAt = new Date(candidate.confirmedAt).getTime();
  if (Number.isNaN(introducedAt)) return null;
  const next = candidate.followUpCount;
  if (next >= FOLLOW_UP_DAYS.length) return null;
  const dueAt = introducedAt + FOLLOW_UP_DAYS[next] * DAY_MS;
  return now.getTime() >= dueAt ? ((next + 1) as 1 | 2) : null;
}

/**
 * Ob eine neue Antwort die bisherige ersetzt.
 *
 * „Beauftragt“ gewinnt immer; es ist die Antwort, an der das Honorar hängt,
 * und niemand sagt sie versehentlich. Eine spätere Antwort ersetzt sonst die
 * frühere. Ist die Beauftragung schon erfasst, ändert keine Antwort mehr
 * etwas; das klärt dann der Betreiber.
 */
export function outcomeReplaces(
  current: PlacementOutcome | null,
  next: PlacementOutcome,
  hasEngagement: boolean,
): boolean {
  if (hasEngagement) return false;
  if (current === "engaged") return next === "engaged";
  return true;
}
