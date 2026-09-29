import type { FreelancerProfile } from "@/lib/domain";
import { roleFamilies } from "@/lib/domain/role-taxonomy";
import { canonicalSkill } from "@/lib/domain/skill-taxonomy";
import { normalizeAvatarUrl } from "@/lib/freelancer/avatar-limits";

/**
 * Wer sich für „KI & Automatisierung“ selbst bei XPORTAL angemeldet hat.
 *
 * Der Shortcut im Chat füllte bisher nur einen Beispiel-Brief ein. Welche
 * Menschen dahinterstehen, sah man erst nach dem Abgleich — und dort nur die
 * drei vordersten. Diese Auswahl zeigt beim Klick die Profile, die sich selbst
 * registriert haben und freigegeben sind: keine recherchierten Kandidaten ohne
 * Einwilligung, keine vom Betreiber angelegten Zeilen, keine Demo-Profile.
 *
 * Sie ist kein Matching und keine Empfehlung. Ob jemand zu einem Projekt passt
 * und verfügbar ist, klärt erst der Abgleich und dann das Gespräch; die
 * Oberfläche sagt das neben der Liste.
 */

export const SHOWCASE_LIMIT = 6;
const SKILLS_PER_PROFILE = 3;

export type ShowcaseProfile = {
  id: string;
  displayName: string;
  role: string;
  avatarUrl: string | null;
  /** In der Schreibweise des Profils, Themen-Skills zuerst. */
  skills: string[];
};

export type RegisteredShowcase = {
  theme: "automation";
  /** Alle passenden, selbst angemeldeten Profile — nicht nur die gezeigten. */
  total: number;
  profiles: ShowcaseProfile[];
};

export const EMPTY_AUTOMATION_SHOWCASE: RegisteredShowcase = {
  theme: "automation",
  total: 0,
  profiles: [],
};

/** Kanonische Skills aus dem geprüften Vokabular, die das Thema belegen. */
const AUTOMATION_SKILLS: ReadonlySet<string> = new Set([
  "AI Agents",
  "n8n",
  "Large Language Models",
  "RAG",
  "Business Process Automation",
  "AI Tooling",
  "Azure OpenAI",
]);

/**
 * Werkzeuge, die (noch) keinen Eintrag im Vokabular haben. Nur ganze Angaben:
 * „Make“ als Skill ist das Werkzeug, „Make-up Artist“ ist es nicht.
 */
const AUTOMATION_TOOL =
  /^(?:make(?:\.com)?|zapier|langchain|langgraph|crewai|autogen|openai(?: api)?|chatgpt|prompt engineering)$/iu;

/** Rollen, die Automatisierung ohne KI-Wort nennen: „Workflow-Automatisierung“. */
const AUTOMATION_ROLE = /automatisier|automation|workflow/iu;

function isAutomationSkill(value: string): boolean {
  return AUTOMATION_SKILLS.has(canonicalSkill(value)) || AUTOMATION_TOOL.test(value.trim());
}

function automationSkills(profile: FreelancerProfile): string[] {
  return profile.skillTags.map(({ value }) => value).filter(isAutomationSkill);
}

export function isAutomationProfile(profile: FreelancerProfile): boolean {
  return (
    automationSkills(profile).length > 0 ||
    roleFamilies(profile.role).includes("ai") ||
    AUTOMATION_ROLE.test(profile.role)
  );
}

function cardSkills(profile: FreelancerProfile): string[] {
  const theme = automationSkills(profile);
  const rest = profile.skillTags
    .map(({ value }) => value)
    .filter((value) => !theme.includes(value));
  return [...new Set([...theme, ...rest])].slice(0, SKILLS_PER_PROFILE);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "de-DE", { sensitivity: "base" });
}

/**
 * Die Auswahl für den Shortcut, fest geordnet: mehr belegte Themen-Skills
 * zuerst, dann nach Namen. Kein Zufall, keine Bewertung — bei jedem Aufruf
 * dieselbe Reihenfolge.
 *
 * `profiles` sind die aktiven, echten, buchbaren Profile, die auch das
 * Matching sieht; `registeredProfileIds` die, hinter denen eine eigene
 * Anmeldung steht.
 */
export function selectAutomationShowcase(
  profiles: readonly FreelancerProfile[],
  registeredProfileIds: ReadonlySet<string>,
  limit = SHOWCASE_LIMIT,
): RegisteredShowcase {
  const eligible = profiles
    .filter(
      (profile) =>
        profile.demoStatus === "real" &&
        profile.profileStatus === "active" &&
        profile.availability.status !== "unavailable" &&
        registeredProfileIds.has(profile.id) &&
        isAutomationProfile(profile),
    )
    .map((profile) => ({ profile, weight: automationSkills(profile).length }))
    .sort(
      (left, right) =>
        right.weight - left.weight ||
        compareText(left.profile.displayName, right.profile.displayName) ||
        compareText(left.profile.id, right.profile.id),
    );

  return {
    theme: "automation",
    total: eligible.length,
    profiles: eligible.slice(0, limit).map(({ profile }) => ({
      id: profile.id,
      displayName: profile.displayName,
      role: profile.role,
      avatarUrl: normalizeAvatarUrl(profile.avatarUrl),
      skills: cardSkills(profile),
    })),
  };
}
