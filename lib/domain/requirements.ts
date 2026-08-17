import {
  canonicalSkill,
  normalizeSkill,
  skillFamilyKey,
  skillTerms,
} from "./skill-taxonomy";

export type RequirementPriority = "hard" | "core" | "optional";
export type RequirementOperator = "all_of" | "any_of";
export type RequirementCategory =
  | "skill"
  | "language"
  | "work_mode"
  | "location"
  | "qualification"
  | "contractual";

export type RequirementGroup = {
  id: string;
  category: RequirementCategory;
  priority: RequirementPriority;
  operator: RequirementOperator;
  values: string[];
  sourceText: string | null;
};

type RequirementBriefFields = {
  originalRequest: string;
  requiredSkills: string[] | null;
  optionalSkills: string[] | null;
  language: string | null;
  workMode: "remote" | "on_site" | "hybrid" | "unknown";
  location: string | null;
  qualifications: string[] | null;
  contractualRequirements: string[] | null;
};

const HARD_REQUIREMENT_MARKER =
  /(?:\bmuss(?:[-\s]?anforderungen?)?\b|\bmust(?:[-\s]?haves?)?\b|\bzwingend(?:e[rsn]?)?\b|\bausschlusskriteri(?:um|en)\b|\bknock[-\s]?out\b)/iu;
const OPTIONAL_REQUIREMENT_MARKER =
  /(?:\bsoll(?:[-\s]?anforderungen?)?\b|\boptional(?:e[rsn]?)?\b|\bbevorzugt(?:e[rsn]?)?\b|\bnice[-\s]?to[-\s]?have\b|\bpreferred\b|\bwünschenswert\b|\bwuenschenswert\b|\bvon\s+vorteil\b)/iu;
const REQUIREMENT_HEADING_MARKER =
  /(?:anforderungen|requirements|voraussetzungen|qualifikationen|technologien|technologies|skills|constraints|bedingungen|profil)/iu;

const SPECIAL_TERMS: Readonly<Record<string, readonly string[]>> = {
  german: [
    "german",
    "deutsch",
    "deutschsprachig",
    "deutsche sprache",
    "deutschkenntnisse",
    "deutschkenntnissen",
    "muttersprache deutsch",
  ],
  english: ["english", "englisch", "englischsprachig", "englische sprache", "englischkenntnisse"],
  spanish: ["spanish", "spanisch", "espanol", "spanische sprache"],
  french: ["french", "französisch", "franzoesisch", "francais", "französische sprache"],
  italian: ["italian", "italienisch", "italiano", "italienische sprache"],
  dutch: ["dutch", "niederländisch", "niederlaendisch", "nederlands", "holländisch"],
  polish: ["polish", "polnisch", "polski", "polnische sprache"],
  remote: ["remote", "remote-arbeit", "remote work"],
  on_site: ["on-site", "onsite", "vor ort", "präsenz", "praesenz"],
  hybrid: ["hybrid", "teilweise remote", "remote anteil"],
};

function searchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}%+#€$£]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function requirementTerms(value: string): readonly string[] {
  return [
    ...new Set([
      value,
      ...skillTerms(value),
      ...(SPECIAL_TERMS[normalizeSkill(value)] ?? []),
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

function headingPriority(line: string): RequirementPriority | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const withoutMarkup = trimmed.replace(/^[#*\s_-]+|[*\s_:.-]+$/gu, "");
  const looksLikeHeading =
    /^#{1,6}\s/u.test(trimmed) ||
    /:\s*$/u.test(trimmed) ||
    (withoutMarkup.length <= 80 && REQUIREMENT_HEADING_MARKER.test(withoutMarkup));
  if (!looksLikeHeading) return null;
  if (OPTIONAL_REQUIREMENT_MARKER.test(withoutMarkup)) return "optional";
  if (HARD_REQUIREMENT_MARKER.test(withoutMarkup)) return "hard";
  return "core";
}

/**
 * Returns only a priority grounded in the user's own wording. A normal
 * prerequisite is core; only explicit must/optional markers can strengthen or
 * weaken it.
 */
export function requirementPriority(
  originalRequest: string,
  value: string,
): RequirementPriority {
  let section: RequirementPriority = "core";
  let observedOptional = false;
  let observedCore = false;
  for (const line of originalRequest.split(/\r?\n/u)) {
    // A marker in a later sentence must not reclassify every requirement on
    // the same physical line (for example "React ... Optional: Next.js").
    // Sentence-local markers still support natural wording such as
    // "Deutsch ist zwingend" and same-line headings such as "Optional: SQL".
    for (const sentence of line.split(/(?<=[.!?;])\s+/u)) {
      if (lineContainsRequirement(sentence, value)) {
        if (HARD_REQUIREMENT_MARKER.test(sentence) || section === "hard") {
          return "hard";
        }
        if (OPTIONAL_REQUIREMENT_MARKER.test(sentence) || section === "optional") {
          observedOptional = true;
        } else {
          observedCore = true;
        }
      }
    }
    section = headingPriority(line) ?? section;
  }
  if (observedCore) return "core";
  return observedOptional ? "optional" : "core";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

type Occurrence = { start: number; end: number };

function occurrences(source: string, value: string): Occurrence[] {
  const found: Occurrence[] = [];
  const seen = new Set<string>();
  for (const term of [...requirementTerms(value)].sort(
    (a, b) => b.length - a.length,
  )) {
    const pattern = new RegExp(
      `(?:^|[^\\p{L}\\p{N}])(${escapeRegex(term)})(?=$|[^\\p{L}\\p{N}])`,
      "giu",
    );
    for (const match of source.matchAll(pattern)) {
      if (match.index === undefined || !match[1]) continue;
      const leading = match[0].length - match[1].length;
      const start = match.index + leading;
      const end = start + match[1].length;
      const key = `${start}:${end}`;
      if (!seen.has(key)) {
        seen.add(key);
        found.push({ start, end });
      }
    }
  }
  return found.sort((left, right) => left.start - right.start || left.end - right.end);
}

type Connector = {
  leftIndex: number;
  rightIndex: number;
  operator: RequirementOperator;
  gap: number;
  sourceStart: number;
  sourceEnd: number;
};

function connectorBetween(
  source: string,
  left: Occurrence,
  right: Occurrence,
  allowParenthesisBoundary = false,
): RequirementOperator | null {
  if (right.start <= left.end || right.start - left.end > 40) return null;
  const between = source.slice(left.end, right.start);
  if (/\r|\n/u.test(between)) return null;
  let normalized = between.trim().replace(/^[,;:]\s*|\s*[,;:]$/gu, "").trim();
  if (allowParenthesisBoundary) {
    normalized = normalized.replace(/[()]/gu, " ").replace(/\s+/gu, " ").trim();
  }
  if (/^(?:oder|or|alternativ|\/|bzw\.?)$/iu.test(normalized)) return "any_of";
  if (/^(?:und|and|&)$/iu.test(normalized)) return "all_of";
  return null;
}

function skillConnectors(
  source: string,
  skills: readonly string[],
  allowParenthesisBoundary = false,
): Connector[] {
  const bySkill = skills.map((skill) => occurrences(source, skill));
  const connectors: Connector[] = [];
  for (let leftIndex = 0; leftIndex < skills.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < skills.length; rightIndex += 1) {
      for (const leftOccurrence of bySkill[leftIndex] ?? []) {
        for (const rightOccurrence of bySkill[rightIndex] ?? []) {
          const ordered =
            leftOccurrence.start <= rightOccurrence.start
              ? [leftOccurrence, rightOccurrence]
              : [rightOccurrence, leftOccurrence];
          const operator = connectorBetween(
            source,
            ordered[0],
            ordered[1],
            allowParenthesisBoundary,
          );
          if (!operator) continue;
          connectors.push({
            leftIndex,
            rightIndex,
            operator,
            gap: ordered[1].start - ordered[0].end,
            sourceStart: ordered[0].start,
            sourceEnd: ordered[1].end,
          });
        }
      }
    }
  }
  return connectors.sort(
    (left, right) =>
      left.gap - right.gap ||
      left.sourceStart - right.sourceStart ||
      left.leftIndex - right.leftIndex ||
      left.rightIndex - right.rightIndex,
  );
}

function uniqueSkills(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const canonical = canonicalSkill(value);
    const key = skillFamilyKey(canonical) ?? normalizeSkill(canonical);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(canonical);
  }
  return result;
}

function slug(value: string): string {
  return searchText(value).replace(/[^a-z0-9+#]+/gu, "-").replace(/^-|-$/gu, "");
}

function groupId(
  category: RequirementCategory,
  priority: RequirementPriority,
  operator: RequirementOperator,
  values: readonly string[],
): string {
  return `${category}:${priority}:${operator}:${values.map(slug).join("|")}`.slice(0, 500);
}

function deriveSkillGroups(
  source: string,
  values: readonly string[],
  listPriority: "required" | "optional",
): RequirementGroup[] {
  const skills = uniqueSkills(values);
  const used = new Set<number>();
  const groups: RequirementGroup[] = [];
  const connectors = skillConnectors(source, skills);
  const operatorsBySkill = new Map<number, Set<RequirementOperator>>();
  for (const connector of connectors) {
    for (const index of [connector.leftIndex, connector.rightIndex]) {
      const operators = operatorsBySkill.get(index) ?? new Set<RequirementOperator>();
      operators.add(connector.operator);
      operatorsBySkill.set(index, operators);
    }
  }

  // Merge homogeneous connector chains into one semantic unit. Pairing only
  // the first two terms made "Python oder C++ oder React" count as two groups
  // and incorrectly penalized a profile that carried any single alternative.
  // Mixed AND/OR chains are intentionally left as singletons because inventing
  // precedence would be less honest than asking the user to clarify.
  for (const operator of ["any_of", "all_of"] as const) {
    const adjacency = new Map<number, Set<number>>();
    const relevantConnectors = connectors.filter(
      (connector) =>
        connector.operator === operator &&
        operatorsBySkill.get(connector.leftIndex)?.size === 1 &&
        operatorsBySkill.get(connector.rightIndex)?.size === 1,
    );
    for (const connector of relevantConnectors) {
      const left = adjacency.get(connector.leftIndex) ?? new Set<number>();
      const right = adjacency.get(connector.rightIndex) ?? new Set<number>();
      left.add(connector.rightIndex);
      right.add(connector.leftIndex);
      adjacency.set(connector.leftIndex, left);
      adjacency.set(connector.rightIndex, right);
    }
    const visited = new Set<number>();
    for (const startIndex of [...adjacency.keys()].sort((a, b) => a - b)) {
      if (visited.has(startIndex)) continue;
      const pending = [startIndex];
      const component: number[] = [];
      while (pending.length > 0) {
        const index = pending.pop()!;
        if (visited.has(index)) continue;
        visited.add(index);
        component.push(index);
        for (const neighbor of adjacency.get(index) ?? []) {
          if (!visited.has(neighbor)) pending.push(neighbor);
        }
      }
      if (component.length < 2) continue;
      component.sort((a, b) => a - b);
      const groupValues = component.map((index) => skills[index]!);
      const componentConnectors = relevantConnectors.filter(
        (connector) =>
          component.includes(connector.leftIndex) &&
          component.includes(connector.rightIndex),
      );
      const sourceStart = Math.min(
        ...componentConnectors.map((connector) => connector.sourceStart),
      );
      const sourceEnd = Math.max(
        ...componentConnectors.map((connector) => connector.sourceEnd),
      );
    const groundedPriorities = groupValues.map((value) =>
      requirementPriority(source, value),
    );
    const priority =
      listPriority === "optional"
        ? "optional"
        : groundedPriorities.some((value) => value === "hard")
          ? "hard"
          : groundedPriorities.every((value) => value === "optional")
            ? "optional"
            : "core";
    groups.push({
        id: groupId("skill", priority, operator, groupValues),
      category: "skill",
      priority,
        operator,
      values: groupValues,
        sourceText: source.slice(sourceStart, sourceEnd).trim().slice(0, 240),
    });
      component.forEach((index) => used.add(index));
    }
  }

  skills.forEach((value, index) => {
    if (used.has(index)) return;
    const priority =
      listPriority === "optional" ? "optional" : requirementPriority(source, value);
    groups.push({
      id: groupId("skill", priority, "all_of", [value]),
      category: "skill",
      priority,
      operator: "all_of",
      values: [value],
      sourceText: null,
    });
  });
  return groups;
}

function singletonGroup(
  source: string,
  category: Exclude<RequirementCategory, "skill">,
  value: string,
): RequirementGroup {
  const priority = requirementPriority(source, value);
  return {
    id: groupId(category, priority, "all_of", [value]),
    category,
    priority,
    operator: "all_of",
    values: [value],
    sourceText: null,
  };
}

/** Builds the V2 requirement model entirely from source-grounded brief facts. */
export function deriveRequirementGroups(
  brief: RequirementBriefFields,
): RequirementGroup[] {
  const groups = [
    ...deriveSkillGroups(brief.originalRequest, brief.requiredSkills ?? [], "required"),
    ...deriveSkillGroups(brief.originalRequest, brief.optionalSkills ?? [], "optional"),
  ];
  if (brief.language) {
    groups.push(singletonGroup(brief.originalRequest, "language", brief.language));
  }
  if (brief.workMode !== "unknown") {
    groups.push(singletonGroup(brief.originalRequest, "work_mode", brief.workMode));
  }
  // A customer/company location is informational for a fully remote request;
  // treating it as a freelancer constraint would penalize valid remote profiles.
  if (brief.location && brief.workMode !== "remote") {
    groups.push(singletonGroup(brief.originalRequest, "location", brief.location));
  }
  for (const qualification of brief.qualifications ?? []) {
    groups.push(singletonGroup(brief.originalRequest, "qualification", qualification));
  }
  for (const contractual of brief.contractualRequirements ?? []) {
    groups.push(singletonGroup(brief.originalRequest, "contractual", contractual));
  }
  return groups;
}

/** True when a connector chain mixes AND and OR around the same skill. */
export function hasAmbiguousSkillConnectors(
  brief: Pick<
    RequirementBriefFields,
    "originalRequest" | "requiredSkills" | "optionalSkills"
  >,
): boolean {
  for (const values of [brief.requiredSkills ?? [], brief.optionalSkills ?? []]) {
    const skills = uniqueSkills(values);
    const operatorsBySkill = new Map<number, Set<RequirementOperator>>();
    // Parentheses can hide one edge from the flat group derivation. Exposing
    // that edge here (and only here) makes nested mixed logic such as
    // `A oder (B und C)` fail closed as a clarification instead of silently
    // turning it into `A und B und C` for the coverage gate.
    for (const connector of skillConnectors(
      brief.originalRequest,
      skills,
      true,
    )) {
      for (const index of [connector.leftIndex, connector.rightIndex]) {
        const operators =
          operatorsBySkill.get(index) ?? new Set<RequirementOperator>();
        operators.add(connector.operator);
        operatorsBySkill.set(index, operators);
      }
    }
    if ([...operatorsBySkill.values()].some((operators) => operators.size > 1)) {
      return true;
    }
  }
  return false;
}
