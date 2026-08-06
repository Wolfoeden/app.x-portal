import { z } from "zod";

import { CurrencySchema, WorkModeSchema } from "./brief";

export const FACT_SOURCES = ["verified", "self_reported"] as const;
export const FactSourceSchema = z.enum(FACT_SOURCES);

export const TextFactSchema = z
  .object({
    value: z.string().trim().min(1).max(2_000),
    source: FactSourceSchema,
  })
  .strict();

export const LabeledFactSchema = z
  .object({
    value: z.string().trim().min(1).max(160),
    source: FactSourceSchema,
  })
  .strict();

export const ProfileRateSchema = z
  .object({
    amount: z.number().finite().nonnegative(),
    currency: CurrencySchema,
  })
  .strict();

export const AvailabilitySchema = z
  .object({
    status: z.enum(["available", "unavailable", "unknown"]),
    availableFrom: z.iso.date().nullable(),
    checkedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const FreelancerProfileSchema = z
  .object({
    id: z.string().uuid(),
    dataVersion: z.string().trim().min(1).max(100),
    demoStatus: z.enum(["demo", "real"]),
    profileStatus: z.enum(["active", "paused", "archived"]),
    displayName: z.string().trim().min(1).max(120),
    role: z.string().trim().min(1).max(160),
    skillTags: z.array(LabeledFactSchema).max(100),
    languages: z.array(LabeledFactSchema).max(30),
    location: LabeledFactSchema.nullable(),
    workModes: z.array(WorkModeSchema.exclude(["unknown"])).min(1).max(3),
    experienceSummary: TextFactSchema,
    qualifications: z.array(LabeledFactSchema).max(50),
    contractualCapabilities: z.array(LabeledFactSchema).max(50),
    referenceStatus: z.enum(["verified", "self_reported", "not_verified"]),
    hourlyRate: ProfileRateSchema.nullable(),
    dayRate: ProfileRateSchema.nullable(),
    minimumProjectBudget: ProfileRateSchema.nullable(),
    availability: AvailabilitySchema,
    introPolicy: z
      .object({
        type: z.enum(["free", "premium"]),
        label: z.string().trim().min(1).max(200),
        bookingUrl: z.url().nullable(),
      })
      .strict(),
  })
  .strict();

export type FactSource = z.infer<typeof FactSourceSchema>;
export type TextFact = z.infer<typeof TextFactSchema>;
export type LabeledFact = z.infer<typeof LabeledFactSchema>;
export type ProfileRate = z.infer<typeof ProfileRateSchema>;
export type Availability = z.infer<typeof AvailabilitySchema>;
export type FreelancerProfile = z.infer<typeof FreelancerProfileSchema>;
