import { z } from "zod";

import {
  AI_RANKING_ORDER_RULE,
  AI_RANKING_RULE_VERSION,
  MatchingDecisionSnapshotSchema,
  MATCHING_SCORE_VERSION,
  MINIMUM_CORE_COVERAGE_BASIS_POINTS,
  ShortlistMatchSchema,
  ShortlistSchema,
  sourceDisclosures,
  type Shortlist,
  type ShortlistMatch,
} from "./matching";
import type { FreelancerProfile } from "./profile";

/**
 * Das Suchergebnis aus Vorauswahl und KI-Bewertung.
 *
 * Bis zu drei Profile stehen oben, mit der Begründung und den offenen Punkten
 * der KI. Die ganze Vorauswahl (bis zu 20 Profile) bleibt als
 * `candidateOrder` erhalten: zuerst die drei der KI, dann der Rest nach
 * inhaltlicher Nähe. So kann der Nutzer alle durchsehen.
 *
 * Fällt die KI-Bewertung aus, stehen die drei nächsten Profile der
 * Vorauswahl oben — ausdrücklich als nicht bewertet gekennzeichnet, mit den
 * Kompetenzen, die Anfrage und Profil gemeinsam nennen.
 */

export type AiRankingPick = {
  profileId: string;
  fitScore: number;
  reasons: string[];
  openPoints: string[];
};

export type PrefilterEntry = {
  profile: FreelancerProfile;
  similarity: number | null;
};

export type CandidateSnapshotEntry = {
  profileId: string;
  similarity: number | null;
  /** Platz in der Auswahl oben (1–3), sonst null. */
  rank: number | null;
};

export type AiShortlistResult = {
  shortlist: Shortlist;
  candidateOrder: CandidateSnapshotEntry[];
  /** "ai": von der KI bewertet; "prefilter": KI ausgefallen, nur Vorauswahl. */
  rankedBy: "ai" | "prefilter";
};

/**
 * Was je Treffer in `matches.evaluation_snapshot` steht, damit Rolle, Score
 * und Herkunft der Bewertung das Neuladen überstehen. Die Regel-Snapshots
 * (MatchingEvaluationSnapshotSchema) gelten nur für die Regelversionen.
 */
export const AiEvaluationSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("ai_ranking"),
    rankedBy: z.enum(["ai", "prefilter"]),
    recommendationRole: z.enum(["primary", "alternative"]),
    fitScore: z.number().int().min(0).max(100).nullable(),
  })
  .strict();

export type AiEvaluationSnapshot = z.infer<typeof AiEvaluationSnapshotSchema>;

export function aiEvaluationSnapshot(
  match: ShortlistMatch,
  rankedBy: AiShortlistResult["rankedBy"],
): AiEvaluationSnapshot {
  return AiEvaluationSnapshotSchema.parse({
    schemaVersion: 1,
    kind: "ai_ranking",
    rankedBy,
    recommendationRole: match.recommendationRole === "primary" ? "primary" : "alternative",
    fitScore: match.fitScore ?? null,
  });
}

/** Die gespeicherte Vorauswahl einer Suche, wie sie aus der Datenbank kommt. */
export const CandidateSnapshotSchema = z
  .array(
    z
      .object({
        profileId: z.string().uuid(),
        similarity: z.number().nullable(),
        rank: z.number().int().min(1).max(3).nullable(),
      })
      .strict(),
  )
  .max(50);

export const PREFILTER_ONLY_GAP =
  "Die KI-Bewertung war für diese Suche nicht verfügbar; die Passung bitte im Gespräch prüfen.";

function availabilityPriority(status: FreelancerProfile["availability"]["status"]): 0 | 1 | 2 | 3 {
  if (status === "available") return 0;
  if (status === "limited") return 1;
  if (status === "unknown") return 2;
  return 3;
}

function shortlistMatch(
  profile: FreelancerProfile,
  index: number,
  reasons: string[],
  gaps: string[],
  fitScore: number | null,
): ShortlistMatch {
  return ShortlistMatchSchema.parse({
    profile,
    matchReasons: reasons,
    knownGaps: gaps,
    ...sourceDisclosures(profile),
    availabilityStatus: profile.availability.status,
    availabilityCheckedAt: profile.availability.checkedAt,
    profileDataVersion: profile.dataVersion,
    recommendationRole: index === 0 ? "primary" : "alternative",
    ...(fitScore === null ? {} : { fitScore }),
    orderingEvidence: {
      availabilityPriority: availabilityPriority(profile.availability.status),
      availableFrom: profile.availability.availableFrom,
    },
  });
}

export function buildAiShortlist(input: {
  poolSize: number;
  prefilter: readonly PrefilterEntry[];
  /** null, wenn die KI-Bewertung ausgefallen ist. */
  ranking: { searchable: boolean; picks: readonly AiRankingPick[] } | null;
  /** Begründung für die Vorauswahl ohne KI: gemeinsame Kompetenzen je Profil. */
  sharedTerms: (profile: FreelancerProfile) => string[];
}): AiShortlistResult {
  const byId = new Map(input.prefilter.map((entry) => [entry.profile.id, entry]));
  // Ohne KI-Urteil gilt eine Anfrage als suchbar, sobald die Vorauswahl etwas
  // gefunden hat. Ein leerer Pool ist kein Fehler der Anfrage: dann „kein
  // passendes Profil“, nicht „bitte konkretisieren“.
  const searchable = input.ranking?.searchable ?? (input.prefilter.length > 0 || input.poolSize === 0);

  let top: ShortlistMatch[] = [];
  let rankedBy: AiShortlistResult["rankedBy"] = "ai";
  if (searchable && input.ranking?.picks.length) {
    top = input.ranking.picks
      .filter((pick) => byId.has(pick.profileId))
      .slice(0, 3)
      .map((pick, index) =>
        shortlistMatch(
          byId.get(pick.profileId)!.profile,
          index,
          pick.reasons.length ? pick.reasons : ["Von der KI als passend eingestuft."],
          pick.openPoints,
          pick.fitScore,
        ),
      );
  } else if (searchable && input.prefilter.length) {
    rankedBy = "prefilter";
    top = input.prefilter.slice(0, 3).map(({ profile }, index) => {
      const shared = input.sharedTerms(profile);
      return shortlistMatch(
        profile,
        index,
        [
          shared.length
            ? `In Anfrage und Profil genannt: ${shared.join(", ")}.`
            : "Inhaltlich eines der nächsten Profile zur Anfrage.",
        ],
        [PREFILTER_ONLY_GAP],
        null,
      );
    });
  }

  const topIds = top.map((match) => match.profile.id);
  const candidateOrder: CandidateSnapshotEntry[] = searchable
    ? [
        ...topIds.map((profileId, index) => ({
          profileId,
          similarity: byId.get(profileId)?.similarity ?? null,
          rank: index + 1,
        })),
        ...input.prefilter
          .filter((entry) => !topIds.includes(entry.profile.id))
          .map((entry) => ({ profileId: entry.profile.id, similarity: entry.similarity, rank: null })),
      ]
    : [];

  const status: Shortlist["status"] = !searchable
    ? "needs_clarification"
    : top.length
      ? "ranked"
      : "no_reliable_match";
  const decisionSnapshot = MatchingDecisionSnapshotSchema.parse({
    schemaVersion: 2,
    scoreVersion: MATCHING_SCORE_VERSION,
    status,
    minimumCoreCoverageBasisPoints: MINIMUM_CORE_COVERAGE_BASIS_POINTS,
    evaluatedProfileCount: input.poolSize,
    catalogEligibleProfileCount: candidateOrder.length,
    reliableProfileCount: top.length,
    failureCounts: { hardConflict: 0, hardUnknown: 0, belowCoreCoverage: 0 },
    primaryProfileId: top[0]?.profile.id ?? null,
    openCoreRequirements: [],
    partialProfileIds: [],
  });

  return {
    shortlist: ShortlistSchema.parse({
      ruleVersion: AI_RANKING_RULE_VERSION,
      orderingRule: AI_RANKING_ORDER_RULE,
      status,
      clarificationCode: status === "needs_clarification" ? "no_extractable_requirement" : null,
      decisionSnapshot,
      matches: top,
      partialMatches: [],
    }),
    candidateOrder,
    rankedBy,
  };
}
