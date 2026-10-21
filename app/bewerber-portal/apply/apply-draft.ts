/**
 * Das Formular vor der Anmeldung (21.10.2026).
 *
 * Bis dahin stand das Konto vor dem Formular: Anmelden, Mail bestätigen,
 * zurückkommen, erst dann ausfüllen. Jetzt füllt man zuerst aus; beim Absenden
 * öffnet sich die Anmeldung, und die Angaben warten so lange im Browser. Nach
 * der Rückkehr (Google, LinkedIn oder der Link aus der Mail) schickt das
 * Formular sie ab. Ohne Server, ohne Datenbank: Was nie abgeschickt wird,
 * verlässt den Browser nicht.
 */

import { CURRENCIES, WORK_MODES, type AvailabilityStatus, type WorkMode } from "@/lib/freelancer/limits";

export const APPLY_DRAFT_KEY = "xportal.apply-draft.v1";
/** Ein Tag reicht für die Mail-Bestätigung; danach fängt man neu an. */
const MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export const RATE_KINDS = ["monthly", "hourly", "daily"] as const;
export type RateKind = (typeof RATE_KINDS)[number];

/** Was das Formular fragt; „ab Datum“ ist verfügbar mit Datum. */
export const AVAILABILITY_CHOICES = ["now", "from", "limited"] as const;
export type AvailabilityChoice = (typeof AVAILABILITY_CHOICES)[number];

export type ApplyDraft = {
  fullName: string;
  roleTitle: string;
  rateKind: RateKind;
  rate: string;
  currency: (typeof CURRENCIES)[number];
  skills: string[];
  languages: string[];
  workModes: WorkMode[];
  availability: AvailabilityChoice;
  availabilityFrom: string;
  locationText: string;
  experienceSummary: string;
  consent: boolean;
  consentSearchIndex: boolean;
  consentMarketStats: boolean;
};

export function availabilityFields(choice: AvailabilityChoice, from: string): { availabilityStatus: AvailabilityStatus; availabilityFrom: string } {
  if (choice === "limited") return { availabilityStatus: "limited", availabilityFrom: "" };
  return { availabilityStatus: "available", availabilityFrom: choice === "from" ? from : "" };
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
const list = (value: unknown, max: number) =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.length <= 80).slice(0, max) : [];
const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;

export function serializeApplyDraft(draft: ApplyDraft, now = Date.now()): string {
  return JSON.stringify({ at: now, draft });
}

/** Liest einen gemerkten Entwurf; alles Unpassende zählt als keiner. */
export function parseApplyDraft(raw: string | null, now = Date.now()): ApplyDraft | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { at, draft } = parsed as { at?: unknown; draft?: unknown };
  if (typeof at !== "number" || now - at < 0 || now - at > MAX_AGE_MS) return null;
  if (!draft || typeof draft !== "object") return null;
  const value = draft as Record<string, unknown>;
  const fullName = text(value.fullName, 120).trim();
  if (fullName.length < 2) return null;
  return {
    fullName,
    roleTitle: text(value.roleTitle, 160),
    rateKind: oneOf(value.rateKind, RATE_KINDS, "daily"),
    rate: text(value.rate, 20),
    currency: oneOf(value.currency, CURRENCIES, "EUR"),
    skills: list(value.skills, 40),
    languages: list(value.languages, 20),
    workModes: list(value.workModes, 3).filter((mode): mode is WorkMode => (WORK_MODES as readonly string[]).includes(mode)),
    availability: oneOf(value.availability, AVAILABILITY_CHOICES, "now"),
    availabilityFrom: /^\d{4}-\d{2}-\d{2}$/u.test(text(value.availabilityFrom, 10)) ? text(value.availabilityFrom, 10) : "",
    locationText: text(value.locationText, 160),
    experienceSummary: text(value.experienceSummary, 2_000),
    consent: value.consent === true,
    consentSearchIndex: value.consentSearchIndex === true,
    consentMarketStats: value.consentMarketStats === true,
  };
}
