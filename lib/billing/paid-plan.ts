/**
 * Wer zahlt, bucht direkt.
 *
 * Im Vermittlungsmodell läuft der Weg zum Freelancer über eine Anfrage, und
 * XPORTAL stellt vor. Kunden mit einem bezahlten Tarif sollen diesen Umweg
 * nicht gehen müssen: Sie öffnen den Kalender des Freelancers direkt. Alle
 * anderen fragen über XPORTAL an.
 *
 * Ohne Server und ohne zod, weil die Chat-Oberfläche im Browser dieselbe
 * Regel braucht wie die Buchungsroute.
 */

export const PAID_PLAN_IDS = [
  "basic",
  "pro",
  "business",
  "enterprise",
  "enterprise_flex",
  "enterprise_legacy",
] as const;

/**
 * Abo-Zustände von Stripe, in denen kein bezahlter Zugang mehr besteht.
 * `past_due` zählt noch: Die Zahlung wird gerade erneut versucht, und eine
 * Sperre mitten in einer Suche wäre unverhältnismäßig.
 */
const ENDED_STATUSES = new Set(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]);

/**
 * Ein bezahlter Tarif mit laufendem Abo. Enterprise wird per Rechnung
 * abgerechnet und hat oft keinen Stripe-Status; dann zählt der Tarif allein.
 */
export function hasPaidAccess(planId: string | null | undefined, subscriptionStatus?: string | null): boolean {
  if (!planId || !(PAID_PLAN_IDS as readonly string[]).includes(planId)) return false;
  return !subscriptionStatus || !ENDED_STATUSES.has(subscriptionStatus);
}
