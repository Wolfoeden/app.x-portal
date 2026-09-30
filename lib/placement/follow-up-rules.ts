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
  /**
   * Die Antworten beider Seiten, sobald sie getrennt gespeichert werden. Dann
   * gilt: Nachgefragt wird, solange eine Seite noch offen ist. Sagt der Kunde
   * „nein“, der Freelancer aber nichts, wird der Freelancer weiter gefragt;
   * genau dieser Widerspruch ist für das Honorar wichtig.
   */
  clientAnswer?: PlacementOutcome | null;
  freelancerAnswer?: PlacementOutcome | null;
};

const settled = (answer: PlacementOutcome | null | undefined) =>
  answer === "engaged" || answer === "no_engagement";

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
  if (candidate.clientAnswer !== undefined || candidate.freelancerAnswer !== undefined) {
    if (settled(candidate.clientAnswer) && settled(candidate.freelancerAnswer)) return null;
  } else if (settled(candidate.outcome)) {
    return null;
  }
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

export type RoleQuestion = {
  status: string;
  confirmedAt: string | null;
  /** Was diese Seite zuletzt gesagt hat, und wann. */
  answer: PlacementOutcome | null;
  answeredAt: string | null;
  hasEngagement: boolean;
};

/**
 * Ob in „Gespräche“ eine Frage an diese Seite offen ist: 1, 2 oder keine.
 *
 * Jede Seite wird für sich gefragt. 14 Tage nach der Vorstellung die erste
 * Frage, und wer bis zum 45. Tag nichts oder „noch im Gespräch“ gesagt hat,
 * bekommt die zweite. Eine klare Antwort dieser Seite oder eine erfasste
 * Beauftragung schließt die Frage.
 */
export function roleQuestionDue(input: RoleQuestion, now: Date): 1 | 2 | null {
  if (!INTRODUCED.has(input.status) || !input.confirmedAt || input.hasEngagement) return null;
  if (settled(input.answer)) return null;
  const introducedAt = new Date(input.confirmedAt).getTime();
  if (Number.isNaN(introducedAt)) return null;
  const first = introducedAt + FOLLOW_UP_DAYS[0] * DAY_MS;
  const second = introducedAt + FOLLOW_UP_DAYS[1] * DAY_MS;
  const time = now.getTime();
  if (time < first) return null;
  if (input.answer === null) return time >= second ? 2 : 1;
  const answeredAt = input.answeredAt ? new Date(input.answeredAt).getTime() : 0;
  return time >= second && answeredAt < second ? 2 : null;
}
