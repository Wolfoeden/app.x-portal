import { z } from "zod";

import { deriveRequirementGroups } from "./requirements";

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
const ProjectTitleSchema = z.string().trim().min(1).max(160).nullable();
const SummarySchema = z.string().trim().min(1).max(4_000);
const LanguageSchema = z.string().trim().min(1).max(80).nullable();
const LocationSchema = z.string().trim().min(1).max(200).nullable();
const AvailabilityRequirementSchema = z.string().trim().min(1).max(300).nullable();

export const RequirementPrioritySchema = z.enum(["hard", "core", "optional"]);
export const RequirementOperatorSchema = z.enum(["all_of", "any_of"]);
export const RequirementCategorySchema = z.enum([
  "skill",
  "language",
  "work_mode",
  "location",
  "qualification",
  "contractual",
]);

export const RequirementGroupSchema = z
  .object({
    id: z.string().trim().min(1).max(500),
    category: RequirementCategorySchema,
    priority: RequirementPrioritySchema,
    operator: RequirementOperatorSchema,
    values: z.array(NormalizedTextSchema).min(1).max(50),
    sourceText: z.string().trim().min(1).max(240).nullable(),
  })
  .strict()
  .superRefine((group, context) => {
    const normalized = group.values.map((value) => value.toLocaleLowerCase("en-US"));
    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({
        code: "custom",
        path: ["values"],
        message: "Requirement-group values must be distinct.",
      });
    }
    if (group.operator === "any_of" && group.values.length < 2) {
      context.addIssue({
        code: "custom",
        path: ["values"],
        message: "An any_of requirement group needs at least two alternatives.",
      });
    }
  });

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

const ProjectBriefCommonSchema = z
  .object({
    originalRequest: z.string().min(1).max(20_000),
    projectTitle: ProjectTitleSchema,
    summary: SummarySchema,
    requiredSkills: NormalizedTextListSchema,
    optionalSkills: NormalizedTextListSchema,
    language: LanguageSchema,
    workMode: WorkModeSchema,
    location: LocationSchema,
    startWindow: StartWindowSchema.nullable(),
    duration: DurationSchema.nullable(),
    budget: MoneyRangeSchema.nullable(),
    rate: RateRangeSchema.nullable(),
    constraints: NormalizedTextListSchema,
    qualifications: NormalizedTextListSchema,
    availabilityRequirement: AvailabilityRequirementSchema,
    contractualRequirements: NormalizedTextListSchema,
    unknownFields: z.array(BriefFactFieldSchema),
  })
  .strict();

function refineBriefUnknownFields(
  brief: z.infer<typeof ProjectBriefCommonSchema>,
  context: z.RefinementCtx,
): void {
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
}

export const ProjectBriefV1Schema = ProjectBriefCommonSchema.extend({
  schemaVersion: z.literal(1),
}).superRefine(refineBriefUnknownFields);

export const ProjectBriefV2Schema = ProjectBriefCommonSchema.extend({
  schemaVersion: z.literal(2),
  requirementGroups: z.array(RequirementGroupSchema).max(100),
})
  .superRefine(refineBriefUnknownFields)
  .superRefine((brief, context) => {
    const ids = brief.requirementGroups.map((group) => group.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["requirementGroups"],
        message: "Requirement-group ids must be distinct.",
      });
    }
  });

export const ProjectBriefSchema = z.union([
  ProjectBriefV2Schema,
  ProjectBriefV1Schema,
]);

export type ProjectBrief = z.infer<typeof ProjectBriefSchema>;
export type ProjectBriefV1 = z.infer<typeof ProjectBriefV1Schema>;
export type ProjectBriefV2 = z.infer<typeof ProjectBriefV2Schema>;
export type RequirementGroup = z.infer<typeof RequirementGroupSchema>;
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
    projectTitle: ProjectTitleSchema.optional(),
    summary: SummarySchema.optional(),
    requiredSkills: NormalizedTextListSchema.optional(),
    optionalSkills: NormalizedTextListSchema.optional(),
    language: LanguageSchema.optional(),
    workMode: WorkModeSchema.optional(),
    location: LocationSchema.optional(),
    startWindow: StartWindowSchema.nullable().optional(),
    duration: DurationSchema.nullable().optional(),
    budget: MoneyRangeSchema.nullable().optional(),
    rate: RateRangeSchema.nullable().optional(),
    constraints: NormalizedTextListSchema.optional(),
    qualifications: NormalizedTextListSchema.optional(),
    availabilityRequirement: AvailabilityRequirementSchema.optional(),
    contractualRequirements: NormalizedTextListSchema.optional(),
  })
  .strict();

export type ProjectBriefPatch = z.infer<typeof ProjectBriefPatchSchema>;

type ProjectBriefFacts = Omit<
  z.infer<typeof ProjectBriefCommonSchema>,
  "unknownFields"
> & { unknownFields?: BriefFactField[] };

/** Creates the only brief version emitted by new analyses. */
export function createProjectBriefV2(
  candidate: ProjectBriefFacts,
): ProjectBriefV2 {
  const requirementGroups = deriveRequirementGroups(candidate).map((group) => ({
    ...group,
    // The excerpt is useful while deriving the group but duplicates text that
    // already lives in originalRequest. Final briefs stay below the database's
    // 32 KiB JSON limit by persisting only the reviewed semantics.
    sourceText: null,
  }));
  return ProjectBriefV2Schema.parse({
    ...candidate,
    schemaVersion: 2,
    requirementGroups,
    unknownFields: deriveUnknownFields(candidate),
  });
}

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
  return createProjectBriefV2(candidate);
}
