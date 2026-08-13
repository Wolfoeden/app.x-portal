import { z } from "zod";

import { type ProjectBrief, ProjectBriefSchema } from "./brief";
import {
  type FreelancerProfile,
  FreelancerProfileSchema,
  type LabeledFact,
} from "./profile";

export const MATCHING_RULE_VERSION = "freelancer-match-v6" as const;

/**
 * Public and reviewable ordering rule. Eligibility is evaluated first. Eligible
 * profiles are then ordered by: confirmed commercial compatibility when a
 * commercial constraint was supplied, exact required-skill matches
 * (descending), availability confidence, optional skill matches (descending),
 * verified required-skill matches (descending), available-from date
 * (ascending, unknown last), normalized display name (ascending), and profile
 * id (ascending).
 */
export const MATCHING_ORDER_RULE = [
  "commercial_constraint_confidence_desc",
  "primary_required_skill_exact_match_desc",
  "exact_required_skill_matches_desc",
  "availability_status_priority",
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
    primaryRequiredSkillExactMatch: z.boolean(),
    exactRequiredSkillMatches: z.array(z.string()),
    verifiedRequiredSkillMatches: z.array(z.string()),
    commercialConstraintConfidence: z.enum([
      "not_requested",
      "unconfirmed",
      "confirmed",
    ]),
  })
  .strict();

export const ShortlistMatchSchema = z
  .object({
    profile: FreelancerProfileSchema,
    matchReasons: z.array(z.string()),
    knownGaps: z.array(z.string()),
    verifiedFacts: z.array(z.string()),
    selfReportedFacts: z.array(z.string()),
    availabilityStatus: z.enum(["available", "limited", "unavailable", "unknown"]),
    availabilityCheckedAt: z.iso.datetime({ offset: true }),
    profileDataVersion: z.string(),
    orderingEvidence: z
      .object({
        optionalSkillMatchCount: z.number().int().nonnegative(),
        primaryRequiredSkillExactMatch: z.boolean(),
        exactRequiredSkillMatchCount: z.number().int().nonnegative(),
        verifiedRequiredSkillMatchCount: z.number().int().nonnegative(),
        commercialConstraintConfidence: z
          .enum(["not_requested", "unconfirmed", "confirmed"])
          .optional(),
        availabilityPriority: z.number().int().min(0).max(3),
        availableFrom: z.iso.date().nullable(),
      })
      .strict(),
  })
  .strict();

export const ShortlistSchema = z
  .object({
    ruleVersion: z.literal(MATCHING_RULE_VERSION),
    orderingRule: z.tuple([
      z.literal("commercial_constraint_confidence_desc"),
      z.literal("primary_required_skill_exact_match_desc"),
      z.literal("exact_required_skill_matches_desc"),
      z.literal("availability_status_priority"),
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

const SKILL_FAMILIES: ReadonlyArray<{
  canonical: string;
  aliases: readonly string[];
}> = [
  {
    canonical: "requirements management",
    aliases: [
      "requirements management",
      "requirements engineering",
      "requirements analysis",
    ],
  },
  {
    canonical: "process management",
    aliases: [
      "process management",
      "process analysis",
      "process optimization",
      "process improvement",
      "process modelling",
      "continuous improvement",
      "process development",
    ],
  },
  {
    canonical: "project management",
    aliases: [
      "project management",
      "technical project management",
      "salesforce project management",
      "agile project management",
      "project coordination",
      "program management",
    ],
  },
  {
    canonical: "information security",
    aliases: [
      "information security",
      "it security",
      "cybersecurity",
      "cyber security",
      "isms",
    ],
  },
] as const;

function skillFamily(value: string): string | null {
  const key = normalize(value);
  return SKILL_FAMILIES.find((family) =>
    family.aliases.some((alias) => normalize(alias) === key),
  )?.canonical ?? null;
}

function matchingFact(
  facts: readonly LabeledFact[],
  requested: string,
): LabeledFact | undefined {
  const key = normalize(requested);
  const exact = facts.find((fact) => normalize(fact.value) === key);
  if (exact) return exact;
  const requestedFamily = skillFamily(requested);
  return requestedFamily
    ? facts.find((fact) => skillFamily(fact.value) === requestedFamily)
    : undefined;
}

function includesFact(
  facts: readonly LabeledFact[],
  requested: string,
): LabeledFact | undefined {
  const key = normalize(requested);
  return facts.find((fact) => normalize(fact.value) === key);
}

function secureBookingUrl(profile: FreelancerProfile): boolean {
  const value = profile.introPolicy.bookingUrl;
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function availabilityPriority(
  status: FreelancerProfile["availability"]["status"],
): 0 | 1 | 2 | 3 {
  if (status === "available") return 0;
  if (status === "limited") return 1;
  if (status === "unknown") return 2;
  return 3;
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
  if (profile.availability.status === "unavailable") return false;
  if (!brief.startWindow) return true;
  if (!profile.availability.availableFrom) return true;
  const deadline = brief.startWindow.latest ?? brief.startWindow.earliest;
  return deadline === null || profile.availability.availableFrom <= deadline;
}

type CommercialConstraintConfidence =
  | "not_requested"
  | "unconfirmed"
  | "confirmed";

type CommercialEvaluation = {
  rejectionReasons: string[];
  reasons: string[];
  gaps: string[];
  confidence: CommercialConstraintConfidence;
};

function commercialConfidencePriority(
  confidence: CommercialConstraintConfidence,
): 0 | 1 | 2 {
  if (confidence === "confirmed") return 2;
  if (confidence === "unconfirmed") return 1;
  return 0;
}

function formatCommercialAmount(amount: number, currency: string): string {
  return `${new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 2,
  }).format(amount)} ${currency}`;
}

function commercialEligibility(
  profile: FreelancerProfile,
  brief: ProjectBrief,
): CommercialEvaluation {
  const rejectionReasons: string[] = [];
  const reasons: string[] = [];
  const gaps: string[] = [];
  const hasCommercialConstraint = brief.rate !== null || brief.budget !== null;
  let hasUnconfirmedConstraint = false;

  if (brief.rate) {
    const profileRate = brief.rate.unit === "hour" ? profile.hourlyRate : profile.dayRate;
    const rateLabel = brief.rate.unit === "hour" ? "Stundensatz" : "Tagessatz";

    if (!profileRate) {
      hasUnconfirmedConstraint = true;
      gaps.push(`${rateLabel} noch nicht bestätigt; Preisgrenze vor der Buchung abstimmen.`);
    } else if (profileRate.currency !== brief.rate.currency) {
      hasUnconfirmedConstraint = true;
      gaps.push(
        `${rateLabel} ist nur in ${profileRate.currency} angegeben; ein verlässlicher Vergleich mit ${brief.rate.currency} ist nicht möglich.`,
      );
    } else if (brief.rate.max !== null && profileRate.amount > brief.rate.max) {
      rejectionReasons.push(
        `Bestätigter ${rateLabel} von ${formatCommercialAmount(profileRate.amount, profileRate.currency)} überschreitet die angegebene Obergrenze von ${formatCommercialAmount(brief.rate.max, brief.rate.currency)}.`,
      );
    } else if (
      brief.rate.min !== null &&
      brief.rate.max === null &&
      profileRate.amount < brief.rate.min
    ) {
      rejectionReasons.push(
        `Bestätigter ${rateLabel} von ${formatCommercialAmount(profileRate.amount, profileRate.currency)} liegt unter der ausdrücklich angegebenen Untergrenze von ${formatCommercialAmount(brief.rate.min, brief.rate.currency)}.`,
      );
    } else {
      reasons.push(
        `Bestätigter ${rateLabel} liegt innerhalb der angegebenen ${brief.rate.currency}-Grenze.`,
      );
    }
  } else if (profile.hourlyRate === null && profile.dayRate === null) {
    gaps.push("Im Profil ist kein Stunden- oder Tagessatz angegeben.");
  }

  if (brief.budget) {
    const minimum = profile.minimumProjectBudget;
    if (!minimum) {
      hasUnconfirmedConstraint = true;
      gaps.push("Mindestprojektbudget noch nicht bestätigt; Budgetpassung vor der Buchung abstimmen.");
    } else if (minimum.currency !== brief.budget.currency) {
      hasUnconfirmedConstraint = true;
      gaps.push(
        `Mindestprojektbudget ist nur in ${minimum.currency} angegeben; ein verlässlicher Vergleich mit ${brief.budget.currency} ist nicht möglich.`,
      );
    } else if (brief.budget.max !== null && minimum.amount > brief.budget.max) {
      rejectionReasons.push(
        `Bestätigtes Mindestprojektbudget von ${formatCommercialAmount(minimum.amount, minimum.currency)} überschreitet das angegebene Maximalbudget von ${formatCommercialAmount(brief.budget.max, brief.budget.currency)}.`,
      );
    } else {
      reasons.push(
        `Bestätigter Mindestprojektwert liegt innerhalb des angegebenen ${brief.budget.currency}-Budgets.`,
      );
    }
  }

  return {
    rejectionReasons,
    reasons,
    gaps,
    confidence: !hasCommercialConstraint
      ? "not_requested"
      : hasUnconfirmedConstraint
        ? "unconfirmed"
        : "confirmed",
  };
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
    rejectionReasons.push("Profil ist nicht aktiv.");
  } else {
    matchReasons.push("Profil ist im kuratierten Verzeichnis aktiv.");
  }
  if (profile.demoStatus !== "real") {
    rejectionReasons.push("Profil ist kein reales Produktionsprofil.");
  }
  if (!secureBookingUrl(profile)) {
    rejectionReasons.push("Profil hat keinen sicheren direkten Booking-Link.");
  }
  if (profile.availability.status === "unavailable") {
    rejectionReasons.push("Profil ist als nicht verfügbar markiert.");
  } else if (profile.availability.status === "available") {
    matchReasons.push("Projektverfügbarkeit ist aktuell bestätigt.");
  } else if (profile.availability.status === "limited") {
    knownGaps.push("Projektverfügbarkeit ist begrenzt; den genauen Zeitraum beim Termin abstimmen.");
  } else {
    knownGaps.push("Projektverfügbarkeit ist nicht bestätigt; der Booking-Kalender ist verfügbar.");
  }

  const requiredSkills = brief.requiredSkills ?? [];
  const matchedRequiredSkills = requiredSkills.filter((skill) =>
    matchingFact(profile.skillTags, skill),
  );
  const missingRequiredSkills = requiredSkills.filter(
    (skill) => !matchingFact(profile.skillTags, skill),
  );
  if (requiredSkills.length && matchedRequiredSkills.length === 0) {
    rejectionReasons.push(
      `Keine der angefragten Kernkompetenzen ist im Profil belegt: ${requiredSkills.join(", ")}.`,
    );
  } else if (matchedRequiredSkills.length) {
    matchReasons.push(`Belegte Pflichtkompetenzen: ${matchedRequiredSkills.join(", ")}.`);
    if (missingRequiredSkills.length) {
      knownGaps.push(
        `Weitere Pflichtkompetenzen vor dem Gespräch prüfen: ${missingRequiredSkills.join(", ")}.`,
      );
    }
  }

  if (brief.language) {
    if (!includesFact(profile.languages, brief.language)) {
      rejectionReasons.push(`Geforderte Sprache nicht bestätigt: ${brief.language}.`);
    } else {
      matchReasons.push(`Sprache passend: ${brief.language}.`);
    }
  }

  if (brief.workMode !== "unknown") {
    if (!profile.workModes.includes(brief.workMode)) {
      rejectionReasons.push(`Arbeitsmodus wird nicht unterstützt: ${brief.workMode}.`);
    } else {
      matchReasons.push(`Arbeitsmodus passend: ${brief.workMode}.`);
    }
  }

  if (brief.location && brief.workMode !== "remote") {
    if (!profile.location || !locationMatches(profile.location.value, brief.location)) {
      rejectionReasons.push(`Ort nicht bestätigt: ${brief.location}.`);
    } else {
      matchReasons.push(`Ort passend: ${brief.location}.`);
    }
  }

  if (!availableBy(profile, brief)) {
    rejectionReasons.push("Verfügbarkeit ist im angegebenen Startfenster nicht bestätigt.");
  } else if (brief.startWindow && profile.availability.availableFrom) {
    matchReasons.push("Verfügbarkeit ist im angegebenen Startfenster bestätigt.");
  } else if (brief.startWindow) {
    knownGaps.push("Das gewünschte Startfenster ist im Profil nicht separat bestätigt.");
  }

  const missingQualifications = (brief.qualifications ?? []).filter(
    (qualification) => !includesFact(profile.qualifications, qualification),
  );
  if (missingQualifications.length) {
    knownGaps.push(`Qualifikationen noch nicht bestätigt: ${missingQualifications.join(", ")}.`);
  } else if (brief.qualifications?.length) {
    matchReasons.push(`Qualifikationen passend: ${brief.qualifications.join(", ")}.`);
  }

  const missingContractTerms = (brief.contractualRequirements ?? []).filter(
    (term) => !includesFact(profile.contractualCapabilities, term),
  );
  if (missingContractTerms.length) {
    rejectionReasons.push(`Vertragsanforderungen nicht bestätigt: ${missingContractTerms.join(", ")}.`);
  } else if (brief.contractualRequirements?.length) {
    matchReasons.push(`Vertragsanforderungen passend: ${brief.contractualRequirements.join(", ")}.`);
  }

  // Explicit constraints remain hard eligibility conditions. We confirm only
  // public profile evidence and never infer residency from a current location.
  const publicConstraintFacts = [
    ...profile.skillTags,
    ...profile.languages,
    ...profile.qualifications,
    ...profile.contractualCapabilities,
    ...(profile.location ? [profile.location] : []),
    profile.experienceSummary,
  ];
  const contractualRequirementKeys = new Set(
    (brief.contractualRequirements ?? []).map(normalize),
  );
  for (const constraint of brief.constraints ?? []) {
    if (contractualRequirementKeys.has(normalize(constraint))) {
      continue;
    }
    if (includesFact(publicConstraintFacts, constraint)) {
      matchReasons.push(`Weitere Rahmenbedingung bestätigt: ${constraint}.`);
    } else {
      rejectionReasons.push(
        `Weitere Pflichtbedingung im Profil nicht bestätigt: ${constraint}.`,
      );
    }
  }

  const commercial = commercialEligibility(profile, brief);
  rejectionReasons.push(...commercial.rejectionReasons);
  matchReasons.push(...commercial.reasons);
  knownGaps.push(...commercial.gaps);

  const optionalSkillMatches = (brief.optionalSkills ?? []).filter((skill) =>
    matchingFact(profile.skillTags, skill),
  );
  const missingOptionalSkills = (brief.optionalSkills ?? []).filter(
    (skill) => !matchingFact(profile.skillTags, skill),
  );
  if (optionalSkillMatches.length) {
    matchReasons.push(`Optionale Kompetenzen passend: ${optionalSkillMatches.join(", ")}.`);
  }
  if (missingOptionalSkills.length) {
    knownGaps.push(`Optionale Kompetenzen nicht aufgeführt: ${missingOptionalSkills.join(", ")}.`);
  }

  const exactRequiredSkillMatches = requiredSkills.filter((skill) =>
    includesFact(profile.skillTags, skill),
  );
  const primaryRequiredSkillExactMatch = Boolean(
    requiredSkills[0] && includesFact(profile.skillTags, requiredSkills[0]),
  );
  const verifiedRequiredSkillMatches = requiredSkills.filter(
    (skill) => matchingFact(profile.skillTags, skill)?.source === "verified",
  );

  return ProfileEvaluationSchema.parse({
    eligible: rejectionReasons.length === 0,
    rejectionReasons,
    matchReasons,
    knownGaps,
    optionalSkillMatches,
    primaryRequiredSkillExactMatch,
    exactRequiredSkillMatches,
    verifiedRequiredSkillMatches,
    commercialConstraintConfidence: commercial.confidence,
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

  profile.skillTags.forEach((fact) => add("Kompetenz", fact));
  profile.languages.forEach((fact) => add("Sprache", fact));
  if (profile.location) add("Ort", profile.location);
  profile.qualifications.forEach((fact) => add("Qualifikation", fact));
  profile.contractualCapabilities.forEach((fact) => add("Vertragsfähigkeit", fact));
  const experienceTarget =
    profile.experienceSummary.source === "verified" ? verifiedFacts : selfReportedFacts;
  experienceTarget.push(`Erfahrung: ${profile.experienceSummary.value}`);

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
    const commercialConfidenceDifference =
      commercialConfidencePriority(right.evaluation.commercialConstraintConfidence) -
      commercialConfidencePriority(left.evaluation.commercialConstraintConfidence);
    if (commercialConfidenceDifference) return commercialConfidenceDifference;
    const primarySkillDifference =
      Number(right.evaluation.primaryRequiredSkillExactMatch) -
      Number(left.evaluation.primaryRequiredSkillExactMatch);
    if (primarySkillDifference) return primarySkillDifference;
    const exactRequiredDifference =
      right.evaluation.exactRequiredSkillMatches.length -
      left.evaluation.exactRequiredSkillMatches.length;
    if (exactRequiredDifference) return exactRequiredDifference;
    const availabilityDifference =
      availabilityPriority(left.profile.availability.status) -
      availabilityPriority(right.profile.availability.status);
    if (availabilityDifference) return availabilityDifference;
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
    availabilityStatus: profile.availability.status,
    availabilityCheckedAt: profile.availability.checkedAt,
    profileDataVersion: profile.dataVersion,
    orderingEvidence: {
      optionalSkillMatchCount: evaluation.optionalSkillMatches.length,
      primaryRequiredSkillExactMatch:
        evaluation.primaryRequiredSkillExactMatch,
      exactRequiredSkillMatchCount: evaluation.exactRequiredSkillMatches.length,
      verifiedRequiredSkillMatchCount: evaluation.verifiedRequiredSkillMatches.length,
      commercialConstraintConfidence: evaluation.commercialConstraintConfidence,
      availabilityPriority: availabilityPriority(profile.availability.status),
      availableFrom: profile.availability.availableFrom,
    },
  }));

  return ShortlistSchema.parse({
    ruleVersion: MATCHING_RULE_VERSION,
    orderingRule: MATCHING_ORDER_RULE,
    matches,
  });
}
