import { skillFamilyKey } from "@/lib/domain/skill-taxonomy";
import type {
  FreelancerProfileResult,
  StructuredBrief,
  StructuredRequirementGroup,
} from "../chat-contract";

type Priority = StructuredRequirementGroup["priority"];

/**
 * One requested skill as the profile answers it.
 *
 * `missing` means the profile does not name the skill. That is missing
 * evidence, not proof the freelancer lacks it, and is worded accordingly.
 */
export type RequirementEvidence = {
  /** The requirement in the client's wording, e.g. "n8n" or "React oder Vue". */
  requirement: string;
  priority: Priority;
  status: "listed" | "context" | "missing";
  /** The profile's own term where it differs from the requirement, e.g. "LLM". */
  profileTerm: string | null;
  verified: boolean;
};

export type ProfilePresentation = {
  /** Hard and core requirements, then optional ones the profile does name. */
  evidence: RequirementEvidence[];
  /** Named hard/core requirements for the headline, at most three. */
  highlights: string[];
  /** Further profile competencies the request did not ask for, at most three. */
  additional: string[];
  /** Every distinct profile competency, requested ones first. */
  skills: string[];
  /** Open points that no other line of the card already shows. */
  openPoints: string[];
  start: { text: string; conflict: boolean } | null;
};

const PRIORITY_ORDER: Readonly<Record<Priority, number>> = { hard: 0, core: 1, optional: 2 };

// Matcher wordings the card shows elsewhere. They are matched exactly so a
// differently worded — and possibly harder — gap is never dropped by accident.
const SKILL_GAP = [
  /^Weitere Kernkompetenz ist im Profil nicht belegt: (.+)\.$/u,
  /^Explizite Muss-Kompetenz ist im Profil nicht belegt: (.+); vor dem Gespräch verifizieren\.$/u,
];
const OPTIONAL_SKILL_GAP = /^Optionale Kompetenzen nicht aufgeführt: /u;
const CONTEXT_REASON = /^Ergänzend belegt über Branche, Zertifikat oder Projekterfahrung: (.+)\.$/u;
const START_UNCONFIRMED = "Das gewünschte Startfenster ist im Profil nicht separat bestätigt.";
const START_LATER = /^Bestätigte Verfügbarkeit beginnt nach dem gewünschten Startfenster/u;
const START_CONFIRMED = "Verfügbarkeit ist im angegebenen Startfenster bestätigt.";
const NO_RATE = "Im Profil ist kein Stunden- oder Tagessatz angegeben.";
const UNCONFIRMED_CONSTRAINT = /^Weitere Rahmenbedingung ist im Profil nicht bestätigt: (.+)\.$/iu;

function skillKey(value: string): string {
  return skillFamilyKey(value) ?? value.trim().toLocaleLowerCase("de-DE");
}

function sameWording(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase("de-DE") === right.trim().toLocaleLowerCase("de-DE");
}

function requestedSkillGroups(brief: StructuredBrief) {
  const groups = brief.requirementGroups.filter((group) => group.category === "skill");
  if (groups.length) {
    return [...groups].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }
  // Historical briefs carry only the two flat lists.
  return [
    ...brief.requiredSkills.map((value) => ({ priority: "core" as const, operator: "all_of" as const, values: [value] })),
    ...brief.optionalSkills.map((value) => ({ priority: "optional" as const, operator: "all_of" as const, values: [value] })),
  ];
}

function namedSkills(list: string): string[] {
  return list.split(/, | und | oder /u).map((value) => value.trim()).filter(Boolean);
}

function startLabel(window: string): string {
  return /^start\b/iu.test(window) ? window : `Start ${window}`;
}

/**
 * Orders what the profile already says by what the request asks for.
 * Nothing here adds a competence the profile does not name.
 */
export function profilePresentation(
  profile: FreelancerProfileResult,
  brief?: StructuredBrief | null,
): ProfilePresentation {
  const tagsByKey = new Map<string, string>();
  for (const tag of profile.skillTags) {
    const key = skillKey(tag);
    if (!tagsByKey.has(key)) tagsByKey.set(key, tag);
  }
  const verifiedKeys = new Set(
    profile.facts
      .filter((fact) => fact.verification === "verified" && fact.value.startsWith("Kompetenz: "))
      .map((fact) => skillKey(fact.value.slice("Kompetenz: ".length))),
  );
  const contextKeys = new Set(
    profile.matchReasons.flatMap((reason) => {
      const match = CONTEXT_REASON.exec(reason);
      return match ? namedSkills(match[1]).map(skillKey) : [];
    }),
  );

  const groups = brief ? requestedSkillGroups(brief) : [];
  const requestedKeys = new Set(groups.flatMap((group) => group.values.map(skillKey)));
  const evidence: RequirementEvidence[] = [];
  const missingKeys = new Set<string>();
  const seenRequirements = new Set<string>();
  const assess = (values: readonly string[], priority: Priority, operator: "all_of" | "any_of") => {
    const requirement = values.join(" oder ");
    const key = operator === "any_of" ? values.map(skillKey).join("|") : skillKey(values[0]);
    if (seenRequirements.has(key)) return;
    seenRequirements.add(key);
    const listedKey = values.map(skillKey).find((candidate) => tagsByKey.has(candidate));
    const status = listedKey
      ? "listed"
      : values.some((value) => contextKeys.has(skillKey(value)))
        ? "context"
        : "missing";
    // A missing optional skill is not a deficiency, so it gets no line.
    if (priority === "optional" && status === "missing") return;
    if (status === "missing") for (const value of values) missingKeys.add(skillKey(value));
    const profileTerm = listedKey ? tagsByKey.get(listedKey)! : null;
    evidence.push({
      requirement,
      priority,
      status,
      profileTerm: profileTerm && !values.some((value) => sameWording(value, profileTerm)) ? profileTerm : null,
      verified: Boolean(listedKey && verifiedKeys.has(listedKey)),
    });
  };
  for (const group of groups) {
    if (group.operator === "any_of") assess(group.values, group.priority, "any_of");
    else for (const value of group.values) assess([value], group.priority, "all_of");
  }

  const skills = [...tagsByKey.entries()]
    .sort(([left], [right]) => Number(requestedKeys.has(right)) - Number(requestedKeys.has(left)))
    .map(([, tag]) => tag);
  const named = evidence.filter((row) => row.status === "listed");
  const namedCore = named.filter((row) => row.priority !== "optional");
  const highlights = (namedCore.length ? namedCore : named).slice(0, 3).map((row) => row.requirement);
  const additional = [...tagsByKey.entries()]
    .filter(([key]) => !requestedKeys.has(key))
    .slice(0, 3)
    .map(([, tag]) => tag);

  const startWindow = brief?.startWindow ?? null;
  const openPoints = [...new Set(profile.knownGaps)].filter((gap) => {
    if (OPTIONAL_SKILL_GAP.test(gap)) return false;
    for (const pattern of SKILL_GAP) {
      const match = pattern.exec(gap);
      // Shown as a line of its own — unless the brief has changed since and
      // no longer lists that skill.
      if (match) return !namedSkills(match[1]).every((skill) => missingKeys.has(skillKey(skill)));
    }
    if (startWindow && (gap === START_UNCONFIRMED || START_LATER.test(gap))) return false;
    if (gap === NO_RATE && !profile.rate) return false;
    const constraint = UNCONFIRMED_CONSTRAINT.exec(gap)?.[1];
    if (constraint && /^remote$/iu.test(constraint)) return profile.remoteMode !== "remote";
    if (constraint && startWindow && sameWording(constraint, startWindow)) return false;
    return true;
  });

  const start = startWindow
    ? profile.knownGaps.some((gap) => START_LATER.test(gap))
      ? { text: `${startLabel(startWindow)}: laut Profil später verfügbar`, conflict: true }
      : profile.matchReasons.includes(START_CONFIRMED)
        ? { text: `${startLabel(startWindow)} bestätigt`, conflict: false }
        : { text: `${startLabel(startWindow)}: noch zu klären`, conflict: false }
    : brief
      ? { text: "Start nach Abstimmung", conflict: false }
      : null;

  return { evidence, highlights, additional, skills, openPoints, start };
}

/** "a", "a und b", "a, b und c". */
export function joinGerman(values: readonly string[]): string {
  if (values.length < 2) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} und ${values.at(-1)}`;
}
