import { z } from "zod";

export const WORK_MODES = ["remote", "on_site", "hybrid", "unknown"] as const;
export const WorkModeSchema = z.enum(WORK_MODES);

export const CURRENCIES = ["EUR", "USD", "GBP"] as const;
export const CurrencySchema = z.enum(CURRENCIES);

export const MoneyRangeSchema = z
  .object({
    min: z.number().finite().nonnegative().nullable(),
    max: z.number().finite().nonnegative().nullable(),
    currency: CurrencySchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.min === null && value.max === null) {
      context.addIssue({
        code: "custom",
        message: "A money range must contain at least one supplied amount.",
      });
    }
    if (value.min !== null && value.max !== null && value.min > value.max) {
      context.addIssue({
        code: "custom",
        message: "Money range minimum cannot exceed its maximum.",
      });
    }
  });

export const RateRangeSchema = z
  .object({
    min: z.number().finite().nonnegative().nullable(),
    max: z.number().finite().nonnegative().nullable(),
    currency: CurrencySchema,
    unit: z.enum(["hour", "day"]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.min === null && value.max === null) {
      context.addIssue({
        code: "custom",
        message: "A rate range must contain at least one supplied amount.",
      });
    }
    if (value.min !== null && value.max !== null && value.min > value.max) {
      context.addIssue({
        code: "custom",
        message: "Rate range minimum cannot exceed its maximum.",
      });
    }
  });

export const StartWindowSchema = z
  .object({
    raw: z.string().trim().min(1).max(200),
    earliest: z.iso.date().nullable(),
    latest: z.iso.date().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.earliest !== null &&
      value.latest !== null &&
      value.earliest > value.latest
    ) {
      context.addIssue({
        code: "custom",
        message: "Start window earliest date cannot be after latest date.",
      });
    }
  });

export const DurationSchema = z
  .object({
    raw: z.string().trim().min(1).max(100),
    value: z.number().int().positive(),
    unit: z.enum(["hours", "days", "weeks", "months"]),
  })
  .strict();

const NormalizedTextSchema = z.string().trim().min(1).max(500);
const NormalizedTextListSchema = z.array(NormalizedTextSchema).max(50).nullable();

export const BRIEF_FACT_FIELDS = [
  "projectTitle",
  "requiredSkills",
  "optionalSkills",
  "language",
  "workMode",
  "location",
  "startWindow",
  "duration",
  "budget",
  "rate",
  "constraints",
  "qualifications",
  "availabilityRequirement",
  "contractualRequirements",
] as const;

export const BriefFactFieldSchema = z.enum(BRIEF_FACT_FIELDS);
export type BriefFactField = z.infer<typeof BriefFactFieldSchema>;

export const ProjectBriefSchema = z
  .object({
    schemaVersion: z.literal(1),
    originalRequest: z.string().min(1).max(20_000),
    projectTitle: z.string().trim().min(1).max(160).nullable(),
    summary: z.string().trim().min(1).max(4_000),
    requiredSkills: NormalizedTextListSchema,
    optionalSkills: NormalizedTextListSchema,
    language: z.string().trim().min(1).max(80).nullable(),
    workMode: WorkModeSchema,
    location: z.string().trim().min(1).max(200).nullable(),
    startWindow: StartWindowSchema.nullable(),
    duration: DurationSchema.nullable(),
    budget: MoneyRangeSchema.nullable(),
    rate: RateRangeSchema.nullable(),
    constraints: NormalizedTextListSchema,
    qualifications: NormalizedTextListSchema,
    availabilityRequirement: z.string().trim().min(1).max(300).nullable(),
    contractualRequirements: NormalizedTextListSchema,
    unknownFields: z.array(BriefFactFieldSchema),
  })
  .strict()
  .superRefine((brief, context) => {
    const expected = deriveUnknownFields(brief);
    const supplied = new Set(brief.unknownFields);

    for (const field of expected) {
      if (!supplied.has(field)) {
        context.addIssue({
          code: "custom",
          path: ["unknownFields"],
          message: `Missing unknown-field marker for ${field}.`,
        });
      }
    }
    for (const field of supplied) {
      if (!expected.includes(field)) {
        context.addIssue({
          code: "custom",
          path: ["unknownFields"],
          message: `${field} is marked unknown although it contains a value.`,
        });
      }
    }
  });

export type ProjectBrief = z.infer<typeof ProjectBriefSchema>;
export type MoneyRange = z.infer<typeof MoneyRangeSchema>;
export type RateRange = z.infer<typeof RateRangeSchema>;
export type StartWindow = z.infer<typeof StartWindowSchema>;
export type ProjectDuration = z.infer<typeof DurationSchema>;
export type WorkMode = z.infer<typeof WorkModeSchema>;
export type Currency = z.infer<typeof CurrencySchema>;

type BriefFactValues = Pick<ProjectBrief, BriefFactField>;

export function deriveUnknownFields(brief: BriefFactValues): BriefFactField[] {
  return BRIEF_FACT_FIELDS.filter((field) => {
    const value = brief[field];
    return value === null || value === "unknown";
  });
}

export const ProjectBriefPatchSchema = z
  .object({
    projectTitle: ProjectBriefSchema.shape.projectTitle.optional(),
    summary: ProjectBriefSchema.shape.summary.optional(),
    requiredSkills: ProjectBriefSchema.shape.requiredSkills.optional(),
    optionalSkills: ProjectBriefSchema.shape.optionalSkills.optional(),
    language: ProjectBriefSchema.shape.language.optional(),
    workMode: WorkModeSchema.optional(),
    location: ProjectBriefSchema.shape.location.optional(),
    startWindow: StartWindowSchema.nullable().optional(),
    duration: DurationSchema.nullable().optional(),
    budget: MoneyRangeSchema.nullable().optional(),
    rate: RateRangeSchema.nullable().optional(),
    constraints: ProjectBriefSchema.shape.constraints.optional(),
    qualifications: ProjectBriefSchema.shape.qualifications.optional(),
    availabilityRequirement:
      ProjectBriefSchema.shape.availabilityRequirement.optional(),
    contractualRequirements:
      ProjectBriefSchema.shape.contractualRequirements.optional(),
  })
  .strict();

export type ProjectBriefPatch = z.infer<typeof ProjectBriefPatchSchema>;

/**
 * Applies an explicit correction from the user. Passing null removes a fact and
 * marks it unknown; omitted properties remain unchanged.
 */
export function applyBriefPatch(
  current: ProjectBrief,
  input: ProjectBriefPatch,
): ProjectBrief {
  const patch = ProjectBriefPatchSchema.parse(input);
  const candidate = { ...current, ...patch };
  return ProjectBriefSchema.parse({
    ...candidate,
    unknownFields: deriveUnknownFields(candidate),
  });
}
