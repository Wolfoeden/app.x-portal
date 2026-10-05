/**
 * Freelancer self-registration.
 *
 * Everything in this module is pure so the mapping from an application to a
 * catalogue row can be tested without a database. Two rules drive the shape:
 *
 * 1. An application is a claim, not a fact. Nothing an applicant types may
 *    reach `freelancer_profiles.verified_facts`; only the reviewer promotes a
 *    single fact at a time.
 * 2. A published profile is only reachable by matching when it is `active`,
 *    `real`, bookable over HTTPS and not `unavailable` (see
 *    `fetchActiveBookableRealProfiles`). Publishing therefore *requires* a
 *    booking URL instead of silently creating an unmatchable row.
 */

import { z } from "zod";

import { MAX_PROJECTS, type ProfileProject } from "@/lib/profile/project-limits";
import { ProjectListSchema } from "@/lib/profile/project-schema";

import { candidateFacts } from "./facts";
import {
  DRAFT_LIST_FIELDS,
  DRAFT_TEXT_FIELDS,
  IMPORT_SOURCES,
  MAX_DESIRED_PROJECTS_LENGTH,
  MAX_PROVENANCE_IMPORTS,
  MAX_PROVENANCE_VALUES,
  type ImportProvenance,
} from "./import/draft";
import {
  AVAILABILITY_STATUSES,
  CURRENCIES,
  CV_MAX_BYTES,
  CV_MIME_TYPES,
  INTRO_POLICIES,
  REFERRAL_PATTERN,
  SEEKING_OPTIONS,
  MAX_FACTS_PER_COLUMN,
  MAX_INDUSTRIES,
  MAX_LANGUAGES,
  MAX_QUALIFICATIONS,
  MAX_SKILLS,
  MAX_SUMMARY_LENGTH,
  VERIFICATION_STATUSES,
  WORK_MODES,
  type ApplicationStatus,
  type AvailabilityStatus,
  type CurrencyCode,
  type IntroPolicy,
  type Seeking,
  type VerificationStatus,
  type WorkMode,
} from "./limits";

export * from "./facts";
export * from "./limits";

const tag = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    // A category prefix carries meaning in the catalogue ("Skill: React").
    // Applicants must not be able to inject one.
    .refine((value) => !value.includes(":"), {
      message: "Doppelpunkte sind hier nicht erlaubt.",
    });

const tagList = (max: number, itemLength = 80) =>
  z
    .array(tag(itemLength))
    .transform((values) => {
      const seen = new Set<string>();
      return values.filter((value) => {
        const key = value.toLocaleLowerCase("de-DE");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })
    .pipe(z.array(tag(itemLength)).max(max));

const httpsUrl = (max = 1_000) =>
  z
    .url()
    .max(max)
    .refine((value) => value.startsWith("https://"), {
      message: "Nur HTTPS-Adressen werden akzeptiert.",
    });

/** Empty, missing and null all mean "not provided" for an optional field. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

const optionalHttpsUrl = z
  .union([z.literal(""), httpsUrl()])
  .nullish()
  .transform((value) => value || null);

const optionalDate = z
  .union([z.literal(""), z.iso.date()])
  .nullish()
  .transform((value) => value || null);

/** Euro (not cent) amounts as typed in the form. */
const rateAmount = (max: number) =>
  z
    .union([z.literal(""), z.coerce.number().positive().max(max)])
    .nullish()
    .transform((value) => (typeof value === "number" ? value : null));

const rateShape = {
  hourlyRate: rateAmount(100_000),
  dayRate: rateAmount(1_000_000),
  currency: z.enum(CURRENCIES).default("EUR"),
};

/**
 * Rates and currency travel together in `freelancer_profiles`. Wer nur eine
 * Festanstellung sucht, hat keinen Stunden- oder Tagessatz; für ihn ist die
 * Angabe freiwillig.
 */
function assertRatePairing(
  value: { hourlyRate: number | null; dayRate: number | null; seeking?: Seeking },
  context: z.RefinementCtx,
) {
  if (value.seeking === "employment") return;
  if (value.hourlyRate === null && value.dayRate === null) {
    context.addIssue({
      code: "custom",
      path: ["hourlyRate"],
      message: "Bitte Stundensatz oder Tagessatz angeben.",
    });
  }
}

/**
 * Woher übernommene Angaben stammen (lib/freelancer/import/draft.ts). Eine
 * Kennzeichnung für die Sichtung, kein Nachweis: Sie setzt nie „geprüft“.
 * `github.linked` korrigiert der Server gegen die verknüpfte Identität.
 */
export const ImportProvenanceSchema = z
  .object({
    imports: z
      .array(
        z
          .object({
            source: z.enum(IMPORT_SOURCES),
            importedAt: z.string().trim().max(40),
            github: z
              .object({
                login: z.string().trim().regex(/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/iu),
                linked: z.boolean(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .max(MAX_PROVENANCE_IMPORTS),
    values: z
      .array(
        z
          .object({
            field: z.enum([...DRAFT_LIST_FIELDS, ...DRAFT_TEXT_FIELDS, "projects"]),
            value: z.string().max(200),
            source: z.enum(IMPORT_SOURCES),
          })
          .strict(),
      )
      .max(MAX_PROVENANCE_VALUES),
  })
  .strict();

/** Freiwillig: verfügbare Tage pro Woche. Leer heißt „keine Angabe“. */
const capacityDays = z
  .union([z.literal(""), z.coerce.number().int().min(1).max(5)])
  .nullish()
  .transform((value) => (typeof value === "number" ? value : null));

export const FreelancerApplicationInputSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    contactEmail: z
      .email()
      .max(160)
      .transform((value) => value.toLocaleLowerCase("en-US")),
    contactPhone: optionalText(40),
    websiteUrl: optionalHttpsUrl,
    roleTitle: z.string().trim().min(2).max(160),
    // 2000, not the column's 4000: `TextFactSchema` in lib/domain/profile.ts
    // caps the summary at 2000, and a longer one would make
    // `mapFreelancerProfileRow` throw for every catalogue read, not just this
    // profile.
    experienceSummary: z.string().trim().min(40).max(MAX_SUMMARY_LENGTH),
    skills: tagList(MAX_SKILLS),
    languages: tagList(MAX_LANGUAGES, 60),
    qualifications: tagList(MAX_QUALIFICATIONS, 160).default([]),
    industries: tagList(MAX_INDUSTRIES, 80).default([]),
    locationText: optionalText(160),
    workModes: z.array(z.enum(WORK_MODES)).min(1).max(3),
    ...rateShape,
    availabilityStatus: z.enum(AVAILABILITY_STATUSES).default("unknown"),
    availabilityFrom: optionalDate,
    // Optional since the placement model: without a calendar the client asks
    // through XPORTAL and the operator introduces both sides by mail.
    bookingUrl: optionalHttpsUrl,
    seeking: z.enum(SEEKING_OPTIONS).default("projects"),
    referral: z
      .string()
      .trim()
      .toLowerCase()
      .max(40)
      .nullish()
      .transform((value) => (value && REFERRAL_PATTERN.test(value) ? value : null)),
    applicantNote: optionalText(2_000),
    capacityDaysPerWeek: capacityDays,
    desiredProjects: optionalText(MAX_DESIRED_PROJECTS_LENGTH),
    importProvenance: ImportProvenanceSchema.nullable().default(null),
    cv: z
      .object({
        storagePath: z.string().trim().min(1).max(300),
        token: z.string().trim().regex(/^[0-9a-f]{64}$/u),
        // Same shape `freelancer_cv_documents` accepts, so an approved CV can
        // be handed to the profile without renaming it.
        originalFilename: z
          .string()
          .trim()
          .min(5)
          .max(255)
          .regex(/^[^\p{Cc}/\\]+\.pdf$/iu, {
            message: "Der Lebenslauf muss eine PDF-Datei sein.",
          }),
        mimeType: z.enum(CV_MIME_TYPES),
        sizeBytes: z.number().int().positive().max(CV_MAX_BYTES),
      })
      .strict()
      .nullable()
      .default(null),
    /** Freiwillig; „geprüft“ und Herkunft setzt der Server, nicht das Formular. */
    projects: ProjectListSchema.default([]),
    /** Freiwilliges Foto, hochgeladen über `/api/freelancer-applications/photo-upload`. */
    photo: z
      .object({
        storagePath: z.string().trim().min(1).max(300),
        token: z.string().trim().regex(/^[0-9a-f]{64}$/u),
      })
      .strict()
      .nullable()
      .default(null),
    consent: z.literal(true),
    /**
     * Das Kennzeichen aus einer Einladung, falls die Person über eine kam.
     *
     * Es entscheidet nichts an der Bewerbung selbst — sie wird mit und ohne
     * gleich behandelt. Es beantwortet nur die Frage, ob unsere Ansprache
     * gewirkt hat, und ein ungültiges wird stillschweigend übergangen.
     */
    inviteToken: z.string().trim().max(200).nullable().default(null),
    /** Honeypot: a real applicant never fills this. */
    website: z.string().max(200).default(""),
  })
  .strict()
  .superRefine((value, context) => {
    assertRatePairing(value, context);
    if (value.skills.length < 1) {
      context.addIssue({
        code: "custom",
        path: ["skills"],
        message: "Bitte mindestens einen Skill angeben.",
      });
    }
    if (value.languages.length < 1) {
      context.addIssue({
        code: "custom",
        path: ["languages"],
        message: "Bitte mindestens eine Sprache angeben.",
      });
    }
  });

export type FreelancerApplicationInput = z.infer<
  typeof FreelancerApplicationInputSchema
>;

function toMinor(amount: number | null): number | null {
  return amount === null ? null : Math.round(amount * 100);
}

export type ApplicationInsert = {
  status: ApplicationStatus;
  submitted_by_user_id: string | null;
  full_name: string;
  contact_email: string;
  contact_phone: string | null;
  website_url: string | null;
  role_title: string;
  experience_summary: string;
  skills: string[];
  languages: string[];
  qualifications: string[];
  industries: string[];
  location_text: string | null;
  /** The database CHECK constraints keep these columns inside their unions. */
  work_modes: WorkMode[];
  hourly_rate_minor: number | null;
  day_rate_minor: number | null;
  currency: CurrencyCode | null;
  availability_status: AvailabilityStatus;
  availability_from: string | null;
  booking_url: string | null;
  applicant_note: string | null;
  cv_storage_path: string | null;
  cv_original_filename: string | null;
  cv_mime_type: string | null;
  cv_size_bytes: number | null;
  consent_at: string;
  source: "apply_form";
  seeking: Seeking;
  referral: string | null;
  /** Migration 20261006100000; ohne sie lässt die Route beide Felder weg. */
  reference_projects: ProfileProject[];
  photo_storage_path: string | null;
  /** Migration 20261007090000; ohne sie lässt die Route die drei Felder weg. */
  import_provenance: ImportProvenance | null;
  capacity_days_per_week: number | null;
  desired_projects: string | null;
};

/** Was aus dem Formular kommt, ist eine Angabe: nie geprüft, Herkunft Bewerbung. */
function asApplicantProject(project: ProfileProject): ProfileProject {
  return { ...project, verified: false, source: "application", sourceUrl: null };
}

/**
 * Die gespeicherten Projekte einer Bewerbung, erneut geprüft. Eine Zeile aus
 * der Zeit vor der Migration oder mit kaputtem Inhalt liefert eine leere
 * Liste statt eines Fehlers auf der Prüfseite.
 */
export function storedApplicationProjects(value: unknown): ProfileProject[] {
  const parsed = ProjectListSchema.safeParse(value ?? []);
  return parsed.success ? parsed.data.map(asApplicantProject) : [];
}

export function applicationInsertFromInput(
  input: FreelancerApplicationInput,
  context: { submittedByUserId: string | null; consentAt: string },
): ApplicationInsert {
  const hourly = toMinor(input.hourlyRate);
  const day = toMinor(input.dayRate);

  return {
    status: "submitted",
    submitted_by_user_id: context.submittedByUserId,
    full_name: input.fullName,
    contact_email: input.contactEmail,
    contact_phone: input.contactPhone,
    website_url: input.websiteUrl,
    role_title: input.roleTitle,
    experience_summary: input.experienceSummary,
    skills: input.skills,
    languages: input.languages,
    qualifications: input.qualifications,
    industries: input.industries,
    location_text: input.locationText,
    work_modes: input.workModes,
    hourly_rate_minor: hourly,
    day_rate_minor: day,
    currency: hourly === null && day === null ? null : input.currency,
    availability_status: input.availabilityStatus,
    availability_from: input.availabilityFrom,
    booking_url: input.bookingUrl,
    applicant_note: input.applicantNote,
    cv_storage_path: input.cv?.storagePath ?? null,
    cv_original_filename: input.cv?.originalFilename ?? null,
    cv_mime_type: input.cv?.mimeType ?? null,
    cv_size_bytes: input.cv?.sizeBytes ?? null,
    consent_at: context.consentAt,
    source: "apply_form",
    seeking: input.seeking,
    referral: input.referral,
    reference_projects: input.projects.map(asApplicantProject),
    photo_storage_path: input.photo?.storagePath ?? null,
    import_provenance: input.importProvenance,
    capacity_days_per_week: input.capacityDaysPerWeek,
    desired_projects: input.desiredProjects,
  };
}

/** Die Felder aus Migration 20261007090000. */
export const ONBOARDING_INSERT_FIELDS = ["import_provenance", "capacity_days_per_week", "desired_projects"] as const;

export type ApplicationRow = Omit<
  ApplicationInsert,
  "reference_projects" | "photo_storage_path" | (typeof ONBOARDING_INSERT_FIELDS)[number]
> & {
  /** Fehlen, solange Migration 20261006100000 nicht eingespielt ist. */
  reference_projects?: unknown;
  photo_storage_path?: string | null;
  /** Fehlen, solange Migration 20261007090000 nicht eingespielt ist. */
  import_provenance?: unknown;
  capacity_days_per_week?: number | null;
  desired_projects?: string | null;
  id: string;
  review_notes: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  published_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export const APPLICATION_COLUMNS =
  "id,status,submitted_by_user_id,full_name,contact_email,contact_phone,website_url,role_title,experience_summary,skills,languages,qualifications,industries,location_text,work_modes,hourly_rate_minor,day_rate_minor,currency,availability_status,availability_from,booking_url,applicant_note,cv_storage_path,cv_original_filename,cv_mime_type,cv_size_bytes,consent_at,source,review_notes,reviewed_by_user_id,reviewed_at,published_profile_id,created_at,updated_at,seeking,referral";

/** Projekte und Foto (Migration 20261006100000), getrennt abfragbar. */
export const APPLICATION_EXTRA_COLUMNS = "reference_projects,photo_storage_path";

/** Import-Herkunft, Kapazität und Wunschprojekte (Migration 20261007090000). */
export const APPLICATION_ONBOARDING_COLUMNS = ONBOARDING_INSERT_FIELDS.join(",");

/** Die gespeicherte Herkunft, erneut geprüft; Kaputtes zählt als keine. */
export function storedImportProvenance(value: unknown): ImportProvenance | null {
  const parsed = ImportProvenanceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function slugFromName(displayName: string): string {
  const base = displayName
    // Transliterate before decomposing: NFKD splits "ä" into "a" + combining
    // mark, which would otherwise silently turn it into "a" instead of "ae".
    .replace(/ß/gu, "ss")
    .replace(/[äÄ]/gu, "ae")
    .replace(/[öÖ]/gu, "oe")
    .replace(/[üÜ]/gu, "ue")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60)
    .replace(/-+$/gu, "");

  return base || "freelancer";
}

export function slugWithAttempt(base: string, attempt: number): string {
  if (attempt <= 0) return base;
  const suffix = `-${attempt + 1}`;
  return `${base.slice(0, 60 - suffix.length).replace(/-+$/gu, "")}${suffix}`;
}

export const PublishDecisionSchema = z
  .object({
    displayName: z.string().trim().min(2).max(120),
    roleTitle: z.string().trim().min(2).max(160),
    experienceSummary: z.string().trim().min(1).max(MAX_SUMMARY_LENGTH),
    skills: tagList(MAX_SKILLS),
    languages: tagList(MAX_LANGUAGES, 60),
    qualifications: tagList(MAX_QUALIFICATIONS, 160).default([]),
    industries: tagList(MAX_INDUSTRIES, 80).default([]),
    locationText: optionalText(160),
    workModes: z.array(z.enum(WORK_MODES)).min(1).max(3),
    ...rateShape,
    availabilityStatus: z.enum(AVAILABILITY_STATUSES),
    availabilityFrom: optionalDate,
    // Optional: with the placement model on, a profile without a calendar is
    // still matched; requests reach it through the operator.
    bookingUrl: optionalHttpsUrl,
    seeking: z.enum(SEEKING_OPTIONS).default("projects"),
    introPolicy: z.enum(INTRO_POLICIES).default("free"),
    verificationStatus: z
      .enum(VERIFICATION_STATUSES)
      .default("identity_checked"),
    referencesSummary: optionalText(2_000),
    /**
     * Storing a CV for review and showing it to matched customers are two
     * different permissions, so this is an explicit second decision and
     * defaults to off — same default as `freelancer_cv_documents`.
     */
    cvDownloadable: z.boolean().default(false),
    /**
     * Welche Projekte aus der Bewerbung ins Profil gehen, nach Position in
     * der Bewerbung. Den Inhalt nimmt der Server aus der gespeicherten
     * Bewerbung, nicht aus dieser Anfrage; „geprüft“ ist die Entscheidung
     * des Teams.
     */
    projects: z
      .array(
        z
          .object({
            index: z.number().int().min(0).max(MAX_PROJECTS - 1),
            verified: z.boolean().default(false),
          })
          .strict(),
      )
      .max(MAX_PROJECTS)
      .default([])
      .transform((entries) => [...new Map(entries.map((entry) => [entry.index, entry])).values()]),
    /** Das Foto aus der Bewerbung verwenden; sonst wird es gelöscht. */
    usePhoto: z.boolean().default(false),
    verifiedFacts: z.array(z.string().trim().min(1).max(2_000)).default([]),
    slug: z
      .union([
        z.literal(""),
        z
          .string()
          .trim()
          .max(60)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
      ])
      .nullish()
      .transform((value) => value || null),
    reviewNotes: optionalText(4_000),
  })
  .strict()
  .superRefine((value, context) => {
    assertRatePairing(value, context);
    // The catalogue requires at least one entry in both columns; catching it
    // here turns a raw constraint violation into a usable message.
    if (!value.skills.length) {
      context.addIssue({
        code: "custom",
        path: ["skills"],
        message: "Ein Profil braucht mindestens einen Skill.",
      });
    }
    if (!value.languages.length) {
      context.addIssue({
        code: "custom",
        path: ["languages"],
        message: "Ein Profil braucht mindestens eine Sprache.",
      });
    }
    if (value.availabilityStatus === "unavailable") {
      context.addIssue({
        code: "custom",
        path: ["availabilityStatus"],
        message:
          "Ein Profil mit Status 'unavailable' erscheint in keiner Auswahl. Bitte vor der Freigabe korrigieren.",
      });
    }

    const allowed = new Set(candidateFacts(value).map((entry) => entry.fact));
    for (const entry of value.verifiedFacts) {
      if (!allowed.has(entry)) {
        context.addIssue({
          code: "custom",
          path: ["verifiedFacts"],
          message: `Unbekannte Angabe: ${entry}`,
        });
      }
    }
    if (value.verifiedFacts.length > MAX_FACTS_PER_COLUMN) {
      context.addIssue({
        code: "custom",
        path: ["verifiedFacts"],
        message: `Höchstens ${MAX_FACTS_PER_COLUMN} Angaben können als geprüft markiert werden.`,
      });
    }
  });

export type PublishDecision = z.infer<typeof PublishDecisionSchema>;

export type ProfileInsert = {
  owner_user_id: string | null;
  slug: string;
  display_name: string;
  role_title: string;
  skill_tags: string[];
  languages: string[];
  location_text: string | null;
  work_modes: WorkMode[];
  experience_summary: string;
  verified_facts: string[];
  self_reported_facts: string[];
  references_summary: string | null;
  verification_status: VerificationStatus;
  hourly_rate_minor: number | null;
  day_rate_minor: number | null;
  currency: CurrencyCode | null;
  profile_status: "active";
  availability_status: AvailabilityStatus;
  availability_from: string | null;
  availability_updated_at: string;
  intro_policy: IntroPolicy;
  booking_url: string | null;
  seeking: Seeking;
  demo_status: "real";
};

/**
 * Build the catalogue row from a reviewed application.
 *
 * Facts the reviewer did not tick are written to `self_reported_facts` and
 * truncated to the column budget. Truncation is safe: `sourceFor` treats a
 * fact with no provenance entry as self-reported, so a dropped entry can never
 * be read as verified.
 */
export function profileInsertFromDecision(
  decision: PublishDecision,
  context: { slug: string; checkedAt: string; ownerUserId?: string | null },
): ProfileInsert {
  const hourly = toMinor(decision.hourlyRate);
  const day = toMinor(decision.dayRate);
  const verified = new Set(decision.verifiedFacts);
  const facts = candidateFacts(decision);

  return {
    owner_user_id: context.ownerUserId ?? null,
    slug: context.slug,
    display_name: decision.displayName,
    role_title: decision.roleTitle,
    skill_tags: [
      ...decision.skills.map((value) => `Skill: ${value}`),
      ...decision.industries.map((value) => `Industry: ${value}`),
    ],
    languages: decision.languages,
    location_text: decision.locationText,
    work_modes: decision.workModes,
    experience_summary: decision.experienceSummary,
    verified_facts: facts
      .filter((entry) => verified.has(entry.fact))
      .map((entry) => entry.fact)
      .slice(0, MAX_FACTS_PER_COLUMN),
    self_reported_facts: facts
      .filter((entry) => !verified.has(entry.fact))
      .map((entry) => entry.fact)
      .slice(0, MAX_FACTS_PER_COLUMN),
    references_summary: decision.referencesSummary,
    verification_status: decision.verificationStatus,
    hourly_rate_minor: hourly,
    day_rate_minor: day,
    currency: hourly === null && day === null ? null : decision.currency,
    profile_status: "active",
    availability_status: decision.availabilityStatus,
    availability_from: decision.availabilityFrom,
    availability_updated_at: context.checkedAt,
    intro_policy: decision.introPolicy,
    booking_url: decision.bookingUrl,
    seeking: decision.seeking,
    demo_status: "real",
  };
}

/** Prefills the reviewer form from the submitted application. */
export function decisionDefaultsFromApplication(row: ApplicationRow) {
  return {
    displayName: row.full_name,
    roleTitle: row.role_title,
    experienceSummary: row.experience_summary,
    skills: row.skills,
    languages: row.languages,
    qualifications: row.qualifications,
    industries: row.industries,
    locationText: row.location_text ?? "",
    workModes: row.work_modes,
    hourlyRate:
      row.hourly_rate_minor === null ? "" : String(row.hourly_rate_minor / 100),
    dayRate: row.day_rate_minor === null ? "" : String(row.day_rate_minor / 100),
    currency: row.currency ?? "EUR",
    availabilityStatus: row.availability_status,
    availabilityFrom: row.availability_from ?? "",
    bookingUrl: row.booking_url ?? "",
    seeking: row.seeking ?? "projects",
    introPolicy: "free" as const,
    verificationStatus: "identity_checked" as const,
    referencesSummary: "",
    cvDownloadable: false,
    // Alle Projekte vorgewählt, keines geprüft: Abwählen ist eine bewusste
    // Entscheidung, „geprüft“ ebenso.
    projects: storedApplicationProjects(row.reference_projects).map((_, index) => ({ index, verified: false })),
    usePhoto: Boolean(row.photo_storage_path),
    verifiedFacts: [] as string[],
    slug: slugFromName(row.full_name),
    reviewNotes: row.review_notes ?? "",
  };
}
