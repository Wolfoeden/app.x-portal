import { z } from "zod";

import { type ProjectBrief, ProjectBriefSchema } from "./brief";
import {
  type FreelancerProfile,
  FreelancerProfileSchema,
  type LabeledFact,
} from "./profile";

export const MATCHING_RULE_VERSION = "freelancer-match-v10" as const;

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
  "core_skill_matches_desc",
  "commercial_constraint_confidence_desc",
  "availability_status_priority",
  "optional_skill_matches_desc",
  "context_evidence_matches_desc",
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
    coreSkillMatches: z.array(z.string()),
    exactRequiredSkillMatches: z.array(z.string()),
    contextEvidenceMatches: z.array(z.string()),
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
        coreSkillMatchCount: z.number().int().nonnegative().optional(),
        contextEvidenceMatchCount: z.number().int().nonnegative(),
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
      z.literal("core_skill_matches_desc"),
      z.literal("commercial_constraint_confidence_desc"),
      z.literal("availability_status_priority"),
      z.literal("optional_skill_matches_desc"),
      z.literal("context_evidence_matches_desc"),
      z.literal("verified_required_skill_matches_desc"),
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
    status: z.enum(["ranked", "needs_clarification"]),
    clarificationCode: z.enum(["no_extractable_requirement"]).nullable(),
    matches: z.array(ShortlistMatchSchema).max(3),
  })
  .strict()
  .refine(
    (value) => value.status === "ranked" || value.matches.length === 0,
    "A shortlist that needs clarification cannot carry matches.",
  )
  .refine(
    (value) => (value.status === "needs_clarification") === (value.clarificationCode !== null),
    "clarificationCode must be set exactly when the shortlist needs clarification.",
  );

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
      "anforderungsmanagement",
      "anforderungsanalyse",
      "anforderungserhebung",
      "anforderungsklärung",
      "anforderungsklaerung",
      "fachliche anforderungen",
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
      "prozessmanagement",
      "prozessanalyse",
      "geschäftsprozessanalyse",
      "geschaeftsprozessanalyse",
      "geschäftsprozessoptimierung",
      "geschaeftsprozessoptimierung",
      "prozessoptimierung",
      "prozessmodellierung",
      "prozessverbesserung",
      "kontinuierliche verbesserung",
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
      "projektmanagement",
      "projektleitung",
      "technisches projektmanagement",
      "agiles projektmanagement",
      "programmmanagement",
      "projektkoordination",
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
      "informationssicherheit",
      "it-sicherheit",
      "it sicherheit",
      "cybersicherheit",
      "informationssicherheitsmanagement",
    ],
  },
  {
    canonical: "sap s/4hana",
    aliases: ["sap s/4hana", "s/4hana", "sap s4hana", "s4hana", "sap s/4 hana"],
  },
  {
    canonical: "sap mm",
    aliases: [
      "sap mm",
      "sap material management",
      "sap materials management",
      "sap materialwirtschaft",
    ],
  },
  {
    canonical: "sap pp",
    aliases: [
      "sap pp",
      "sap production planning",
      "sap produktionsplanung",
    ],
  },
  {
    canonical: "sap integration",
    aliases: [
      "sap integration",
      "sap integrations",
      "sap-integrationen",
      "sap interfaces",
      "sap schnittstellen",
    ],
  },
  {
    canonical: "sap customizing",
    aliases: [
      "sap customizing",
      "sap customising",
      "sap configuration",
      "sap konfiguration",
    ],
  },
  {
    canonical: "software architecture",
    aliases: [
      "software architecture",
      "software architect",
      "software-architektur",
      "softwarearchitektur",
      "softwarearchitekt",
      "software-architekt",
    ],
  },
  {
    canonical: "ai solution architecture",
    aliases: [
      "ai solution architecture",
      "ai solution architect",
      "ai architecture",
      "ai architect",
      "ki-architektur",
      "ki architektur",
    ],
  },
  {
    canonical: "azure ai",
    aliases: [
      "azure ai",
      "azure ai engineer",
      "azure openai",
      "microsoft azure ai",
    ],
  },
  {
    canonical: "microsoft copilot",
    aliases: [
      "microsoft copilot",
      "microsoft copilot developer",
      "copilot studio",
    ],
  },
  {
    canonical: "ai projects",
    aliases: ["ai projects", "ai project delivery", "ki-projekte", "ki projekte"],
  },
  {
    canonical: "document analysis",
    aliases: [
      "document analysis",
      "document intelligence",
      "document processing",
      "dokumentenanalyse",
      "dokumentenverarbeitung",
      "dokumentenanalyse-verfahren",
    ],
  },
  {
    canonical: "rag",
    aliases: [
      "rag",
      "rag system",
      "rag systems",
      "rag-system",
      "rag-systeme",
      "retrieval augmented generation",
    ],
  },
  {
    canonical: "microsoft 365",
    aliases: ["microsoft 365", "m365", "office 365", "microsoft-365"],
  },
  {
    canonical: "enterprise applications",
    aliases: [
      "enterprise applications",
      "enterprise software",
      "unternehmensanwendungen",
    ],
  },
  {
    canonical: "business process automation",
    aliases: [
      "business process automation",
      "process automation",
      "workflow automation",
      "geschäftsprozessautomatisierung",
      "automatisierung von geschäftsprozessen",
      "power automate",
      "geschäftsprozessautomatisierung",
      "geschaeftsprozessautomatisierung",
      "prozessautomatisierung",
    ],
  },
  {
    canonical: "python",
    aliases: ["python", "python developer", "python entwickler"],
  },
  {
    canonical: "fastapi",
    aliases: ["fastapi", "fastapi developer", "fastapi entwickler"],
  },
  {
    canonical: "postgresql",
    aliases: ["postgresql", "postgres", "postgres sql"],
  },
] as const;

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
 * This is the same shape of hard-coded lookup as SKILL_FAMILIES and carries the
 * same weakness: anything not listed falls back to literal string containment.
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
  const family = skillFamily(value);
  const skillTerms = family
    ? SKILL_FAMILIES.find((candidate) => candidate.canonical === family)?.aliases ?? []
    : [];
  return [
    ...new Set([value, ...skillTerms, ...(REQUIREMENT_SPECIAL_TERMS[normalize(value)] ?? [])]),
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

export function evaluateProfile(
  rawBrief: ProjectBrief,
  rawProfile: FreelancerProfile,
): ProfileEvaluation {
  const brief = ProjectBriefSchema.parse(rawBrief);
  const profile = FreelancerProfileSchema.parse(rawProfile);
  const rejectionReasons: string[] = [];
  const matchReasons: string[] = [];
  const knownGaps: string[] = [];

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
  const isHard = (value: string): boolean =>
    requirementStrength(brief.originalRequest, value) === "hard";

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
  if (profile.availability.status === "unavailable") {
    rejectionReasons.push("Profil ist als nicht verfügbar markiert.");
  } else if (profile.availability.status === "available") {
    matchReasons.push("Projektverfügbarkeit ist aktuell bestätigt.");
  } else if (profile.availability.status === "limited") {
    knownGaps.push("Projektverfügbarkeit ist begrenzt; den genauen Zeitraum beim Termin abstimmen.");
  } else {
    knownGaps.push("Projektverfügbarkeit ist nicht bestätigt; der Booking-Kalender ist verfügbar.");
  }

  const requestedRequiredSkills = brief.requiredSkills ?? [];
  const reclassifiedOptionalSkills = requestedRequiredSkills.filter(
    (skill) => requirementStrength(brief.originalRequest, skill) === "soft",
  );
  const coreSkills = distinctSkills(
    requestedRequiredSkills.filter(
      (skill) => requirementStrength(brief.originalRequest, skill) !== "soft",
    ),
  );
  const optionalSkills = distinctSkills([
    ...(brief.optionalSkills ?? []),
    ...reclassifiedOptionalSkills,
  ]);
  const relevanceSkills = coreSkills.length > 0 ? coreSkills : optionalSkills;
  const matchedRelevanceSkills = relevanceSkills.filter((skill) =>
    matchingFact(profile.skillTags, skill),
  );
  const coreSkillMatches = coreSkills.filter((skill) =>
    matchingFact(profile.skillTags, skill),
  );
  const missingCoreSkills = coreSkills.filter(
    (skill) => !matchingFact(profile.skillTags, skill),
  );
  if (relevanceSkills.length && matchedRelevanceSkills.length === 0) {
    rejectionReasons.push(
      `Keine sinnvolle Kernüberschneidung mit dem Projekt ist im Profil belegt: ${relevanceSkills.join(", ")}.`,
    );
  } else if (coreSkillMatches.length) {
    matchReasons.push(`Belegte Kernkompetenzen: ${coreSkillMatches.join(", ")}.`);
    if (missingCoreSkills.length) {
      const explicitHardMissing = missingCoreSkills.filter(
        isHard,
      );
      const otherMissing = missingCoreSkills.filter(
        (skill) => !explicitHardMissing.includes(skill),
      );
      if (explicitHardMissing.length) {
        knownGaps.push(
          `Explizite Muss-Kompetenzen sind im Profil nicht belegt: ${explicitHardMissing.join(", ")}; vor dem Gespräch verifizieren.`,
        );
      }
      if (otherMissing.length) {
        knownGaps.push(
          `Weitere Kernkompetenzen sind im Profil nicht belegt: ${otherMissing.join(", ")}.`,
        );
      }
    }
  } else if (matchedRelevanceSkills.length) {
    matchReasons.push(
      `Belegte ergänzende Kompetenzen: ${matchedRelevanceSkills.join(", ")}.`,
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

  const optionalSkillMatches = optionalSkills.filter((skill) =>
    matchingFact(profile.skillTags, skill),
  );
  const missingOptionalSkills = optionalSkills.filter(
    (skill) => !matchingFact(profile.skillTags, skill),
  );
  if (optionalSkillMatches.length) {
    matchReasons.push(`Optionale Kompetenzen passend: ${optionalSkillMatches.join(", ")}.`);
  }
  if (missingOptionalSkills.length) {
    knownGaps.push(`Optionale Kompetenzen nicht aufgeführt: ${missingOptionalSkills.join(", ")}.`);
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

  return ProfileEvaluationSchema.parse({
    eligible: rejectionReasons.length === 0,
    rejectionReasons,
    matchReasons,
    knownGaps,
    optionalSkillMatches,
    coreSkillMatches,
    exactRequiredSkillMatches,
    contextEvidenceMatches,
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

/**
 * Whether the brief states anything a profile can be ranked against.
 *
 * Mirrors `relevanceSkills` inside `evaluateProfile`, which spans required and
 * optional skills together. When both are absent there is no relevance signal
 * at all, the skill-overlap rejection never fires, and every active profile
 * stays eligible.
 */
function hasRankableRequirement(brief: ProjectBrief): boolean {
  return Boolean((brief.requiredSkills ?? []).length || (brief.optionalSkills ?? []).length);
}

export function buildShortlist(
  rawBrief: ProjectBrief,
  rawProfiles: readonly FreelancerProfile[],
): Shortlist {
  const brief = ProjectBriefSchema.parse(rawBrief);

  if (!hasRankableRequirement(brief)) {
    return ShortlistSchema.parse({
      ruleVersion: MATCHING_RULE_VERSION,
      orderingRule: MATCHING_ORDER_RULE,
      status: "needs_clarification",
      clarificationCode: "no_extractable_requirement",
      matches: [],
    });
  }

  const evaluated = rawProfiles.map((rawProfile) => {
    const profile = FreelancerProfileSchema.parse(rawProfile);
    return { profile, evaluation: evaluateProfile(brief, profile) };
  });

  const eligible = evaluated.filter((item) => item.evaluation.eligible);
  eligible.sort((left, right) => {
    const coreSkillDifference =
      right.evaluation.coreSkillMatches.length -
      left.evaluation.coreSkillMatches.length;
    if (coreSkillDifference) return coreSkillDifference;
    const commercialConfidenceDifference =
      commercialConfidencePriority(right.evaluation.commercialConstraintConfidence) -
      commercialConfidencePriority(left.evaluation.commercialConstraintConfidence);
    if (commercialConfidenceDifference) return commercialConfidenceDifference;
    const availabilityDifference =
      availabilityPriority(left.profile.availability.status) -
      availabilityPriority(right.profile.availability.status);
    if (availabilityDifference) return availabilityDifference;
    const optionalDifference =
      right.evaluation.optionalSkillMatches.length - left.evaluation.optionalSkillMatches.length;
    if (optionalDifference) return optionalDifference;
    const contextEvidenceDifference =
      right.evaluation.contextEvidenceMatches.length -
      left.evaluation.contextEvidenceMatches.length;
    if (contextEvidenceDifference) return contextEvidenceDifference;
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
      coreSkillMatchCount: evaluation.coreSkillMatches.length,
      contextEvidenceMatchCount: evaluation.contextEvidenceMatches.length,
      verifiedRequiredSkillMatchCount: evaluation.verifiedRequiredSkillMatches.length,
      commercialConstraintConfidence: evaluation.commercialConstraintConfidence,
      availabilityPriority: availabilityPriority(profile.availability.status),
      availableFrom: profile.availability.availableFrom,
    },
  }));

  return ShortlistSchema.parse({
    ruleVersion: MATCHING_RULE_VERSION,
    orderingRule: MATCHING_ORDER_RULE,
    status: "ranked",
    clarificationCode: null,
    matches,
  });
}
