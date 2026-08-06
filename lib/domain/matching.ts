import { z } from "zod";

import { type ProjectBrief, ProjectBriefSchema } from "./brief";
import {
  type FreelancerProfile,
  FreelancerProfileSchema,
  type LabeledFact,
} from "./profile";

export const MATCHING_RULE_VERSION = "freelancer-match-v1" as const;

/**
 * Public and reviewable ordering rule. Eligibility is evaluated first. Eligible
 * profiles are then ordered by: optional skill matches (descending), verified
 * required-skill matches (descending), available-from date (ascending, unknown
 * last), normalized display name (ascending), and profile id (ascending).
 */
export const MATCHING_ORDER_RULE = [
  "optional_skill_matches_desc",
  "verified_required_skill_matches_desc",
  "available_from_asc_unknown_last",
  "display_name_asc",
  "profile_id_asc",
] as const;

export const ProfileEvaluationSchema = z
  .object({
    eligible: z.boolean(),
    rejectionReasons: z.array(z.string()),
    matchReasons: z.array(z.string()),
    knownGaps: z.array(z.string()),
    optionalSkillMatches: z.array(z.string()),
    verifiedRequiredSkillMatches: z.array(z.string()),
  })
  .strict();

export const ShortlistMatchSchema = z
  .object({
    profile: FreelancerProfileSchema,
    matchReasons: z.array(z.string()),
    knownGaps: z.array(z.string()),
    verifiedFacts: z.array(z.string()),
    selfReportedFacts: z.array(z.string()),
    availabilityStatus: z.literal("available"),
    availabilityCheckedAt: z.iso.datetime({ offset: true }),
    profileDataVersion: z.string(),
    orderingEvidence: z
      .object({
        optionalSkillMatchCount: z.number().int().nonnegative(),
        verifiedRequiredSkillMatchCount: z.number().int().nonnegative(),
        availableFrom: z.iso.date().nullable(),
      })
      .strict(),
  })
  .strict();

export const ShortlistSchema = z
  .object({
    ruleVersion: z.literal(MATCHING_RULE_VERSION),
    orderingRule: z.tuple([
      z.literal("optional_skill_matches_desc"),
      z.literal("verified_required_skill_matches_desc"),
      z.literal("available_from_asc_unknown_last"),
      z.literal("display_name_asc"),
      z.literal("profile_id_asc"),
    ]),
    matches: z.array(ShortlistMatchSchema).max(3),
  })
  .strict();

export type ProfileEvaluation = z.infer<typeof ProfileEvaluationSchema>;
export type ShortlistMatch = z.infer<typeof ShortlistMatchSchema>;
export type Shortlist = z.infer<typeof ShortlistSchema>;

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ");
}

function includesFact(facts: readonly LabeledFact[], requested: string): LabeledFact | undefined {
  const key = normalize(requested);
  return facts.find((fact) => normalize(fact.value) === key);
}

function compareText(left: string, right: string): number {
  const a = normalize(left);
  const b = normalize(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function locationMatches(profileLocation: string, requestedLocation: string): boolean {
  const profile = normalize(profileLocation);
  const requested = normalize(requestedLocation);
  return (
    profile === requested ||
    profile.startsWith(`${requested},`) ||
    requested.startsWith(`${profile},`)
  );
}

function availableBy(profile: FreelancerProfile, brief: ProjectBrief): boolean {
  if (!brief.startWindow) return true;
  if (!profile.availability.availableFrom) return false;
  const deadline = brief.startWindow.latest ?? brief.startWindow.earliest;
  return deadline === null || profile.availability.availableFrom <= deadline;
}

function commercialEligibility(
  profile: FreelancerProfile,
  brief: ProjectBrief,
): { eligible: boolean; reasons: string[]; gaps: string[] } {
  const reasons: string[] = [];
  const gaps: string[] = [];

  if (brief.rate) {
    const profileRate = brief.rate.unit === "hour" ? profile.hourlyRate : profile.dayRate;
    if (!profileRate) return { eligible: false, reasons, gaps };
    if (profileRate.currency !== brief.rate.currency) return { eligible: false, reasons, gaps };
    if (brief.rate.max !== null && profileRate.amount > brief.rate.max) {
      return { eligible: false, reasons, gaps };
    }
    if (brief.rate.min !== null && brief.rate.max === null && profileRate.amount < brief.rate.min) {
      return { eligible: false, reasons, gaps };
    }
    reasons.push(
      `${brief.rate.unit === "hour" ? "Hourly" : "Daily"} rate is within the supplied ${brief.rate.currency} constraint.`,
    );
  } else if (profile.hourlyRate === null && profile.dayRate === null) {
    gaps.push("No hourly or daily rate is supplied on the profile.");
  }

  if (brief.budget) {
    const minimum = profile.minimumProjectBudget;
    if (!minimum) return { eligible: false, reasons, gaps };
    if (minimum.currency !== brief.budget.currency) return { eligible: false, reasons, gaps };
    if (brief.budget.max !== null && minimum.amount > brief.budget.max) {
      return { eligible: false, reasons, gaps };
    }
    reasons.push(`Minimum project value is within the supplied ${brief.budget.currency} budget.`);
  }

  return { eligible: true, reasons, gaps };
}

export function evaluateProfile(
  rawBrief: ProjectBrief,
  rawProfile: FreelancerProfile,
): ProfileEvaluation {
  const brief = ProjectBriefSchema.parse(rawBrief);
  const profile = FreelancerProfileSchema.parse(rawProfile);
  const rejectionReasons: string[] = [];
  const matchReasons: string[] = [];
  const knownGaps: string[] = [];

  if (profile.profileStatus !== "active") {
    rejectionReasons.push("Profile is not active.");
  } else {
    matchReasons.push("Profile is active in the curated directory.");
  }
  if (profile.availability.status !== "available") {
    rejectionReasons.push("Profile is not marked available.");
  } else {
    matchReasons.push("Availability is currently confirmed.");
  }

  const requiredSkills = brief.requiredSkills ?? [];
  const missingRequiredSkills = requiredSkills.filter(
    (skill) => !includesFact(profile.skillTags, skill),
  );
  if (missingRequiredSkills.length) {
    rejectionReasons.push(`Missing required skills: ${missingRequiredSkills.join(", ")}.`);
  } else if (requiredSkills.length) {
    matchReasons.push(`Required skills matched: ${requiredSkills.join(", ")}.`);
  }

  if (brief.language) {
    if (!includesFact(profile.languages, brief.language)) {
      rejectionReasons.push(`Required language not confirmed: ${brief.language}.`);
    } else {
      matchReasons.push(`Language matched: ${brief.language}.`);
    }
  }

  if (brief.workMode !== "unknown") {
    if (!profile.workModes.includes(brief.workMode)) {
      rejectionReasons.push(`Work mode not supported: ${brief.workMode}.`);
    } else {
      matchReasons.push(`Work mode matched: ${brief.workMode}.`);
    }
  }

  if (brief.location) {
    if (!profile.location || !locationMatches(profile.location.value, brief.location)) {
      rejectionReasons.push(`Location not confirmed: ${brief.location}.`);
    } else {
      matchReasons.push(`Location matched: ${brief.location}.`);
    }
  }

  if (!availableBy(profile, brief)) {
    rejectionReasons.push("Availability is not confirmed within the supplied start window.");
  } else if (brief.startWindow) {
    matchReasons.push("Availability is confirmed within the supplied start window.");
  }

  const missingQualifications = (brief.qualifications ?? []).filter(
    (qualification) => !includesFact(profile.qualifications, qualification),
  );
  if (missingQualifications.length) {
    rejectionReasons.push(`Qualifications not confirmed: ${missingQualifications.join(", ")}.`);
  } else if (brief.qualifications?.length) {
    matchReasons.push(`Qualifications matched: ${brief.qualifications.join(", ")}.`);
  }

  const missingContractTerms = (brief.contractualRequirements ?? []).filter(
    (term) => !includesFact(profile.contractualCapabilities, term),
  );
  if (missingContractTerms.length) {
    rejectionReasons.push(`Contractual requirements not confirmed: ${missingContractTerms.join(", ")}.`);
  } else if (brief.contractualRequirements?.length) {
    matchReasons.push(`Contractual requirements matched: ${brief.contractualRequirements.join(", ")}.`);
  }

  const commercial = commercialEligibility(profile, brief);
  if (!commercial.eligible) rejectionReasons.push("Supplied commercial constraints are not confirmed.");
  matchReasons.push(...commercial.reasons);
  knownGaps.push(...commercial.gaps);

  const optionalSkillMatches = (brief.optionalSkills ?? []).filter((skill) =>
    includesFact(profile.skillTags, skill),
  );
  const missingOptionalSkills = (brief.optionalSkills ?? []).filter(
    (skill) => !includesFact(profile.skillTags, skill),
  );
  if (optionalSkillMatches.length) {
    matchReasons.push(`Optional skills matched: ${optionalSkillMatches.join(", ")}.`);
  }
  if (missingOptionalSkills.length) {
    knownGaps.push(`Optional skills not listed: ${missingOptionalSkills.join(", ")}.`);
  }

  const verifiedRequiredSkillMatches = requiredSkills.filter(
    (skill) => includesFact(profile.skillTags, skill)?.source === "verified",
  );

  return ProfileEvaluationSchema.parse({
    eligible: rejectionReasons.length === 0,
    rejectionReasons,
    matchReasons,
    knownGaps,
    optionalSkillMatches,
    verifiedRequiredSkillMatches,
  });
}

function sourceDisclosures(profile: FreelancerProfile): {
  verifiedFacts: string[];
  selfReportedFacts: string[];
} {
  const verifiedFacts: string[] = [];
  const selfReportedFacts: string[] = [];
  const add = (label: string, fact: LabeledFact): void => {
    const output = `${label}: ${fact.value}`;
    (fact.source === "verified" ? verifiedFacts : selfReportedFacts).push(output);
  };

  profile.skillTags.forEach((fact) => add("Skill", fact));
  profile.languages.forEach((fact) => add("Language", fact));
  if (profile.location) add("Location", profile.location);
  profile.qualifications.forEach((fact) => add("Qualification", fact));
  profile.contractualCapabilities.forEach((fact) => add("Contract capability", fact));
  const experienceTarget =
    profile.experienceSummary.source === "verified" ? verifiedFacts : selfReportedFacts;
  experienceTarget.push(`Experience: ${profile.experienceSummary.value}`);

  return { verifiedFacts, selfReportedFacts };
}

export function buildShortlist(
  rawBrief: ProjectBrief,
  rawProfiles: readonly FreelancerProfile[],
): Shortlist {
  const brief = ProjectBriefSchema.parse(rawBrief);
  const evaluated = rawProfiles.map((rawProfile) => {
    const profile = FreelancerProfileSchema.parse(rawProfile);
    return { profile, evaluation: evaluateProfile(brief, profile) };
  });

  const eligible = evaluated.filter((item) => item.evaluation.eligible);
  eligible.sort((left, right) => {
    const optionalDifference =
      right.evaluation.optionalSkillMatches.length - left.evaluation.optionalSkillMatches.length;
    if (optionalDifference) return optionalDifference;
    const verifiedDifference =
      right.evaluation.verifiedRequiredSkillMatches.length -
      left.evaluation.verifiedRequiredSkillMatches.length;
    if (verifiedDifference) return verifiedDifference;
    const leftDate = left.profile.availability.availableFrom ?? "9999-12-31";
    const rightDate = right.profile.availability.availableFrom ?? "9999-12-31";
    if (leftDate !== rightDate) return leftDate < rightDate ? -1 : 1;
    const nameDifference = compareText(left.profile.displayName, right.profile.displayName);
    if (nameDifference) return nameDifference;
    return compareText(left.profile.id, right.profile.id);
  });

  const matches = eligible.slice(0, 3).map(({ profile, evaluation }) => ({
    profile,
    matchReasons: evaluation.matchReasons,
    knownGaps: evaluation.knownGaps,
    ...sourceDisclosures(profile),
    availabilityStatus: "available" as const,
    availabilityCheckedAt: profile.availability.checkedAt,
    profileDataVersion: profile.dataVersion,
    orderingEvidence: {
      optionalSkillMatchCount: evaluation.optionalSkillMatches.length,
      verifiedRequiredSkillMatchCount: evaluation.verifiedRequiredSkillMatches.length,
      availableFrom: profile.availability.availableFrom,
    },
  }));

  return ShortlistSchema.parse({
    ruleVersion: MATCHING_RULE_VERSION,
    orderingRule: MATCHING_ORDER_RULE,
    matches,
  });
}
