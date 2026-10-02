import { AVAILABILITY_FRESH_DAYS } from "@/components/chat/availability";
import type { AvailabilityStatus } from "@/components/chat-contract";
import type { FreelancerProfile } from "@/lib/domain";
import { roleFit } from "@/lib/domain/role-taxonomy";
import { canonicalSkill } from "@/lib/domain/skill-taxonomy";
import { normalizeAvatarUrl } from "@/lib/freelancer/avatar-limits";
import type { WorkMode } from "@/lib/freelancer/limits";
import { placementRequestsEnabled } from "@/lib/placement/config";
import { formatProfileRate } from "@/lib/presentation/chat";

/**
 * Wer sich für die Rolle eines Shortcuts selbst bei XPORTAL angemeldet hat.
 *
 * Der Shortcut setzt nur den Anfang einer Anfrage ins Eingabefeld. Welche
 * Menschen dahinterstehen, zeigt diese Auswahl schon beim Klick: Profile, die
 * sich selbst registriert haben und freigegeben sind — keine recherchierten
 * Kandidaten ohne Einwilligung, keine vom Betreiber angelegten Zeilen, keine
 * Demo-Profile.
 *
 * Jede Karte beantwortet vorab, ob sich ein Gespräch lohnt und was davor zu
 * klären ist: was das Profil für die Rolle belegt, Honorar, Stand der
 * Verfügbarkeit und der tatsächliche Kontaktweg. Sie ist trotzdem kein
 * Matching. Ob Aufgabe, Start und Budget passen, klärt erst der Abgleich und
 * dann das Gespräch; die Oberfläche sagt das neben der Liste.
 */

export const SHOWCASE_LIMIT = 6;
const EVIDENCE_PER_PROFILE = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

export const SHOWCASE_THEMES = ["ai-agents", "react-typescript", "requirements-engineering"] as const;
export type ShowcaseTheme = (typeof SHOWCASE_THEMES)[number];

export function isShowcaseTheme(value: unknown): value is ShowcaseTheme {
  return typeof value === "string" && (SHOWCASE_THEMES as readonly string[]).includes(value);
}

/** Eine Kompetenz, die das Profil für die Rolle nennt, in seiner Schreibweise. */
export type ShowcaseEvidence = {
  skill: string;
  /** Muss-Kompetenz der Rolle, nicht nur eine weitere passende Angabe. */
  required: boolean;
  /** Von XPORTAL geprüft statt nur angegeben. */
  verified: boolean;
};

/**
 * Wie der Kontakt tatsächlich zustande kommt: über eine Anfrage, die XPORTAL
 * prüft und vorstellt, über den Terminkalender des Freelancers, oder derzeit
 * gar nicht direkt.
 */
export type ShowcaseContact = "request" | "calendar" | "none";

export type ShowcaseProfile = {
  id: string;
  displayName: string;
  role: string;
  avatarUrl: string | null;
  /** Muss-Kompetenzen der Rolle zuerst, dann weitere passende Angaben. */
  evidence: ShowcaseEvidence[];
  /** Das Honorar wie auf der Ergebniskarte; `null`, wenn keines angegeben ist. */
  rate: string | null;
  availability: {
    status: AvailabilityStatus;
    /** Wann der Freelancer die Verfügbarkeit zuletzt angegeben hat. */
    updatedAt: string | null;
    availableFrom: string | null;
  };
  contact: ShowcaseContact;
  /** Ort, wie der Freelancer ihn angibt. */
  location: string | null;
  workModes: WorkMode[];
  /** Profilprüfung durch XPORTAL abgeschlossen. */
  verified: boolean;
};

export type RegisteredShowcase = {
  theme: ShowcaseTheme;
  /** Für die Überschrift: „… Profile für {label}“. */
  label: string;
  /** Alle passenden, selbst angemeldeten Profile — nicht nur die gezeigten. */
  total: number;
  profiles: ShowcaseProfile[];
};

type ThemeDefinition = {
  label: string;
  /**
   * Kanonische Kompetenzen, die das Profil alle nennen muss — dieselben, die
   * der Abgleich aus dem unveränderten Anfang des Shortcuts als Kern liest.
   * Wer nur einen Teil nennt, fiele dort unter die Empfehlungsschwelle und
   * gehört deshalb auch hier nicht in die Liste.
   */
  required: readonly string[];
  /** Weitere kanonische Kompetenzen, die die Rolle belegen. */
  related: ReadonlySet<string>;
  /**
   * Werkzeuge ohne Eintrag im Vokabular. Nur ganze Angaben: „MCP“ als Skill
   * ist das Protokoll, „MCP-Zertifikat“ nicht.
   */
  relatedTool: RegExp;
  /**
   * Die gesuchte Rolle, wo eine Kompetenz allein nicht reicht: Viele Profile
   * nennen „Requirements Engineering“ als eine Fähigkeit unter vielen, ohne
   * Requirements Engineer zu sein. Ein Profil, dessen Rolle erkennbar etwas
   * anderes ist, fehlt dann; eines ohne erkennbare Rolle bleibt.
   */
  roleTitle: string | null;
};

const THEMES: Readonly<Record<ShowcaseTheme, ThemeDefinition>> = {
  "ai-agents": {
    label: "AI-Agent-Entwicklung",
    required: ["AI Agents"],
    related: new Set(["Large Language Models", "RAG", "n8n", "Azure OpenAI", "AI Tooling"]),
    relatedTool:
      /^(?:langchain|langgraph|llamaindex|crewai|autogen|mcp|openai(?: api)?|claude api|prompt engineering)$/iu,
    roleTitle: null,
  },
  "react-typescript": {
    label: "React & TypeScript",
    required: ["React", "TypeScript"],
    related: new Set(["Next.js", "Node.js", "JavaScript"]),
    relatedTool: /^(?:redux|vite|tailwind(?: ?css)?|tanstack query|react query|jest|vitest|playwright|storybook)$/iu,
    roleTitle: null,
  },
  "requirements-engineering": {
    label: "Requirements Engineering",
    required: ["Requirements Management"],
    related: new Set(["Business Analysis", "Process Management"]),
    relatedTool: /^(?:bpmn(?: 2\.0)?|uml|user stories|jira|confluence|stakeholder[- ]management)$/iu,
    roleTitle: "Requirements Engineer",
  },
};

export function emptyShowcase(theme: ShowcaseTheme): RegisteredShowcase {
  return { theme, label: THEMES[theme].label, total: 0, profiles: [] };
}

/** Was das Profil für die Rolle nennt; `null`, wenn eine Muss-Kompetenz fehlt. */
function themeEvidence(profile: FreelancerProfile, theme: ThemeDefinition): ShowcaseEvidence[] | null {
  const tags = profile.skillTags.map((tag) => ({ ...tag, canonical: canonicalSkill(tag.value) }));
  const required: ShowcaseEvidence[] = [];
  for (const skill of theme.required) {
    const tag = tags.find((candidate) => candidate.canonical === skill);
    if (!tag) return null;
    required.push({ skill: tag.value, required: true, verified: tag.source === "verified" });
  }
  const seen = new Set(theme.required);
  const related: ShowcaseEvidence[] = [];
  for (const tag of tags) {
    if (seen.has(tag.canonical)) continue;
    if (!theme.related.has(tag.canonical) && !theme.relatedTool.test(tag.value.trim())) continue;
    seen.add(tag.canonical);
    related.push({ skill: tag.value, required: false, verified: tag.source === "verified" });
  }
  return [...required, ...related];
}

function contactFor(profile: FreelancerProfile, placement: boolean): ShowcaseContact {
  if (placement) return "request";
  return profile.introPolicy.bookingUrl ? "calendar" : "none";
}

/** Angegeben innerhalb der Frist, ab der die Karte zur Bestätigung rät. */
function freshAvailability(profile: FreelancerProfile, now: Date): boolean {
  const { status, checkedAt } = profile.availability;
  if (status === "unknown" || !checkedAt) return false;
  const time = new Date(checkedAt).getTime();
  return !Number.isNaN(time) && now.getTime() - time <= AVAILABILITY_FRESH_DAYS * DAY_MS;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "de-DE", { sensitivity: "base" });
}

/**
 * Die Auswahl für den Shortcut, fest geordnet: zuerst, wessen
 * Verfügbarkeitsangabe frisch ist — mit wem sich ein Gespräch jetzt führen
 * lässt —, dann mehr belegte Kompetenzen der Rolle, dann ein angegebenes
 * Honorar, dann nach Namen. Kein Zufall, keine Bewertung.
 *
 * `profiles` sind die aktiven, echten, buchbaren Profile, die auch das
 * Matching sieht; `registeredProfileIds` die, hinter denen eine eigene
 * Anmeldung steht.
 */
export function selectShowcase(
  theme: ShowcaseTheme,
  profiles: readonly FreelancerProfile[],
  registeredProfileIds: ReadonlySet<string>,
  now: Date = new Date(),
  options: { limit?: number; placement?: boolean } = {},
): RegisteredShowcase {
  const definition = THEMES[theme];
  const limit = options.limit ?? SHOWCASE_LIMIT;
  const placement = options.placement ?? placementRequestsEnabled();

  const eligible = profiles
    .filter(
      (profile) =>
        profile.demoStatus === "real" &&
        profile.profileStatus === "active" &&
        profile.availability.status !== "unavailable" &&
        registeredProfileIds.has(profile.id) &&
        roleFit(definition.roleTitle, profile.role).kind !== "mismatch",
    )
    .flatMap((profile) => {
      const evidence = themeEvidence(profile, definition);
      return evidence
        ? [{ profile, evidence, fresh: freshAvailability(profile, now), rate: formatProfileRate(profile) }]
        : [];
    })
    .sort(
      (left, right) =>
        Number(right.fresh) - Number(left.fresh) ||
        right.evidence.length - left.evidence.length ||
        Number(right.rate !== null) - Number(left.rate !== null) ||
        compareText(left.profile.displayName, right.profile.displayName) ||
        compareText(left.profile.id, right.profile.id),
    );

  return {
    theme,
    label: definition.label,
    total: eligible.length,
    profiles: eligible.slice(0, limit).map(({ profile, evidence, rate }) => ({
      id: profile.id,
      displayName: profile.displayName,
      role: profile.role,
      avatarUrl: normalizeAvatarUrl(profile.avatarUrl),
      evidence: evidence.slice(0, EVIDENCE_PER_PROFILE),
      rate,
      availability: {
        status: profile.availability.status,
        updatedAt: profile.availability.checkedAt,
        availableFrom: profile.availability.availableFrom,
      },
      contact: contactFor(profile, placement),
      location: profile.location?.value ?? null,
      workModes: [...profile.workModes],
      verified: profile.referenceStatus === "verified",
    })),
  };
}
