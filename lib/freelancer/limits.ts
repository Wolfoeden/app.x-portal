/**
 * Plain constants shared by the browser form, the server routes and the
 * database contract. Kept free of zod so the public application page does not
 * ship a validation library it never runs.
 */

export const APPLICATION_STATUSES = [
  "submitted",
  "in_review",
  "approved",
  "rejected",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const WORK_MODES = ["remote", "on_site", "hybrid"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const AVAILABILITY_STATUSES = [
  "available",
  "limited",
  "unavailable",
  "unknown",
] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const CURRENCIES = ["EUR", "USD", "GBP"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const VERIFICATION_STATUSES = [
  "unverified",
  "identity_checked",
  "references_checked",
  "operator_verified",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const INTRO_POLICIES = ["free", "manual_approval"] as const;
export type IntroPolicy = (typeof INTRO_POLICIES)[number];

/**
 * The same private bucket the published-profile download flow uses
 * (`FREELANCER_CV_BUCKET` in lib/data/freelancer-cvs.ts, which is server-only
 * and therefore not importable here). Applications live under an `incoming/`
 * prefix; an approved CV is copied to `<profile-uuid>/cv-v<version>.pdf`.
 *
 * PDF-only at 10 MiB because that is what the bucket accepts and what
 * `freelancer_cv_documents` can hold — a DOCX could be reviewed but never
 * published.
 */
export const CV_BUCKET = "freelancer-cvs";
export const CV_MAX_BYTES = 10_485_760;

export const CV_MIME_TYPES = ["application/pdf"] as const;
export type CvMimeType = (typeof CV_MIME_TYPES)[number];

/**
 * `freelancer_profiles` allows at most 40 entries per provenance column. The
 * form limits are chosen so a reviewer can promote every claim without hitting
 * that ceiling.
 */
/**
 * The catalogue column allows 4000 characters, but `TextFactSchema` in
 * `lib/domain/profile.ts` parses the summary back at 2000. A longer value would
 * fail the schema for every catalogue read, so the shorter limit is the real
 * one.
 */
export const MAX_SUMMARY_LENGTH = 2_000;

export const MAX_SKILLS = 25;
export const MAX_LANGUAGES = 8;
export const MAX_QUALIFICATIONS = 8;
export const MAX_INDUSTRIES = 8;
export const MAX_FACTS_PER_COLUMN = 40;

export const WORK_MODE_LABELS: Readonly<Record<WorkMode, string>> = {
  remote: "Remote",
  on_site: "Vor Ort",
  hybrid: "Hybrid",
};

export const AVAILABILITY_LABELS: Readonly<
  Record<AvailabilityStatus, string>
> = {
  available: "Verfügbar",
  limited: "Eingeschränkt verfügbar",
  unavailable: "Nicht verfügbar",
  unknown: "Noch offen",
};

export const APPLICATION_STATUS_LABELS: Readonly<
  Record<ApplicationStatus, string>
> = {
  submitted: "Neu",
  in_review: "In Prüfung",
  approved: "Freigegeben",
  rejected: "Abgelehnt",
};
