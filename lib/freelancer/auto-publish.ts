/**
 * Sofort sichtbar (21.10.2026): Eine vollständige Bewerbung geht ohne Sichtung
 * live, als Angabe des Freelancers.
 *
 * Bis dahin wartete jedes Profil auf eine Freigabe von Hand, und niemand
 * erfuhr, wie lange. Der Katalog wuchs so langsam, wie das Team sichtete. Jetzt
 * entscheiden feste Prüfungen; was sie nicht bestehen, landet wie bisher in
 * der Warteschlange. „Von XPORTAL geprüft“ wird dadurch nichts: Das Profil
 * erscheint mit `verification_status = 'unverified'`, also als „Noch nicht von
 * XPORTAL geprüft“, und Projekte warten weiter auf ihre Freigabe.
 *
 * Rein, damit jede Prüfung ohne Datenbank testbar ist. Was die Datenbank
 * beantworten muss (Mail bestätigt, Name schon im Katalog), kommt als Kontext.
 */

import { MIN_SELF_PUBLISH_SUMMARY } from "./limits";
import {
  decisionDefaultsFromApplication,
  PublishDecisionSchema,
  type ApplicationRow,
  type PublishDecision,
} from "./application";

/** Was ein üblicher Satz ist; außerhalb sieht sich das Team die Angabe an. */
export const PLAUSIBLE_RATES_EUR = {
  hourly: { min: 40, max: 250 },
  daily: { min: 320, max: 2_000 },
} as const;


export type AutoPublishBlocker =
  | "email_unconfirmed"
  | "employment"
  | "currency"
  | "rate"
  | "role"
  | "summary"
  | "skills"
  | "languages"
  | "work_modes"
  | "unavailable"
  | "duplicate"
  | "rejected_before"
  | "incomplete";

/** Für die Bestätigung im Formular: warum das Team erst draufschaut. */
export const AUTO_PUBLISH_BLOCKER_TEXT: Record<AutoPublishBlocker, string> = {
  email_unconfirmed: "Die E-Mail-Adresse ist noch nicht bestätigt.",
  employment: "Sie suchen eine feste Stelle; solche Profile stellt das Team selbst vor.",
  currency: "Der Satz ist nicht in Euro angegeben.",
  rate: "Der Satz liegt außerhalb des üblichen Rahmens (40–250 € pro Stunde, 320–2.000 € pro Tag).",
  role: "Die Rolle fehlt.",
  summary: `„Über mich“ ist kürzer als ${MIN_SELF_PUBLISH_SUMMARY} Zeichen.`,
  skills: "Es ist keine Kompetenz angegeben.",
  languages: "Es ist keine Sprache angegeben.",
  work_modes: "Es ist keine Arbeitsform angegeben.",
  unavailable: "Das Profil ist als nicht verfügbar markiert.",
  duplicate: "Ein Profil mit diesem Namen gibt es schon; das Team ordnet es zu.",
  rejected_before: "Eine erneute Bewerbung sieht sich das Team selbst an.",
  incomplete: "Eine Angabe passt noch nicht ins Profil; das Team schaut sie sich an.",
};

export type AutoPublishContext = {
  emailConfirmed: boolean;
  /** Ein Profil dieses Kontos oder mit demselben Namen steht schon im Katalog. */
  duplicate: boolean;
  /** Das Team hat eine frühere Bewerbung dieses Kontos abgelehnt. */
  rejectedBefore: boolean;
};

export type AutoPublishOutcome =
  | { ok: true; decision: PublishDecision }
  | { ok: false; blockers: AutoPublishBlocker[] };

function rateBlocker(row: ApplicationRow): AutoPublishBlocker | null {
  if (row.currency !== "EUR") return "currency";
  const hourly = row.hourly_rate_minor === null ? null : row.hourly_rate_minor / 100;
  const daily = row.day_rate_minor === null ? null : row.day_rate_minor / 100;
  if (hourly === null && daily === null) return "rate";
  const inRange = (value: number | null, range: { min: number; max: number }) =>
    value === null || (value >= range.min && value <= range.max);
  return inRange(hourly, PLAUSIBLE_RATES_EUR.hourly) && inRange(daily, PLAUSIBLE_RATES_EUR.daily) ? null : "rate";
}

export function autoPublishDecision(row: ApplicationRow, context: AutoPublishContext): AutoPublishOutcome {
  const blockers: AutoPublishBlocker[] = [];
  if (!context.emailConfirmed) blockers.push("email_unconfirmed");
  if ((row.seeking ?? "projects") === "employment") blockers.push("employment");
  else {
    const rate = rateBlocker(row);
    if (rate) blockers.push(rate);
  }
  if (row.role_title.trim().length < 2) blockers.push("role");
  if (row.experience_summary.trim().length < MIN_SELF_PUBLISH_SUMMARY) blockers.push("summary");
  if (!row.skills.length) blockers.push("skills");
  if (!row.languages.length) blockers.push("languages");
  if (!row.work_modes.length) blockers.push("work_modes");
  if (row.availability_status === "unavailable") blockers.push("unavailable");
  if (context.duplicate) blockers.push("duplicate");
  // Eine Ablehnung soll nicht durch ein zweites Absenden aufgehoben werden.
  if (context.rejectedBefore) blockers.push("rejected_before");
  if (blockers.length) return { ok: false, blockers };

  // Dieselbe Entscheidung, die das Team auf der Prüfseite vorgeschlagen
  // bekäme, nur ohne Häkchen: nichts geprüft, kein Lebenslauf für Kunden.
  const parsed = PublishDecisionSchema.safeParse({
    ...decisionDefaultsFromApplication(row),
    verificationStatus: "unverified",
    usePhoto: false,
    reviewNotes: "Automatisch veröffentlicht: Angaben laut Freelancer.",
  });
  // Die Prüfungen oben decken das Schema ab; schlägt es dennoch fehl, sieht
  // das Team die Bewerbung, statt dass sie verloren geht.
  return parsed.success ? { ok: true, decision: parsed.data } : { ok: false, blockers: ["incomplete"] };
}

/** Notbremse ohne Deployment: `FREELANCER_AUTO_PUBLISH=off`. */
export function autoPublishEnabled(): boolean {
  return process.env.FREELANCER_AUTO_PUBLISH?.trim().toLowerCase() !== "off";
}
