import { ProjectBriefSchema, type ProjectBrief } from "@/lib/domain/brief";
import { MatchingDecisionSnapshotSchema } from "@/lib/domain/matching";
import {
  canonicalSkill,
  normalizeSkill,
  skillFamilyKey,
} from "@/lib/domain/skill-taxonomy";

export type SearchDemandResultStatus =
  | "ranked"
  | "needs_clarification"
  | "no_reliable_match"
  | null;

export type SearchDemandSourceRow = {
  id: string;
  project_id: string;
  owner_user_id: string;
  brief_snapshot: unknown;
  decision_snapshot: unknown | null;
  result_count: number | string;
  result_status: SearchDemandResultStatus;
  created_at: string;
};

export type DemandPeriod = 30 | 90 | 365 | "all";
export type DemandPriority = "high" | "review" | "covered" | "insufficient";

export type DemandFacet = { label: string; count: number };

export type DemandProfile = {
  key: string;
  label: string;
  requiredSkills: DemandFacet[];
  optionalSkills: DemandFacet[];
  locations: DemandFacet[];
  workModes: DemandFacet[];
  languages: DemandFacet[];
  openSupplyGaps: DemandFacet[];
  searches: number;
  share: number;
  uniqueUsers: number;
  ranked: number;
  needsClarification: number;
  noReliableMatch: number;
  unknownOutcome: number;
  measurableOutcomes: number;
  noReliableMatchRate: number | null;
  averageResults: number;
  lastSearchedAt: string;
  previousSearches: number;
  trendPercent: number | null;
  isNewDemand: boolean;
  priority: DemandPriority;
  priorityScore: number;
};

export type SearchDemandReport = {
  generatedAt: string;
  period: DemandPeriod;
  from: string | null;
  to: string;
  previousFrom: string | null;
  totals: {
    searches: number;
    uniqueUsers: number;
    ranked: number;
    needsClarification: number;
    noReliableMatch: number;
    unknownOutcome: number;
    measurableOutcomes: number;
    noReliableMatchRate: number | null;
    invalidBriefs: number;
    unclassifiedSearches: number;
    excludedSearches: number;
    excludedAccounts: number;
    priorityProfiles: number;
  };
  topRequiredSkills: DemandFacet[];
  profiles: DemandProfile[];
};

type ParsedSearch = {
  row: SearchDemandSourceRow;
  brief: ProjectBrief;
  profileKey: string | null;
  profileLabel: string | null;
  coreSkills: string[];
  optionalSkills: string[];
  openSupplyGaps: string[];
  resultCount: number;
};

type MutableProfile = {
  key: string;
  label: string;
  searches: number;
  users: Set<string>;
  ranked: number;
  needsClarification: number;
  noReliableMatch: number;
  unknownOutcome: number;
  /** Results only from statuses that distinguish supply from brief quality. */
  measurableResultCount: number;
  requiredSkills: Map<string, DemandFacet>;
  optionalSkills: Map<string, DemandFacet>;
  locations: Map<string, DemandFacet>;
  workModes: Map<string, DemandFacet>;
  languages: Map<string, DemandFacet>;
  openSupplyGaps: Map<string, DemandFacet>;
  lastSearchedAt: string;
};

const DAY_MS = 24 * 60 * 60 * 1_000;

function validDate(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function count(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function canonicalSkills(values: readonly string[] | null): string[] {
  const unique = new Map<string, string>();
  for (const value of values ?? []) {
    const canonical = canonicalSkill(value);
    const key = skillFamilyKey(canonical) ?? normalizeSkill(canonical);
    if (key && !unique.has(key)) unique.set(key, canonical);
  }
  return [...unique.values()];
}

function coreSkills(brief: ProjectBrief): string[] {
  if (brief.schemaVersion === 2) {
    const fromGroups = brief.requirementGroups
      .filter(
        (group) =>
          group.category === "skill" &&
          (group.priority === "hard" || group.priority === "core"),
      )
      .flatMap((group) => group.values);
    const normalized = canonicalSkills(fromGroups);
    if (normalized.length > 0) return normalized;
  }
  return canonicalSkills(brief.requiredSkills);
}

function demandIdentity(skills: readonly string[]): {
  key: string | null;
  label: string | null;
} {
  // Two defining competencies merge wording variants without collapsing all
  // software, SAP or marketing demand into one vague occupational bucket.
  const defining = [...skills]
    .slice(0, 2)
    .sort((left, right) => left.localeCompare(right, "de"));
  if (defining.length === 0) return { key: null, label: null };
  return {
    key: defining.map(normalizeSkill).join("|"),
    label: defining.join(" + "),
  };
}

function parseSearch(row: SearchDemandSourceRow): ParsedSearch | null {
  const parsed = ProjectBriefSchema.safeParse(row.brief_snapshot);
  if (!parsed.success) return null;
  const skills = coreSkills(parsed.data);
  const identity = demandIdentity(skills);
  const decision = MatchingDecisionSnapshotSchema.safeParse(
    row.decision_snapshot,
  );
  return {
    row,
    brief: parsed.data,
    profileKey: identity.key,
    profileLabel: identity.label,
    coreSkills: skills,
    optionalSkills: canonicalSkills(parsed.data.optionalSkills),
    openSupplyGaps: decision.success
      ? canonicalSkills(decision.data.openCoreRequirements)
      : [],
    resultCount: count(row.result_count),
  };
}

function latestPerProject(
  rows: readonly SearchDemandSourceRow[],
  fromMs: number | null,
  toMs: number,
): SearchDemandSourceRow[] {
  const latest = new Map<string, { row: SearchDemandSourceRow; at: number }>();
  for (const row of rows) {
    const at = validDate(row.created_at);
    if (at === null || at > toMs || (fromMs !== null && at < fromMs)) continue;
    const existing = latest.get(row.project_id);
    if (!existing || at > existing.at || (at === existing.at && row.id > existing.row.id)) {
      latest.set(row.project_id, { row, at });
    }
  }
  return [...latest.values()]
    .sort((left, right) => right.at - left.at)
    .map(({ row }) => row);
}

function bump(map: Map<string, DemandFacet>, value: string | null): void {
  const label = value?.trim();
  if (!label) return;
  const key = label.normalize("NFKC").toLocaleLowerCase("de-DE");
  const current = map.get(key);
  if (current) current.count += 1;
  else map.set(key, { label, count: 1 });
}

function facets(map: Map<string, DemandFacet>, limit = 4): DemandFacet[] {
  return [...map.values()]
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label, "de"),
    )
    .slice(0, limit);
}

function emptyProfile(search: ParsedSearch): MutableProfile {
  return {
    key: search.profileKey as string,
    label: search.profileLabel as string,
    searches: 0,
    users: new Set(),
    ranked: 0,
    needsClarification: 0,
    noReliableMatch: 0,
    unknownOutcome: 0,
    measurableResultCount: 0,
    requiredSkills: new Map(),
    optionalSkills: new Map(),
    locations: new Map(),
    workModes: new Map(),
    languages: new Map(),
    openSupplyGaps: new Map(),
    lastSearchedAt: search.row.created_at,
  };
}

function addSearch(profile: MutableProfile, search: ParsedSearch): void {
  profile.searches += 1;
  profile.users.add(search.row.owner_user_id);
  if (search.row.created_at > profile.lastSearchedAt) {
    profile.lastSearchedAt = search.row.created_at;
  }
  if (search.row.result_status === "ranked") {
    profile.ranked += 1;
    profile.measurableResultCount += search.resultCount;
  } else if (search.row.result_status === "needs_clarification") {
    profile.needsClarification += 1;
  } else if (search.row.result_status === "no_reliable_match") {
    profile.noReliableMatch += 1;
  } else profile.unknownOutcome += 1;

  for (const value of search.coreSkills) bump(profile.requiredSkills, value);
  for (const value of search.optionalSkills) bump(profile.optionalSkills, value);
  for (const value of search.openSupplyGaps) bump(profile.openSupplyGaps, value);
  bump(profile.locations, search.brief.location);
  if (search.brief.workMode !== "unknown") {
    bump(profile.workModes, search.brief.workMode);
  }
  bump(profile.languages, search.brief.language);
}

function aggregateProfiles(searches: readonly ParsedSearch[]): Map<string, MutableProfile> {
  const profiles = new Map<string, MutableProfile>();
  for (const search of searches) {
    if (!search.profileKey || !search.profileLabel) continue;
    const profile = profiles.get(search.profileKey) ?? emptyProfile(search);
    addSearch(profile, search);
    profiles.set(search.profileKey, profile);
  }
  return profiles;
}

function priorityFor(profile: MutableProfile): {
  priority: DemandPriority;
  score: number;
} {
  const measurable = profile.ranked + profile.noReliableMatch;
  if (measurable === 0) return { priority: "insufficient", score: 0 };
  const gapRate = profile.noReliableMatch / measurable;
  const score = profile.searches * (1 + gapRate * 2);
  if (
    profile.noReliableMatch >= 2 ||
    (profile.searches >= 2 && gapRate >= 0.5)
  ) {
    return { priority: "high", score };
  }
  if (
    profile.noReliableMatch > 0 ||
    profile.measurableResultCount / measurable < 2
  ) {
    return { priority: "review", score };
  }
  return { priority: "covered", score };
}

export function buildSearchDemandReport(input: {
  rows: readonly SearchDemandSourceRow[];
  excludedUserIds?: ReadonlySet<string>;
  excludedAccounts?: number;
  period?: DemandPeriod;
  now?: Date;
}): SearchDemandReport {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const period = input.period ?? 90;
  const excludedUserIds = input.excludedUserIds ?? new Set<string>();
  const fromMs = period === "all" ? null : nowMs - period * DAY_MS;
  const previousFromMs = period === "all" ? null : nowMs - period * 2 * DAY_MS;

  const allCurrentRows = latestPerProject(input.rows, fromMs, nowMs);
  const excludedSearches = allCurrentRows.filter((row) =>
    excludedUserIds.has(row.owner_user_id),
  ).length;
  const currentRows = allCurrentRows.filter(
    (row) => !excludedUserIds.has(row.owner_user_id),
  );
  const previousRows =
    period === "all" || previousFromMs === null || fromMs === null
      ? []
      : latestPerProject(input.rows, previousFromMs, fromMs - 1).filter(
          (row) => !excludedUserIds.has(row.owner_user_id),
        );

  let invalidBriefs = 0;
  let unclassifiedSearches = 0;
  const current = currentRows.flatMap((row) => {
    const parsed = parseSearch(row);
    if (!parsed) {
      invalidBriefs += 1;
      return [];
    }
    if (!parsed.profileKey) unclassifiedSearches += 1;
    return [parsed];
  });
  const previous = previousRows.flatMap((row) => {
    const parsed = parseSearch(row);
    return parsed ? [parsed] : [];
  });

  const currentProfiles = aggregateProfiles(current);
  const previousProfiles = aggregateProfiles(previous);
  const totalRequiredSkills = new Map<string, DemandFacet>();
  for (const search of current) {
    for (const skill of search.coreSkills) bump(totalRequiredSkills, skill);
  }

  const measuredSearches = current.filter(
    (search) =>
      search.row.result_status === "ranked" ||
      search.row.result_status === "no_reliable_match",
  );
  const noReliableMatch = measuredSearches.filter(
    (search) => search.row.result_status === "no_reliable_match",
  ).length;

  const profiles: DemandProfile[] = [...currentProfiles.values()].map((profile) => {
    const measurableOutcomes = profile.ranked + profile.noReliableMatch;
    const previousSearches = previousProfiles.get(profile.key)?.searches ?? 0;
    const priority = priorityFor(profile);
    return {
      key: profile.key,
      label: profile.label,
      requiredSkills: facets(profile.requiredSkills),
      optionalSkills: facets(profile.optionalSkills),
      locations: facets(profile.locations, 3),
      workModes: facets(profile.workModes, 3),
      languages: facets(profile.languages, 3),
      openSupplyGaps: facets(profile.openSupplyGaps, 4),
      searches: profile.searches,
      share: current.length > 0 ? profile.searches / current.length : 0,
      uniqueUsers: profile.users.size,
      ranked: profile.ranked,
      needsClarification: profile.needsClarification,
      noReliableMatch: profile.noReliableMatch,
      unknownOutcome: profile.unknownOutcome,
      measurableOutcomes,
      noReliableMatchRate:
        measurableOutcomes > 0
          ? profile.noReliableMatch / measurableOutcomes
          : null,
      averageResults: measurableOutcomes > 0
        ? profile.measurableResultCount / measurableOutcomes
        : 0,
      lastSearchedAt: profile.lastSearchedAt,
      previousSearches,
      trendPercent:
        previousSearches > 0
          ? Math.round(
              ((profile.searches - previousSearches) / previousSearches) * 100,
            )
          : null,
      isNewDemand: period !== "all" && previousSearches === 0,
      priority: priority.priority,
      priorityScore: priority.score,
    };
  });

  profiles.sort(
    (left, right) =>
      right.priorityScore - left.priorityScore ||
      right.searches - left.searches ||
      left.label.localeCompare(right.label, "de"),
  );

  return {
    generatedAt: now.toISOString(),
    period,
    from: fromMs === null ? null : new Date(fromMs).toISOString(),
    to: now.toISOString(),
    previousFrom:
      previousFromMs === null ? null : new Date(previousFromMs).toISOString(),
    totals: {
      searches: current.length,
      uniqueUsers: new Set(current.map((search) => search.row.owner_user_id)).size,
      ranked: current.filter((search) => search.row.result_status === "ranked").length,
      needsClarification: current.filter(
        (search) => search.row.result_status === "needs_clarification",
      ).length,
      noReliableMatch,
      unknownOutcome: current.filter((search) => search.row.result_status === null).length,
      measurableOutcomes: measuredSearches.length,
      noReliableMatchRate:
        measuredSearches.length > 0
          ? noReliableMatch / measuredSearches.length
          : null,
      invalidBriefs,
      unclassifiedSearches,
      excludedSearches,
      excludedAccounts: input.excludedAccounts ?? excludedUserIds.size,
      priorityProfiles: profiles.filter((profile) => profile.priority === "high").length,
    },
    topRequiredSkills: facets(totalRequiredSkills, 10),
    profiles,
  };
}
