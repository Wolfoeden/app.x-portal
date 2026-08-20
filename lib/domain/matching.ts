import { z } from "zod";

import {
  type ProjectBrief,
  ProjectBriefSchema,
  type RequirementGroup,
} from "./brief";
import {
  type FreelancerProfile,
  FreelancerProfileSchema,
  type LabeledFact,
} from "./profile";
import { skillFamilyKey, skillTerms } from "./skill-taxonomy";
import {
  deriveRequirementGroups,
  hasAmbiguousSkillConnectors,
} from "./requirements";

export const MATCHING_RULE_VERSION = "freelancer-match-v14" as const;
export const MATCHING_SCORE_VERSION = "freelancer-score-v2" as const;

/**
 * Versions a stored snapshot may carry. New runs always write the current
 * version; older ones stay readable so a past decision can still be shown
 * exactly as it was made.
 */
export const READABLE_RULE_VERSIONS = [
  "freelancer-match-v11",
  "freelancer-match-v12",
  "freelancer-match-v13",
  "freelancer-match-v14",
] as const;
export const READABLE_SCORE_VERSIONS = [
  "freelancer-score-v1",
  "freelancer-score-v2",
] as const;
export const MINIMUM_CORE_COVERAGE_BASIS_POINTS = 7_000 as const;
export const MINIMUM_PARTIAL_COVERAGE_BASIS_POINTS = 2_500 as const;
export const MAX_PARTIAL_MATCHES = 2 as const;

/**
 * Public and reviewable ordering rule. Eligibility is evaluated first. Eligible
 * profiles are then ordered by: matched core skills (descending), confirmed
 * commercial compatibility when an explicit commercial constraint was supplied,
 * availability confidence, optional skill matches (descending), supporting
 * context evidence (descending), verified core-skill matches (descending),
 * available-from date (ascending, unknown last), normalized display name
 * (ascending), and profile id (ascending).
 *
 * Changes from v9:
 *
 * - `primary_required_skill_match_desc` is removed. It asked whether a profile
 *   matched `requiredSkills[0]`, which treated the position of a term in the
 *   extracted array as a statement of importance. That position is a by-product
 *   of extraction, not a weighting: a single leading word in the request text
 *   promoted every profile carrying it above every profile that did not,
 *   regardless of how well the rest matched. Ranking now starts at the number of
 *   matched core skills, which counts evidence instead of order.
 *
 * Changes from v8:
 *
 * - The primary-skill criterion compared SKILLS rather than strings before it
 *   was dropped. It used to require character equality between the extracted
 *   term and the profile tag, so it rewarded whoever happened to write the skill
 *   the way the extraction did.
 * - `exact_required_skill_matches_desc` is removed rather than demoted. Once
 *   the comparison is skill-based it says exactly what `core_skill_matches_desc`
 *   already says, and keeping it would reintroduce the same surface-form bias
 *   one rank lower.
 * - `context_evidence_matches_desc` is new: industry, certification and prior
 *   experience facts that support the request without being skill claims. It
 *   sits below every declared-skill criterion because it is weaker evidence,
 *   and it can never make a profile eligible.
 */
export const MATCHING_ORDER_RULE = [
  "fit_score_desc",
  "core_coverage_desc",
  "evidence_confidence_desc",
  "verified_required_skill_matches_desc",
  "commercial_constraint_confidence_desc",
  "availability_status_priority",
  "optional_skill_matches_desc",
  "context_evidence_matches_desc",
  "available_from_asc_unknown_last",
  "display_name_asc",
  "profile_id_asc",
] as const;

export const RequirementAssessmentSchema = z
  .object({
    groupId: z.string().min(1).max(500),
    category: z.enum([
      "skill",
      "language",
      "work_mode",
      "location",
      "qualification",
      "contractual",
    ]),
    priority: z.enum(["hard", "core", "optional"]),
    operator: z.enum(["all_of", "any_of"]),
    values: z.array(z.string().min(1)).min(1).max(50),
    status: z.enum(["satisfied", "contradicted", "unknown"]),
    matchedValues: z.array(z.string().min(1)).max(50),
    evidence: z.enum(["verified", "self_reported", "structured", "unknown"]),
  })
  .strict();

export const ScoreBreakdownSchema = z
  .object({
    scoreVersion: z.enum(READABLE_SCORE_VERSIONS),
    fitScoreBasisPoints: z.number().int().min(0).max(10_000),
    coreCoverageBasisPoints: z.number().int().min(0).max(10_000),
    optionalCoverageBasisPoints: z.number().int().min(0).max(10_000).nullable(),
    categoricalFitBasisPoints: z.number().int().min(0).max(10_000).nullable(),
    availabilityFitBasisPoints: z.number().int().min(0).max(10_000),
    commercialFitBasisPoints: z.number().int().min(0).max(10_000).nullable(),
    evidenceConfidenceBasisPoints: z.number().int().min(0).max(10_000),
    minimumCoreCoverageBasisPoints: z.literal(MINIMUM_CORE_COVERAGE_BASIS_POINTS),
  })
  .strict();

export const MatchingDecisionSnapshotSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    scoreVersion: z.enum(READABLE_SCORE_VERSIONS),
    status: z.enum(["ranked", "needs_clarification", "no_reliable_match"]),
    minimumCoreCoverageBasisPoints: z.literal(
      MINIMUM_CORE_COVERAGE_BASIS_POINTS,
    ),
    evaluatedProfileCount: z.number().int().nonnegative(),
    catalogEligibleProfileCount: z.number().int().nonnegative(),
    reliableProfileCount: z.number().int().nonnegative(),
    failureCounts: z
      .object({
        hardConflict: z.number().int().nonnegative(),
        hardUnknown: z.number().int().nonnegative(),
        belowCoreCoverage: z.number().int().nonnegative(),
      })
      .strict(),
    primaryProfileId: z.string().uuid().nullable(),
    openCoreRequirements: z.array(z.string().min(1).max(500)).max(5),
    partialProfileIds: z.array(z.string().uuid()).max(MAX_PARTIAL_MATCHES).optional(),
  })
  .strict()
  .refine(
    (value) => value.schemaVersion === 1 || value.partialProfileIds !== undefined,
    "Version 2 matching decisions must persist their partial-profile ids.",
  );

export const MatchingEvaluationSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    recommendationRole: z.enum(["primary", "alternative", "partial"]),
    fitScore: z.number().int().min(0).max(100),
    coreCoverage: z.number().int().min(0).max(100),
    requirementAssessments: z.array(RequirementAssessmentSchema),
    scoreBreakdown: ScoreBreakdownSchema,
  })
  .strict();

export const ProfileEvaluationSchema = z
  .object({
    eligible: z.boolean(),
    reliable: z.boolean(),
    rejectionReasons: z.array(z.string()),
    matchReasons: z.array(z.string()),
    knownGaps: z.array(z.string()),
    optionalSkillMatches: z.array(z.string()),
    coreSkillMatches: z.array(z.string()),
    exactRequiredSkillMatches: z.array(z.string()),
    contextEvidenceMatches: z.array(z.string()),
    verifiedRequiredSkillMatches: z.array(z.string()),
    commercialConstraintConfidence: z.enum([
      "not_requested",
      "unconfirmed",
      "confirmed",
    ]),
    requirementAssessments: z.array(RequirementAssessmentSchema),
    scoreBreakdown: ScoreBreakdownSchema,
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
    // Optional only for honest restoration of historical v10 rows. Every v11+
    // result created by buildShortlist writes all five fields.
    recommendationRole: z.enum(["primary", "alternative", "partial"]).optional(),
    fitScore: z.number().int().min(0).max(100).optional(),
    coreCoverage: z.number().int().min(0).max(100).optional(),
    requirementAssessments: z.array(RequirementAssessmentSchema).optional(),
    scoreBreakdown: ScoreBreakdownSchema.optional(),
    orderingEvidence: z
      .object({
        optionalSkillMatchCount: z.number().int().nonnegative().optional(),
        coreSkillMatchCount: z.number().int().nonnegative().optional(),
        fitScoreBasisPoints: z.number().int().min(0).max(10_000).optional(),
        coreCoverageBasisPoints: z.number().int().min(0).max(10_000).optional(),
        evidenceConfidenceBasisPoints: z.number().int().min(0).max(10_000).optional(),
        contextEvidenceMatchCount: z.number().int().nonnegative().optional(),
        verifiedRequiredSkillMatchCount: z.number().int().nonnegative().optional(),
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
    ruleVersion: z.enum(READABLE_RULE_VERSIONS),
    orderingRule: z.tuple([
      z.literal("fit_score_desc"),
      z.literal("core_coverage_desc"),
      z.literal("evidence_confidence_desc"),
      z.literal("verified_required_skill_matches_desc"),
      z.literal("commercial_constraint_confidence_desc"),
      z.literal("availability_status_priority"),
      z.literal("optional_skill_matches_desc"),
      z.literal("context_evidence_matches_desc"),
      z.literal("available_from_asc_unknown_last"),
      z.literal("display_name_asc"),
      z.literal("profile_id_asc"),
    ]),
    /**
     * `needs_clarification` means the brief carried no requirement to rank
     * against — not that nothing matched. The two are opposite statements to a
     * user and must not collapse into an empty `matches` array: ranking a brief
     * with no stated requirement falls through every skill criterion down to
     * the display name, which returns the alphabetically first profiles while
     * still presenting them as matches.
     */
    status: z.enum(["ranked", "needs_clarification", "no_reliable_match"]),
    clarificationCode: z
      .enum(["no_extractable_requirement", "ambiguous_requirement_logic"])
      .nullable(),
    decisionSnapshot: MatchingDecisionSnapshotSchema,
    matches: z.array(ShortlistMatchSchema).max(3),
    partialMatches: z.array(ShortlistMatchSchema).max(MAX_PARTIAL_MATCHES),
  })
  .strict()
  .refine(
    (value) => value.status === "ranked" || value.matches.length === 0,
    "Only a ranked shortlist can carry matches.",
  )
  .refine(
    (value) => value.status !== "ranked" || value.matches.length > 0,
    "A ranked shortlist must contain at least one reliable match.",
  )
  .refine(
    (value) => value.status === "no_reliable_match" || value.partialMatches.length === 0,
    "Partial matches are only allowed when no reliable match exists.",
  )
  .refine(
    (value) => value.partialMatches.every((match) => match.recommendationRole === "partial"),
    "Every partial match must be labeled as partial.",
  )
  .refine(
    (value) => (value.status === "needs_clarification") === (value.clarificationCode !== null),
    "clarificationCode must be set exactly when the shortlist needs clarification.",
  );

export type ProfileEvaluation = z.infer<typeof ProfileEvaluationSchema>;
export type ShortlistMatch = z.infer<typeof ShortlistMatchSchema>;
export type Shortlist = z.infer<typeof ShortlistSchema>;
export type MatchingDecisionSnapshot = z.infer<
  typeof MatchingDecisionSnapshotSchema
>;
export type MatchingEvaluationSnapshot = z.infer<
  typeof MatchingEvaluationSnapshotSchema
>;

export function matchingEvaluationSnapshot(
  match: Pick<
    ShortlistMatch,
    | "recommendationRole"
    | "fitScore"
    | "coreCoverage"
    | "requirementAssessments"
    | "scoreBreakdown"
  >,
): MatchingEvaluationSnapshot {
  return MatchingEvaluationSnapshotSchema.parse({
    schemaVersion: 1,
    recommendationRole: match.recommendationRole,
    fitScore: match.fitScore,
    coreCoverage: match.coreCoverage,
    requirementAssessments: match.requirementAssessments,
    scoreBreakdown: match.scoreBreakdown,
  });
}
type RequirementAssessment = z.infer<typeof RequirementAssessmentSchema>;

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ");
}

type RequirementStrength = "hard" | "soft" | "neutral";

const HARD_REQUIREMENT_MARKER =
  /(?:\bmuss(?:[-\s]?anforderungen?)?\b|\bmust(?:[-\s]?haves?)?\b|\bzwingend(?:e[rsn]?)?\b|\bausschlusskriteri(?:um|en)\b|\bknock[-\s]?out\b)/iu;
const SOFT_REQUIREMENT_MARKER =
  /(?:\bsoll(?:[-\s]?anforderungen?)?\b|\boptional(?:e[rsn]?)?\b|\bbevorzugt(?:e[rsn]?)?\b|\bnice[-\s]?to[-\s]?have\b|\bpreferred\b)/iu;
const REQUIREMENT_HEADING_MARKER =
  /(?:anforderungen|requirements|voraussetzungen|qualifikationen|technologien|technologies|skills|constraints|bedingungen)/iu;

function searchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}%+#€$£]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

/**
 * Terms that let `requirementStrength` recognise a requirement in free prose
 * even when the extracted value and the request are written in different
 * languages.
 *
 * The language keys mirror `canonicalLanguage` in lib/data/freelancers.ts —
 * that mapping decides which canonical values a profile can ever carry, so a
 * language missing here is a language whose "muss zwingend" marker is silently
 * lost. Keep the two lists in step.
 *
 * Skill aliases come from the reviewed shared taxonomy; anything not listed
 * falls back to literal string containment.
 */
/**
 * What an unmet must-have requirement does, per field.
 *
 * The decision is keyed on the FIELD, never on how complete an individual
 * profile happens to be. Keying it on per-profile completeness is what made a
 * profile that documented a non-matching value get rejected while a profile
 * that left the field empty passed as a gap — punishing exactly the
 * best-documented freelancers.
 *
 * A field may only reject when the platform actually collects evidence for it.
 * That is a property of the schema, not of a row, so it belongs here:
 *
 * - language / workMode / location are collected and populated on every
 *   production row, so an explicit must-have mismatch is a real knockout.
 * - contractualCapabilities has no source column. It is derived from
 *   prefixed fact strings and is empty on every production row today, so
 *   treating an unmet contractual must-have as a knockout would empty every
 *   shortlist that states one. It stays a visible gap until the column exists —
 *   at which point this entry flips to "reject" in the same change.
 */
type UnmetRequirementOutcome = "reject" | "gap";
type PolicyField = "language" | "workMode" | "location" | "contractual";

// Deliberately typed rather than `as const`: with literal types TypeScript
// narrows each lookup to a single outcome and reports the other branch as
// unreachable, which would mean flipping an entry here is no longer a one-line
// change. The `satisfies`-style key safety comes from the Record type instead.
const UNMET_HARD_REQUIREMENT: Readonly<Record<PolicyField, UnmetRequirementOutcome>> = {
  language: "reject",
  workMode: "reject",
  location: "reject",
  contractual: "gap",
};

const REQUIREMENT_SPECIAL_TERMS: Readonly<Record<string, readonly string[]>> = {
  german: ["german", "deutsch", "deutschsprachig", "deutsche sprache", "muttersprache deutsch"],
  english: ["english", "englisch", "englischsprachig", "englische sprache"],
  spanish: ["spanish", "spanisch", "espanol", "spanische sprache"],
  // `searchText` folds "ö" to "o" but cannot fold the "oe" transliteration,
  // which German writers use routinely on keyboards without umlauts. Both
  // spellings are listed rather than changing the normalizer, which would
  // affect every comparison in this module.
  french: ["french", "französisch", "franzoesisch", "francais", "französische sprache"],
  italian: ["italian", "italienisch", "italiano", "italienische sprache"],
  dutch: ["dutch", "niederländisch", "niederlaendisch", "nederlands", "holländisch"],
  polish: ["polish", "polnisch", "polski", "polnische sprache"],
  remote: ["remote", "remote-arbeit", "remote work"],
  on_site: ["on-site", "onsite", "vor ort", "präsenz", "praesenz"],
  hybrid: ["hybrid", "teilweise remote", "remote anteil"],
};

function requirementTerms(value: string): readonly string[] {
  return [
    ...new Set([
      value,
      ...skillTerms(value),
      ...(REQUIREMENT_SPECIAL_TERMS[normalize(value)] ?? []),
    ]),
  ];
}

function lineContainsRequirement(line: string, value: string): boolean {
  const source = ` ${searchText(line)} `;
  return requirementTerms(value).some((term) => {
    const sought = searchText(term);
    return sought.length > 0 && source.includes(` ${sought} `);
  });
}

function headingStrength(line: string): RequirementStrength | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const withoutMarkup = trimmed.replace(/^[#*\s_-]+|[*\s_:.-]+$/gu, "");
  const looksLikeHeading =
    /^#{1,6}\s/u.test(trimmed) ||
    /:\s*$/u.test(trimmed) ||
    (withoutMarkup.length <= 80 && REQUIREMENT_HEADING_MARKER.test(withoutMarkup));
  if (!looksLikeHeading) return null;
  if (SOFT_REQUIREMENT_MARKER.test(withoutMarkup)) return "soft";
  if (HARD_REQUIREMENT_MARKER.test(withoutMarkup)) return "hard";
  return "neutral";
}

function requirementStrength(originalRequest: string, value: string): RequirementStrength {
  let section: RequirementStrength = "neutral";
  let observedSoft = false;
  let observedNonSoft = false;
  for (const line of originalRequest.split(/\r?\n/u)) {
    const containsRequirement = lineContainsRequirement(line, value);
    if (containsRequirement) {
      if (HARD_REQUIREMENT_MARKER.test(line)) return "hard";
      if (SOFT_REQUIREMENT_MARKER.test(line) || section === "soft") {
        observedSoft = true;
      } else if (section === "hard") {
        return "hard";
      } else {
        observedNonSoft = true;
      }
    }
    section = headingStrength(line) ?? section;
  }
  // A mention outside a "nice to have" section keeps the requirement required.
  //
  // Without this, a posting that lists a skill under "Voraussetzungen" and a
  // sibling of the same skill family under "Bevorzugte Technologien" ends up
  // soft: German mandatory headings carry no must-marker, so they classify as
  // neutral, and neutral used to lose to any later soft mention. Because the
  // match runs against the whole skill family, "Power Automate" in a preferred
  // list silently demoted "Automatisierung von Geschäftsprozessen" from a
  // stated prerequisite to an optional extra.
  //
  // The result is "neutral", not "hard": the skill stays a required skill, but
  // an unmet one is a gap rather than a knockout. Treating mandatory sections
  // as hard would reject every profile missing any single listed skill, which
  // for a typical posting rejects nearly everyone.
  if (observedNonSoft) return "neutral";
  return observedSoft ? "soft" : "neutral";
}

function distinctSkills(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = skillFamily(value) ?? normalize(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function skillFamily(value: string): string | null {
  return skillFamilyKey(value);
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

function matchingNamedFact(
  facts: readonly LabeledFact[],
  requested: string,
): LabeledFact | undefined {
  const keys = new Set(requirementTerms(requested).map(searchText));
  return facts.find((fact) => keys.has(searchText(fact.value)));
}

/**
 * Delivery-capacity statements describe the requested engagement, not a
 * qualification that a curated public profile can normally prove. They remain
 * visible as an open point instead of silently excluding every candidate.
 */
function isDeliveryCapacityConstraint(value: string): boolean {
  const key = normalize(value);
  return (
    /^(?:(?:up to|max(?:imum)?|bis zu|maximal)\s+)?\d{1,3}\s*%\s*(?:auslastung|allocation|capacity)$/u.test(
      key,
    ) ||
    /^(?:vollzeit|full[ -]?time)(?:[- ](?:auslastung|allocation|capacity))?$/u.test(
      key,
    )
  );
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * The structured brief is not authoritative for money. A commercial filter is
 * applied only when at least one amount from that structured range is present
 * in the user's original request. This prevents an invented default (including
 * the former EUR 800 example) from silently excluding a real profile.
 */
function commercialRangeAppearsInRequest(
  originalRequest: string,
  range: {
    min: number | null;
    max: number | null;
    currency: string;
    unit?: "hour" | "day";
  },
  kind: "rate" | "budget",
): boolean {
  const amounts = [range.min, range.max].filter(
    (value): value is number => value !== null,
  );
  return amounts.some((amount) => {
    const variants = new Set([
      String(amount),
      amount.toLocaleString("de-DE", { maximumFractionDigits: 2 }),
      amount.toLocaleString("en-US", { maximumFractionDigits: 2 }),
    ]);
    return [...variants].some((variant) => {
      const pattern = new RegExp(
        `(?:^|\\D)${escapeRegex(variant)}(?:$|\\D)`,
        "gu",
      );
      for (const match of originalRequest.matchAll(pattern)) {
        if (match.index === undefined) continue;
        const context = searchText(
          originalRequest.slice(
            Math.max(0, match.index - 80),
            Math.min(originalRequest.length, match.index + match[0].length + 80),
          ),
        );
        const currencyTerms: Readonly<Record<string, readonly string[]>> = {
          EUR: ["eur", "euro"],
          USD: ["usd", "dollar"],
          GBP: ["gbp", "pound", "pfund"],
        };
        const hasCurrency =
          (range.currency === "EUR" && context.includes("€")) ||
          (currencyTerms[range.currency] ?? []).some((term) =>
            context.split(" ").includes(term),
          );
        const hasCommercialLabel =
          kind === "budget"
            ? /(?:^| )(?:budget|projektbudget|project budget|kostenrahmen)(?: |$)/u.test(
                context,
              )
            : /(?:^| )(?:tagessatz|stundensatz|day rate|hourly rate|rate|satz|pro tag|per day|pro stunde|per hour)(?: |$)/u.test(
                context,
              );
        const hasRequestedUnit =
          range.unit === undefined ||
          (range.unit === "day"
            ? /(?:^| )(?:tagessatz|day rate|pro tag|per day|tag|day)(?: |$)/u.test(context)
            : /(?:^| )(?:stundensatz|hourly rate|pro stunde|per hour|stunde|hour)(?: |$)/u.test(
                context,
              ));
        if ((hasCurrency || hasCommercialLabel) && hasRequestedUnit) return true;
      }
      return false;
    });
  });
}

function commercialEligibility(
  profile: FreelancerProfile,
  brief: ProjectBrief,
): CommercialEvaluation {
  const rejectionReasons: string[] = [];
  const reasons: string[] = [];
  const gaps: string[] = [];
  const rate =
    brief.rate && commercialRangeAppearsInRequest(brief.originalRequest, brief.rate, "rate")
      ? brief.rate
      : null;
  const budget =
    brief.budget &&
    commercialRangeAppearsInRequest(brief.originalRequest, brief.budget, "budget")
      ? brief.budget
      : null;
  const hasCommercialConstraint = rate !== null || budget !== null;
  let hasUnconfirmedConstraint = false;

  if (rate) {
    const profileRate = rate.unit === "hour" ? profile.hourlyRate : profile.dayRate;
    const rateLabel = rate.unit === "hour" ? "Stundensatz" : "Tagessatz";

    if (!profileRate) {
      hasUnconfirmedConstraint = true;
      gaps.push(`${rateLabel} noch nicht bestätigt; Preisgrenze vor der Buchung abstimmen.`);
    } else if (profileRate.currency !== rate.currency) {
      hasUnconfirmedConstraint = true;
      gaps.push(
        `${rateLabel} ist nur in ${profileRate.currency} angegeben; ein verlässlicher Vergleich mit ${rate.currency} ist nicht möglich.`,
      );
    } else if (rate.max !== null && profileRate.amount > rate.max) {
      rejectionReasons.push(
        `Bestätigter ${rateLabel} von ${formatCommercialAmount(profileRate.amount, profileRate.currency)} überschreitet die angegebene Obergrenze von ${formatCommercialAmount(rate.max, rate.currency)}.`,
      );
    } else if (
      rate.min !== null &&
      rate.max === null &&
      profileRate.amount < rate.min
    ) {
      rejectionReasons.push(
        `Bestätigter ${rateLabel} von ${formatCommercialAmount(profileRate.amount, profileRate.currency)} liegt unter der ausdrücklich angegebenen Untergrenze von ${formatCommercialAmount(rate.min, rate.currency)}.`,
      );
    } else {
      reasons.push(
        `Bestätigter ${rateLabel} liegt innerhalb der angegebenen ${rate.currency}-Grenze.`,
      );
    }
  } else if (profile.hourlyRate === null && profile.dayRate === null) {
    gaps.push("Im Profil ist kein Stunden- oder Tagessatz angegeben.");
  }

  if (budget) {
    const minimum = profile.minimumProjectBudget;
    if (!minimum) {
      hasUnconfirmedConstraint = true;
      gaps.push("Mindestprojektbudget noch nicht bestätigt; Budgetpassung vor der Buchung abstimmen.");
    } else if (minimum.currency !== budget.currency) {
      hasUnconfirmedConstraint = true;
      gaps.push(
        `Mindestprojektbudget ist nur in ${minimum.currency} angegeben; ein verlässlicher Vergleich mit ${budget.currency} ist nicht möglich.`,
      );
    } else if (budget.max !== null && minimum.amount > budget.max) {
      rejectionReasons.push(
        `Bestätigtes Mindestprojektbudget von ${formatCommercialAmount(minimum.amount, minimum.currency)} überschreitet das angegebene Maximalbudget von ${formatCommercialAmount(budget.max, budget.currency)}.`,
      );
    } else {
      reasons.push(
        `Bestätigter Mindestprojektwert liegt innerhalb des angegebenen ${budget.currency}-Budgets.`,
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

function requirementGroupsForBrief(brief: ProjectBrief): RequirementGroup[] {
  return brief.schemaVersion === 2
    ? brief.requirementGroups
    : deriveRequirementGroups(brief);
}

function requirementLabel(group: RequirementGroup): string {
  return group.values.join(group.operator === "any_of" ? " oder " : " und ");
}

type AssessedValue = {
  status: "satisfied" | "contradicted" | "unknown";
  fact: LabeledFact | null;
  structured: boolean;
};

function assessRequirementValue(
  group: RequirementGroup,
  value: string,
  profile: FreelancerProfile,
): AssessedValue {
  if (group.category === "skill") {
    const fact = matchingFact(profile.skillTags, value) ?? null;
    return {
      status: fact ? "satisfied" : "unknown",
      fact,
      structured: false,
    };
  }
  if (group.category === "language") {
    const fact = matchingNamedFact(profile.languages, value) ?? null;
    return {
      status: fact
        ? "satisfied"
        : profile.languages.length > 0
          ? "contradicted"
          : "unknown",
      fact,
      structured: false,
    };
  }
  if (group.category === "work_mode") {
    const satisfied = profile.workModes.includes(
      value as FreelancerProfile["workModes"][number],
    );
    return {
      status: satisfied ? "satisfied" : "contradicted",
      fact: null,
      structured: satisfied,
    };
  }
  if (group.category === "location") {
    const satisfied = Boolean(
      profile.location && locationMatches(profile.location.value, value),
    );
    return {
      status: satisfied
        ? "satisfied"
        : profile.location
          ? "contradicted"
          : "unknown",
      fact: satisfied ? profile.location : null,
      structured: false,
    };
  }
  const facts =
    group.category === "qualification"
      ? profile.qualifications
      : profile.contractualCapabilities;
  const fact = matchingNamedFact(facts, value) ?? null;
  return {
    // These profile lists are not declared exhaustive. An absent value is
    // therefore unknown, never evidence that the freelancer lacks it.
    status: fact ? "satisfied" : "unknown",
    fact,
    structured: false,
  };
}

function assessRequirementGroup(
  group: RequirementGroup,
  profile: FreelancerProfile,
): RequirementAssessment {
  const values = group.values.map((value) => ({
    value,
    assessment: assessRequirementValue(group, value, profile),
  }));
  const matched = values.filter(
    ({ assessment }) => assessment.status === "satisfied",
  );
  const status =
    group.operator === "any_of"
      ? matched.length > 0
        ? "satisfied"
        : values.every(({ assessment }) => assessment.status === "contradicted")
          ? "contradicted"
          : "unknown"
      : matched.length === values.length
        ? "satisfied"
        : values.some(({ assessment }) => assessment.status === "contradicted")
          ? "contradicted"
          : "unknown";
  const satisfyingEvidence =
    status !== "satisfied"
      ? "unknown"
      : group.operator === "any_of"
        ? matched.some(({ assessment }) => assessment.fact?.source === "verified")
          ? "verified"
          : matched.some(({ assessment }) => assessment.structured)
            ? "structured"
            : "self_reported"
        : matched.every(({ assessment }) => assessment.fact?.source === "verified")
          ? "verified"
          : matched.every(({ assessment }) => assessment.structured)
            ? "structured"
            : "self_reported";
  return RequirementAssessmentSchema.parse({
    groupId: group.id,
    category: group.category,
    priority: group.priority,
    operator: group.operator,
    values: group.values,
    status,
    matchedValues: matched.map(({ value }) => value),
    evidence: satisfyingEvidence,
  });
}

function ratioBasisPoints(satisfied: number, total: number): number {
  return total === 0 ? 0 : Math.round((satisfied * 10_000) / total);
}

function evidenceBasisPoints(
  evidence: RequirementAssessment["evidence"],
): number {
  if (evidence === "verified") return 10_000;
  if (evidence === "structured") return 7_500;
  if (evidence === "self_reported") return 5_000;
  return 0;
}

function averageBasisPoints(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function weightedBasisPoints(
  components: readonly { value: number | null; weight: number }[],
): number {
  const supplied = components.filter(
    (component): component is { value: number; weight: number } =>
      component.value !== null,
  );
  const totalWeight = supplied.reduce((sum, component) => sum + component.weight, 0);
  if (totalWeight === 0) return 0;
  return Math.round(
    supplied.reduce(
      (sum, component) => sum + component.value * component.weight,
      0,
    ) / totalWeight,
  );
}

/**
 * Availability is scored on every run regardless of what the request says, so
 * an unconfirmed calendar cannot make a detailed request score worse than a
 * vague one. It stays a graded profile attribute, not a "silence" case.
 */
function availabilityFitBasisPoints(
  profile: FreelancerProfile,
  brief: ProjectBrief,
): number {
  if (!availableBy(profile, brief)) return 0;
  if (profile.availability.status === "available") return 10_000;
  if (profile.availability.status === "limited") return 6_000;
  if (profile.availability.status === "unknown") return 3_000;
  return 0;
}

/**
 * Share of *decidable* assessments that are satisfied.
 *
 * A requirement the profile contradicts is a miss. A requirement the profile
 * is simply silent about is not evidence of anything, so it leaves the
 * denominator and surfaces as a gap to clarify instead.
 *
 * Counting silence as a miss made the score fall the more a client wrote: each
 * further condition opened another dimension the catalogue had no data for, so
 * a detailed request scored worse than a vague one for the very same person.
 * Core skills are deliberately not scored this way — there, missing evidence
 * really does mean the competence is undemonstrated.
 */
function decidedRatioBasisPoints(
  assessments: readonly RequirementAssessment[],
): number | null {
  const decided = assessments.filter(
    (assessment) =>
      assessment.status === "satisfied" || assessment.status === "contradicted",
  );
  if (decided.length === 0) return null;
  return ratioBasisPoints(
    decided.filter((assessment) => assessment.status === "satisfied").length,
    decided.length,
  );
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
  const requirementGroups = requirementGroupsForBrief(brief);
  const requirementAssessments = requirementGroups.map((group) =>
    assessRequirementGroup(group, profile),
  );

  /**
   * Whether the request states a value as a must-have.
   *
   * Every unmet-requirement branch below decides on this and on nothing else.
   * In particular it must never also depend on whether the profile happens to
   * carry data in that field: making rejection conditional on data presence
   * means a profile that documents a non-matching value is rejected while one
   * that leaves the field empty passes as a gap — which systematically punishes
   * the best-documented profiles.
   */
  const isHard = (value: string): boolean => {
    const normalizedValue = normalize(value);
    const family = skillFamily(value);
    const group = requirementGroups.find((candidate) =>
      candidate.values.some((candidateValue) => {
        const candidateFamily = skillFamily(candidateValue);
        return (
          normalize(candidateValue) === normalizedValue ||
          (family !== null && candidateFamily === family)
        );
      }),
    );
    return group
      ? group.priority === "hard"
      : requirementStrength(brief.originalRequest, value) === "hard";
  };

  // Being listed and active is a precondition for appearing at all, so it is
  // not a reason why this profile fits this project. It stays a rejection when
  // absent and produces no match reason when present.
  if (profile.profileStatus !== "active") {
    rejectionReasons.push("Profil ist nicht aktiv.");
  }
  if (profile.demoStatus !== "real") {
    rejectionReasons.push("Profil ist kein reales Produktionsprofil.");
  }
  if (!secureBookingUrl(profile)) {
    rejectionReasons.push("Profil hat keinen sicheren direkten Booking-Link.");
  }

  // An exclusion is a filter, never a score component. "Keine Angular-Leute"
  // has to remove those profiles outright — ranking them lower would still put
  // one at the top as soon as the rest of the field is thin.
  for (const excluded of brief.excludedSkills ?? []) {
    const present =
      matchingFact(profile.skillTags, excluded) ??
      matchingFact(profile.contextEvidence, excluded);
    if (present) {
      rejectionReasons.push(
        `Ausgeschlossen: Das Profil führt ${present.value}.`,
      );
    }
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

  const skillGroups = requirementGroups.filter(
    (group) => group.category === "skill",
  );
  const coreSkillGroups = skillGroups.filter(
    (group) => group.priority !== "optional",
  );
  const optionalSkillGroups = skillGroups.filter(
    (group) => group.priority === "optional",
  );
  const coreSkillAssessments = requirementAssessments.filter(
    (assessment) =>
      assessment.category === "skill" && assessment.priority !== "optional",
  );
  const optionalSkillAssessments = requirementAssessments.filter(
    (assessment) =>
      assessment.category === "skill" && assessment.priority === "optional",
  );
  const relevanceAssessments =
    coreSkillAssessments.length > 0
      ? coreSkillAssessments
      : optionalSkillAssessments;
  const relevanceSkills = distinctSkills(
    (coreSkillGroups.length > 0 ? coreSkillGroups : optionalSkillGroups).flatMap(
      (group) => group.values,
    ),
  );
  const coreSkills = distinctSkills(coreSkillGroups.flatMap((group) => group.values));
  const optionalSkills = distinctSkills(
    optionalSkillGroups.flatMap((group) => group.values),
  );
  const requestedSkillLabels = [
    ...(brief.requiredSkills ?? []),
    ...(brief.optionalSkills ?? []),
  ];
  const requestedSkillLabel = (value: string): string => {
    const family = skillFamily(value);
    return (
      requestedSkillLabels.find((candidate) => {
        const candidateFamily = skillFamily(candidate);
        return (
          normalize(candidate) === normalize(value) ||
          (family !== null && candidateFamily === family)
        );
      }) ?? value
    );
  };
  const coreSkillMatches = distinctSkills(
    coreSkillAssessments
      .flatMap((assessment) => assessment.matchedValues)
      .map(requestedSkillLabel),
  );
  const optionalSkillMatches = distinctSkills(
    optionalSkillAssessments
      .flatMap((assessment) => assessment.matchedValues)
      .map(requestedSkillLabel),
  );
  if (
    relevanceAssessments.length > 0 &&
    !relevanceAssessments.some((assessment) => assessment.matchedValues.length > 0)
  ) {
    rejectionReasons.push(
      `Keine sinnvolle Kernüberschneidung mit dem Projekt ist im Profil belegt: ${relevanceSkills.join(", ")}.`,
    );
  } else if (coreSkillMatches.length) {
    matchReasons.push(`Belegte Kernkompetenzen: ${coreSkillMatches.join(", ")}.`);
    for (const assessment of coreSkillAssessments.filter(
      (candidate) => candidate.status !== "satisfied",
    )) {
      const group = coreSkillGroups.find(
        (candidate) => candidate.id === assessment.groupId,
      );
      if (!group) continue;
      knownGaps.push(
        group.priority === "hard"
          ? `Explizite Muss-Kompetenz ist im Profil nicht belegt: ${requirementLabel(group)}; vor dem Gespräch verifizieren.`
          : `Weitere Kernkompetenz ist im Profil nicht belegt: ${requirementLabel(group)}.`,
      );
    }
  } else if (optionalSkillMatches.length) {
    matchReasons.push(
      `Belegte ergänzende Kompetenzen: ${optionalSkillMatches.join(", ")}.`,
    );
  }

  // Language, work mode and location share one shape: match, or resolve the
  // unmet requirement through UNMET_HARD_REQUIREMENT. The branch never consults
  // how much data the profile carries.
  const resolveUnmet = (
    field: keyof typeof UNMET_HARD_REQUIREMENT,
    value: string,
    text: { hard: string; soft: string },
  ): void => {
    if (isHard(value) && UNMET_HARD_REQUIREMENT[field] === "reject") {
      rejectionReasons.push(text.hard);
    } else if (isHard(value)) {
      knownGaps.push(text.hard);
    } else {
      knownGaps.push(text.soft);
    }
  };

  if (brief.language) {
    if (matchingNamedFact(profile.languages, brief.language)) {
      matchReasons.push(`Sprache passend: ${brief.language}.`);
    } else {
      resolveUnmet("language", brief.language, {
        hard: `Explizit zwingende Sprache wird nicht unterstützt: ${brief.language}.`,
        soft: `Sprache im Profil nicht bestätigt: ${brief.language}.`,
      });
    }
  }

  if (brief.workMode !== "unknown") {
    if (profile.workModes.includes(brief.workMode)) {
      matchReasons.push(`Arbeitsmodus passend: ${brief.workMode}.`);
    } else {
      resolveUnmet("workMode", brief.workMode, {
        hard: `Explizit zwingender Arbeitsmodus wird nicht unterstützt: ${brief.workMode}.`,
        soft: `Arbeitsmodus im Profil nicht bestätigt: ${brief.workMode}.`,
      });
    }
  }

  if (brief.location && brief.workMode !== "remote") {
    if (profile.location && locationMatches(profile.location.value, brief.location)) {
      matchReasons.push(`Ort passend: ${brief.location}.`);
    } else {
      resolveUnmet("location", brief.location, {
        hard: `Explizit zwingender Einsatzort passt nicht: ${brief.location}.`,
        soft: `Einsatzort im Profil nicht bestätigt: ${brief.location}.`,
      });
    }
  }

  if (!availableBy(profile, brief)) {
    const startRequirement =
      brief.availabilityRequirement ?? brief.startWindow?.raw ?? "";
    if (
      startRequirement &&
      isHard(startRequirement)
    ) {
      rejectionReasons.push(
        "Explizit zwingendes Startfenster liegt vor der bestätigten Verfügbarkeit.",
      );
    } else {
      knownGaps.push(
        "Bestätigte Verfügbarkeit beginnt nach dem gewünschten Startfenster; im Erstgespräch abstimmen.",
      );
    }
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

  const matchedContractTerms = (brief.contractualRequirements ?? []).filter(
    (term) => matchingNamedFact(profile.contractualCapabilities, term),
  );
  const missingContractTerms = (brief.contractualRequirements ?? []).filter(
    (term) => !matchingNamedFact(profile.contractualCapabilities, term),
  );
  if (matchedContractTerms.length) {
    matchReasons.push(`Vertragsanforderungen passend: ${matchedContractTerms.join(", ")}.`);
  }
  if (missingContractTerms.length) {
    const explicitHardMissing = missingContractTerms.filter(isHard);
    const unknownMissing = missingContractTerms.filter(
      (term) => !explicitHardMissing.includes(term),
    );
    // Resolved through the same per-field policy as language, work mode and
    // location — never through how many capabilities this particular profile
    // documents. See UNMET_HARD_REQUIREMENT for why contractual terms stay a
    // gap while the source column is missing.
    if (explicitHardMissing.length) {
      const text = `Explizit zwingende Vertragsanforderungen sind im Profil nicht belegt: ${explicitHardMissing.join(", ")}.`;
      if (UNMET_HARD_REQUIREMENT.contractual === "reject") {
        rejectionReasons.push(text);
      } else {
        knownGaps.push(text);
      }
    }
    if (unknownMissing.length) {
      knownGaps.push(
        `Vertragsanforderungen im Profil nicht bestätigt: ${unknownMissing.join(", ")}.`,
      );
    }
  }

  // Constraints are confirmed only from curated public profile evidence. A
  // missing fact is unknown, not proof of incompatibility, and therefore stays
  // visible as a gap. We never infer residency from a current location.
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
    if (matchingNamedFact(publicConstraintFacts, constraint)) {
      matchReasons.push(`Weitere Rahmenbedingung bestätigt: ${constraint}.`);
    } else if (isDeliveryCapacityConstraint(constraint)) {
      knownGaps.push(
        `Gewünschte Projektauslastung im Profil nicht bestätigt: ${constraint}; im Erstgespräch abstimmen.`,
      );
    } else {
      const label =
        isHard(constraint)
          ? "Explizite Muss-Bedingung"
          : "Weitere Rahmenbedingung";
      knownGaps.push(
        `${label} ist im Profil nicht bestätigt: ${constraint}.`,
      );
    }
  }

  const commercial = commercialEligibility(profile, brief);
  rejectionReasons.push(...commercial.rejectionReasons);
  matchReasons.push(...commercial.reasons);
  knownGaps.push(...commercial.gaps);

  if (optionalSkillMatches.length) {
    matchReasons.push(`Optionale Kompetenzen passend: ${optionalSkillMatches.join(", ")}.`);
  }
  const missingOptionalGroups = optionalSkillAssessments.filter(
    (assessment) => assessment.status !== "satisfied",
  );
  if (missingOptionalGroups.length) {
    knownGaps.push(
      `Optionale Kompetenzen nicht aufgeführt: ${missingOptionalGroups
        .map((assessment) => {
          const group = optionalSkillGroups.find(
            (candidate) => candidate.id === assessment.groupId,
          );
          return group ? requirementLabel(group) : assessment.values.join(", ");
        })
        .join(", ")}.`,
    );
  }

  const exactRequiredSkillMatches = coreSkills.filter((skill) =>
    includesFact(profile.skillTags, skill),
  );

  // Context evidence supports a requirement without claiming the skill. It can
  // only ever break a tie between profiles that already match on skills — it is
  // never consulted for eligibility.
  const contextEvidenceMatches = [...coreSkills, ...optionalSkills].filter(
    (skill) => !matchingFact(profile.skillTags, skill) && matchingFact(profile.contextEvidence, skill),
  );
  if (contextEvidenceMatches.length) {
    matchReasons.push(
      `Ergänzend belegt über Branche, Zertifikat oder Projekterfahrung: ${contextEvidenceMatches.join(", ")}.`,
    );
  }
  const verifiedRequiredSkillMatches = coreSkills.filter(
    (skill) => matchingFact(profile.skillTags, skill)?.source === "verified",
  );

  // The 70% reliability threshold is deliberately computed over skill groups.
  // Language, mode and location have their own score component and every hard
  // group still has to be satisfied, so categorical facts are neither ignored
  // nor counted twice in the coverage gate.
  const coreRequirementAssessments = coreSkillAssessments;
  const optionalRequirementAssessments = optionalSkillAssessments;
  const coverageAssessments =
    coreRequirementAssessments.length > 0
      ? coreRequirementAssessments
      : optionalRequirementAssessments;
  const coreCoverageBasisPoints = ratioBasisPoints(
    coverageAssessments.filter((assessment) => assessment.status === "satisfied").length,
    coverageAssessments.length,
  );
  const optionalCoverageBasisPoints =
    optionalRequirementAssessments.length > 0
      ? ratioBasisPoints(
          optionalRequirementAssessments.filter(
            (assessment) => assessment.status === "satisfied",
          ).length,
          optionalRequirementAssessments.length,
        )
      : null;
  const categoricalAssessments = requirementAssessments.filter(
    (assessment) => assessment.category !== "skill",
  );
  const categoricalFitBasisPoints = decidedRatioBasisPoints(
    categoricalAssessments,
  );
  const availabilityScore = availabilityFitBasisPoints(profile, brief);
  // `unconfirmed` means the profile carries no rate or budget at all. A rate
  // that actually breaches the stated limit is a rejection reason further up,
  // never a score of 4_000 — so scoring silence here only ever punished
  // clients for naming a budget.
  const commercialFitBasisPoints =
    commercial.confidence === "confirmed" ? 10_000 : null;
  const evidenceConfidenceBasisPoints =
    averageBasisPoints(
      coreRequirementAssessments
        .filter((assessment) => assessment.status === "satisfied")
        .map((assessment) => evidenceBasisPoints(assessment.evidence)),
    ) ?? 0;
  const fitScoreBasisPoints = weightedBasisPoints([
    {
      value: coverageAssessments.length > 0 ? coreCoverageBasisPoints : null,
      weight: 55,
    },
    { value: optionalCoverageBasisPoints, weight: 15 },
    { value: categoricalFitBasisPoints, weight: 10 },
    { value: availabilityScore, weight: 10 },
    { value: commercialFitBasisPoints, weight: 5 },
    {
      value:
        coreRequirementAssessments.some(
          (assessment) => assessment.status === "satisfied",
        )
          ? evidenceConfidenceBasisPoints
          : null,
      weight: 5,
    },
  ]);
  const scoreBreakdown = ScoreBreakdownSchema.parse({
    scoreVersion: MATCHING_SCORE_VERSION,
    fitScoreBasisPoints,
    coreCoverageBasisPoints,
    optionalCoverageBasisPoints,
    categoricalFitBasisPoints,
    availabilityFitBasisPoints: availabilityScore,
    commercialFitBasisPoints,
    evidenceConfidenceBasisPoints,
    minimumCoreCoverageBasisPoints: MINIMUM_CORE_COVERAGE_BASIS_POINTS,
  });
  const eligible = rejectionReasons.length === 0;
  const allHardRequirementsSatisfied = requirementAssessments
    .filter((assessment) => assessment.priority === "hard")
    .every((assessment) => assessment.status === "satisfied");
  const reliable =
    eligible &&
    coverageAssessments.length > 0 &&
    allHardRequirementsSatisfied &&
    coreCoverageBasisPoints >= MINIMUM_CORE_COVERAGE_BASIS_POINTS;

  return ProfileEvaluationSchema.parse({
    eligible,
    reliable,
    rejectionReasons,
    matchReasons,
    knownGaps,
    optionalSkillMatches,
    coreSkillMatches,
    exactRequiredSkillMatches,
    contextEvidenceMatches,
    verifiedRequiredSkillMatches,
    commercialConstraintConfidence: commercial.confidence,
    requirementAssessments,
    scoreBreakdown,
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

/**
 * Whether the brief states anything a profile can be ranked against.
 *
 * Mirrors `relevanceSkills` inside `evaluateProfile`, which spans required and
 * optional skills together. When both are absent there is no relevance signal
 * at all, the skill-overlap rejection never fires, and every active profile
 * stays eligible.
 */
function hasRankableRequirement(brief: ProjectBrief): boolean {
  return requirementGroupsForBrief(brief).some(
    (group) => group.category === "skill",
  );
}

function matchingDecisionSnapshot(
  status: Shortlist["status"],
  evaluated: readonly {
    profile: FreelancerProfile;
    evaluation: ProfileEvaluation;
  }[],
  primaryProfileId: string | null,
  partialProfileIds: readonly string[] = [],
): MatchingDecisionSnapshot {
  const openRequirementCounts = new Map<string, number>();
  for (const { evaluation } of evaluated) {
    for (const assessment of evaluation.requirementAssessments) {
      if (
        assessment.priority === "optional" ||
        assessment.status === "satisfied"
      ) {
        continue;
      }
      const label = assessment.values.join(
        assessment.operator === "any_of" ? " oder " : " und ",
      );
      openRequirementCounts.set(
        label,
        (openRequirementCounts.get(label) ?? 0) + 1,
      );
    }
  }
  return MatchingDecisionSnapshotSchema.parse({
    schemaVersion: 2,
    scoreVersion: MATCHING_SCORE_VERSION,
    status,
    minimumCoreCoverageBasisPoints: MINIMUM_CORE_COVERAGE_BASIS_POINTS,
    evaluatedProfileCount: evaluated.length,
    catalogEligibleProfileCount: evaluated.filter(
      ({ evaluation }) => evaluation.eligible,
    ).length,
    reliableProfileCount: evaluated.filter(
      ({ evaluation }) => evaluation.reliable,
    ).length,
    failureCounts: {
      hardConflict: evaluated.filter(({ evaluation }) =>
        evaluation.requirementAssessments.some(
          (assessment) =>
            assessment.priority === "hard" &&
            assessment.status === "contradicted",
        ),
      ).length,
      hardUnknown: evaluated.filter(({ evaluation }) =>
        evaluation.requirementAssessments.some(
          (assessment) =>
            assessment.priority === "hard" && assessment.status === "unknown",
        ),
      ).length,
      belowCoreCoverage: evaluated.filter(
        ({ evaluation }) =>
          evaluation.eligible &&
          evaluation.scoreBreakdown.coreCoverageBasisPoints <
            MINIMUM_CORE_COVERAGE_BASIS_POINTS,
      ).length,
    },
    primaryProfileId,
    partialProfileIds,
    openCoreRequirements: [...openRequirementCounts.entries()]
      .sort(
        ([leftLabel, leftCount], [rightLabel, rightCount]) =>
          rightCount - leftCount || compareText(leftLabel, rightLabel),
      )
      .slice(0, 5)
      .map(([label]) => label),
  });
}

type EvaluatedProfile = {
  profile: FreelancerProfile;
  evaluation: ProfileEvaluation;
};

function compareEvaluatedProfiles(
  left: EvaluatedProfile,
  right: EvaluatedProfile,
): number {
  const fitScoreDifference =
    right.evaluation.scoreBreakdown.fitScoreBasisPoints -
    left.evaluation.scoreBreakdown.fitScoreBasisPoints;
  if (fitScoreDifference) return fitScoreDifference;
  const coreCoverageDifference =
    right.evaluation.scoreBreakdown.coreCoverageBasisPoints -
    left.evaluation.scoreBreakdown.coreCoverageBasisPoints;
  if (coreCoverageDifference) return coreCoverageDifference;
  const evidenceConfidenceDifference =
    right.evaluation.scoreBreakdown.evidenceConfidenceBasisPoints -
    left.evaluation.scoreBreakdown.evidenceConfidenceBasisPoints;
  if (evidenceConfidenceDifference) return evidenceConfidenceDifference;
  const verifiedDifference =
    right.evaluation.requirementAssessments.filter(
      (assessment) =>
        assessment.category === "skill" &&
        assessment.priority !== "optional" &&
        assessment.status === "satisfied" &&
        assessment.evidence === "verified",
    ).length -
    left.evaluation.requirementAssessments.filter(
      (assessment) =>
        assessment.category === "skill" &&
        assessment.priority !== "optional" &&
        assessment.status === "satisfied" &&
        assessment.evidence === "verified",
    ).length;
  if (verifiedDifference) return verifiedDifference;
  const commercialConfidenceDifference =
    commercialConfidencePriority(right.evaluation.commercialConstraintConfidence) -
    commercialConfidencePriority(left.evaluation.commercialConstraintConfidence);
  if (commercialConfidenceDifference) return commercialConfidenceDifference;
  const availabilityDifference =
    availabilityPriority(left.profile.availability.status) -
    availabilityPriority(right.profile.availability.status);
  if (availabilityDifference) return availabilityDifference;
  const optionalDifference =
    right.evaluation.requirementAssessments.filter(
      (assessment) =>
        assessment.category === "skill" &&
        assessment.priority === "optional" &&
        assessment.status === "satisfied",
    ).length -
    left.evaluation.requirementAssessments.filter(
      (assessment) =>
        assessment.category === "skill" &&
        assessment.priority === "optional" &&
        assessment.status === "satisfied",
    ).length;
  if (optionalDifference) return optionalDifference;
  const contextEvidenceDifference =
    right.evaluation.contextEvidenceMatches.length -
    left.evaluation.contextEvidenceMatches.length;
  if (contextEvidenceDifference) return contextEvidenceDifference;
  const leftDate = left.profile.availability.availableFrom ?? "9999-12-31";
  const rightDate = right.profile.availability.availableFrom ?? "9999-12-31";
  if (leftDate !== rightDate) return leftDate < rightDate ? -1 : 1;
  const nameDifference = compareText(left.profile.displayName, right.profile.displayName);
  if (nameDifference) return nameDifference;
  return compareText(left.profile.id, right.profile.id);
}

function shortlistMatch(
  { profile, evaluation }: EvaluatedProfile,
  recommendationRole: "primary" | "alternative" | "partial",
): ShortlistMatch {
  return ShortlistMatchSchema.parse({
    profile,
    matchReasons: evaluation.matchReasons,
    knownGaps: evaluation.knownGaps,
    ...sourceDisclosures(profile),
    availabilityStatus: profile.availability.status,
    availabilityCheckedAt: profile.availability.checkedAt,
    profileDataVersion: profile.dataVersion,
    recommendationRole,
    fitScore: Math.round(evaluation.scoreBreakdown.fitScoreBasisPoints / 100),
    coreCoverage: Math.round(
      evaluation.scoreBreakdown.coreCoverageBasisPoints / 100,
    ),
    requirementAssessments: evaluation.requirementAssessments,
    scoreBreakdown: evaluation.scoreBreakdown,
    orderingEvidence: {
      optionalSkillMatchCount: evaluation.optionalSkillMatches.length,
      coreSkillMatchCount: evaluation.coreSkillMatches.length,
      fitScoreBasisPoints: evaluation.scoreBreakdown.fitScoreBasisPoints,
      coreCoverageBasisPoints:
        evaluation.scoreBreakdown.coreCoverageBasisPoints,
      evidenceConfidenceBasisPoints:
        evaluation.scoreBreakdown.evidenceConfidenceBasisPoints,
      contextEvidenceMatchCount: evaluation.contextEvidenceMatches.length,
      verifiedRequiredSkillMatchCount: evaluation.verifiedRequiredSkillMatches.length,
      commercialConstraintConfidence: evaluation.commercialConstraintConfidence,
      availabilityPriority: availabilityPriority(profile.availability.status),
      availableFrom: profile.availability.availableFrom,
    },
  });
}

export function buildShortlist(
  rawBrief: ProjectBrief,
  rawProfiles: readonly FreelancerProfile[],
): Shortlist {
  const brief = ProjectBriefSchema.parse(rawBrief);

  const clarificationCode = hasAmbiguousSkillConnectors(brief)
    ? "ambiguous_requirement_logic"
    : !hasRankableRequirement(brief)
      ? "no_extractable_requirement"
      : null;
  if (clarificationCode) {
    return ShortlistSchema.parse({
      ruleVersion: MATCHING_RULE_VERSION,
      orderingRule: MATCHING_ORDER_RULE,
      status: "needs_clarification",
      clarificationCode,
      decisionSnapshot: matchingDecisionSnapshot(
        "needs_clarification",
        [],
        null,
      ),
      matches: [],
      partialMatches: [],
    });
  }

  const evaluated = rawProfiles.map((rawProfile) => {
    const profile = FreelancerProfileSchema.parse(rawProfile);
    return { profile, evaluation: evaluateProfile(brief, profile) };
  });

  const reliable = evaluated.filter((item) => item.evaluation.reliable);
  if (reliable.length === 0) {
    const partialMatches = evaluated
      .filter(
        ({ evaluation }) =>
          evaluation.eligible &&
          evaluation.scoreBreakdown.coreCoverageBasisPoints >=
            MINIMUM_PARTIAL_COVERAGE_BASIS_POINTS,
      )
      .sort(compareEvaluatedProfiles)
      .slice(0, MAX_PARTIAL_MATCHES)
      .map((item) => shortlistMatch(item, "partial"));
    return ShortlistSchema.parse({
      ruleVersion: MATCHING_RULE_VERSION,
      orderingRule: MATCHING_ORDER_RULE,
      status: "no_reliable_match",
      clarificationCode: null,
      decisionSnapshot: matchingDecisionSnapshot(
        "no_reliable_match",
        evaluated,
        null,
        partialMatches.map((match) => match.profile.id),
      ),
      matches: [],
      partialMatches,
    });
  }

  reliable.sort(compareEvaluatedProfiles);

  const matches = reliable
    .slice(0, 3)
    .map((item, index) =>
      shortlistMatch(item, index === 0 ? "primary" : "alternative"),
    );

  return ShortlistSchema.parse({
    ruleVersion: MATCHING_RULE_VERSION,
    orderingRule: MATCHING_ORDER_RULE,
    status: "ranked",
    clarificationCode: null,
    decisionSnapshot: matchingDecisionSnapshot(
      "ranked",
      evaluated,
      matches[0]?.profile.id ?? null,
    ),
    matches,
    partialMatches: [],
  });
}
