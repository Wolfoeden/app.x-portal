import { z } from "zod";

import {
  AVAILABILITY_STATUSES,
  CURRENCIES,
  MAX_INDUSTRIES,
  MAX_LANGUAGES,
  MAX_QUALIFICATIONS,
  MAX_SKILLS,
  MAX_SUMMARY_LENGTH,
  WORK_MODES,
  type ApplicationStatus,
  type AvailabilityStatus,
  type CurrencyCode,
  type WorkMode,
} from "./limits";

const tag = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
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
    .pipe(z.array(tag(itemLength)).min(1).max(max));

const optionalTagList = (max: number, itemLength: number) =>
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

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null);

const optionalDate = z
  .union([z.literal(""), z.iso.date(), z.null()])
  .transform((value) => value || null);

const secureUrl = z
  .url()
  .max(1_000)
  .refine((value) => value.startsWith("https://"), {
    message: "Nur HTTPS-Adressen werden akzeptiert.",
  });

export const FreelancerProfileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(2).max(120),
    roleTitle: z.string().trim().min(2).max(160),
    experienceSummary: z.string().trim().min(40).max(MAX_SUMMARY_LENGTH),
    skills: tagList(MAX_SKILLS),
    languages: tagList(MAX_LANGUAGES, 60),
    qualifications: optionalTagList(MAX_QUALIFICATIONS, 160),
    industries: optionalTagList(MAX_INDUSTRIES, 80),
    locationText: optionalText(160),
    workModes: z.array(z.enum(WORK_MODES)).min(1).max(3),
    hourlyRate: z.number().positive().max(100_000).nullable(),
    dayRate: z.number().positive().max(1_000_000).nullable(),
    currency: z.enum(CURRENCIES),
    availabilityStatus: z.enum(AVAILABILITY_STATUSES),
    availabilityFrom: optionalDate,
    bookingUrl: secureUrl,
    profileStatus: z.enum(["active", "paused"]),
    version: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.hourlyRate === null && value.dayRate === null) {
      context.addIssue({
        code: "custom",
        path: ["hourlyRate"],
        message: "Bitte Stundensatz oder Tagessatz angeben.",
      });
    }
  });

export type FreelancerProfileUpdate = z.infer<
  typeof FreelancerProfileUpdateSchema
>;

export type EditableFreelancerProfile = {
  id: string;
  displayName: string;
  roleTitle: string;
  experienceSummary: string;
  skills: string[];
  languages: string[];
  qualifications: string[];
  industries: string[];
  locationText: string | null;
  workModes: WorkMode[];
  hourlyRate: number | null;
  dayRate: number | null;
  currency: CurrencyCode;
  availabilityStatus: AvailabilityStatus;
  availabilityFrom: string | null;
  bookingUrl: string;
  profileStatus: "active" | "paused";
  verificationStatus: string;
  avatarUrl: string | null;
  version: number;
};

export type FreelancerMetrics = {
  profileViewsTotal: number;
  profileViews30Days: number;
  bookingClicksTotal: number;
  bookingClicks30Days: number;
};

export type FreelancerPortalState =
  | {
      kind: "profile";
      profile: EditableFreelancerProfile;
      metrics: FreelancerMetrics;
    }
  | {
      kind: "application";
      status: ApplicationStatus;
      updatedAt: string;
    }
  | { kind: "apply" };
