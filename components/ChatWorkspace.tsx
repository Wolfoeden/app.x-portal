"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  beginEmailUpgrade,
  claimPreparedGuestWorkspace,
  ensureGuestSession,
  setAccountPassword,
  signInExistingAccount,
  signOut as signOutAccount,
  startOauthUpgrade,
} from "@/lib/auth/browser";
import {
  type AvailabilityStatus,
  type ChatApiPaths,
  type ChatRequest,
  type ChatResponse,
  type ChatStreamEvent,
  type ConversationMessage,
  type FreelancerProfileResult,
  type ProjectDetailResponse,
  type ProjectListItem,
  type ProjectMode,
  type SessionResponse,
  type StructuredBrief,
  type VerificationLevel,
  defaultChatApiPaths,
} from "./chat-contract";

const CALENDLY_URL = process.env.NEXT_PUBLIC_CALENDLY_URL ?? "https://calendly.com/romandering/30min";
const CONTACT_PHONE = process.env.NEXT_PUBLIC_CONTACT_PHONE ?? "+491758934338";
const CONTACT_PHONE_LABEL = "+49 175 8934338";

const suggestions = [
  {
    label: "React-Entwicklung",
    description: "Freelancer fÃ¼r ein Webprojekt finden",
    draftPrefix: "React-Entwicklung\n\nProjektbeschreibung:\n",
    intro:
      "React-Entwicklung ist ausgewÃ¤hlt. FÃ¼gen Sie jetzt einfach Ihre vorhandene Projektbeschreibung ein â€“ auch als langen Copy-and-paste-Text. Ich strukturiere Aufgaben, benÃ¶tigte Kompetenzen, Rahmenbedingungen und offene Angaben und gleiche sie anschlieÃŸend mit verfÃ¼gbaren Profilen ab.",
  },
  {
    label: "Anforderungsmanagement",
    description: "Anforderungen strukturieren und begleiten",
    draftPrefix: "Anforderungsmanagement\n\nProjektbeschreibung:\n",
    intro:
      "Anforderungsmanagement ist ausgewÃ¤hlt. FÃ¼gen Sie jetzt Ihre Projektbeschreibung, Ihr Lastenheft oder vorhandene Notizen ein. Ich fasse Ziel, Aufgaben, Pflichtkompetenzen, Rahmenbedingungen und offene Punkte zusammen und suche danach passende verfÃ¼gbare Profile.",
  },
  {
    label: "Prozessmanagement",
    description: "AblÃ¤ufe analysieren und verbessern",
    draftPrefix: "Prozessmanagement\n\nProjektbeschreibung:\n",
    intro:
      "Prozessmanagement ist ausgewÃ¤hlt. Kopieren Sie Ihre Ausgangslage oder Projektbeschreibung in das Eingabefeld. Ich strukturiere Prozessziel, Aufgaben, benÃ¶tigte Erfahrung, zeitliche Vorgaben und weitere EinschrÃ¤nkungen und starte dann den Profilabgleich.",
  },
  {
    label: "Informationssicherheit",
    description: "Expertise fÃ¼r sichere Organisationen",
    draftPrefix: "Informationssicherheit\n\nProjektbeschreibung:\n",
    intro:
      "Informationssicherheit ist ausgewÃ¤hlt. FÃ¼gen Sie Ihre Projektbeschreibung oder Anforderungsliste direkt ein. Ich erfasse Thema, benÃ¶tigte Qualifikationen, Standards, Einsatzrahmen und offene Angaben, ohne fehlende Fakten zu erfinden, und gleiche das Ergebnis anschlieÃŸend mit verfÃ¼gbaren Profilen ab.",
  },
] as const;

type Suggestion = (typeof suggestions)[number];

type AuthView = SessionResponse;

type ToastState = {
  id: number;
  message: string;
  tone: "neutral" | "error";
};

type PendingAssistant = {
  id: string;
  clientMessageId: string;
  content: string;
  progress: string;
  retryText: string | null;
};

interface ChatWorkspaceProps {
  apiPaths?: Partial<ChatApiPaths>;
}

const emptyAuth: AuthView = {
  authenticated: false,
  anonymous: true,
  user: null,
};

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeMode(value: unknown): ProjectMode {
  return value === "remote" || value === "on-site" || value === "hybrid" ? value : "unknown";
}

function normalizeAvailability(value: unknown): AvailabilityStatus {
  return value === "available" || value === "limited" || value === "unavailable"
    ? value
    : "unknown";
}

function normalizeBrief(value: unknown): StructuredBrief {
  const brief = isRecord(value) ? value : {};
  const languages = Array.isArray(brief.languages)
    ? stringList(brief.languages)
    : nullableString(brief.language)
      ? [stringValue(brief.language)]
      : [];

  return {
    projectTitle: stringValue(brief.projectTitle ?? brief.project_title, "Neues Projekt"),
    summary: stringValue(brief.summary),
    requiredSkills: stringList(brief.requiredSkills ?? brief.required_skills),
    optionalSkills: stringList(brief.optionalSkills ?? brief.optional_skills),
    languages,
    mode: normalizeMode(brief.mode ?? brief.remoteOnSitePreference ?? brief.remote_on_site_preference),
    location: nullableString(brief.location),
    startWindow: nullableString(brief.startWindow ?? brief.start_window),
    duration: nullableString(brief.duration),
    budgetOrRate: nullableString(brief.budgetOrRate ?? brief.budget_or_rate ?? brief.budget),
    constraints: stringList(brief.constraints),
    qualifications: stringList(brief.qualifications),
    availabilityRequirement: nullableString(
      brief.availabilityRequirement ?? brief.availability_requirement,
    ),
    contractualRequirements: stringList(
      brief.contractualRequirements ?? brief.contractual_requirements,
    ),
    unknownFields: stringList(brief.unknownFields ?? brief.unknown_fields),
  };
}

function normalizeProfile(value: unknown): FreelancerProfileResult | null {
  if (!isRecord(value)) return null;
  const profileSource = isRecord(value.profile) ? value.profile : value;
  const id = stringValue(profileSource.id ?? value.profileId ?? value.profile_id);
  if (!id) return null;

  const factsSource = Array.isArray(profileSource.facts) ? profileSource.facts : [];
  const facts = factsSource.flatMap((item) => {
    if (!isRecord(item)) return [];
    const label = stringValue(item.label);
    const factValue = stringValue(item.value);
    if (!label || !factValue) return [];
    const verification: VerificationLevel =
      item.verification === "verified" || item.verification === "self-reported"
        ? item.verification
        : "unknown";
    return [{ label, value: factValue, verification }];
  });

  const introSource = isRecord(profileSource.introPolicy ?? profileSource.intro_policy)
    ? (profileSource.introPolicy ?? profileSource.intro_policy) as Record<string, unknown>
    : {};
  const introType = introSource.type === "premium" ? "premium" : "free";

  return {
    id,
    demoStatus:
      profileSource.demoStatus === "real" || profileSource.demo_status === "real"
        ? "real"
        : "demo",
    displayName: stringValue(profileSource.displayName ?? profileSource.display_name, "Profil"),
    role: stringValue(profileSource.role, "Freelancer"),
    skillTags: stringList(profileSource.skillTags ?? profileSource.skill_tags),
    languages: stringList(profileSource.languages),
    location: nullableString(profileSource.location),
    remoteMode: normalizeMode(profileSource.remoteMode ?? profileSource.remote_mode),
    experienceSummary: stringValue(
      profileSource.experienceSummary ?? profileSource.experience_summary,
    ),
    facts,
    referenceStatus: nullableString(
      profileSource.referenceStatus ?? profileSource.reference_status,
    ),
    rate: nullableString(profileSource.rate),
    availabilityStatus: normalizeAvailability(
      profileSource.availabilityStatus ?? profileSource.availability_status,
    ),
    availabilityUpdatedAt: nullableString(
      profileSource.availabilityUpdatedAt ?? profileSource.availability_updated_at,
    ),
    matchReasons: stringList(value.matchReasons ?? value.match_reasons),
    knownGaps: stringList(value.knownGaps ?? value.known_gaps),
    introPolicy: {
      type: introType,
      label: stringValue(
        introSource.label,
        introType === "premium" ? "PersÃ¶nliche Freigabe" : "Kostenfreie EinfÃ¼hrung",
      ),
      manualApprovalRequired:
        typeof introSource.manualApprovalRequired === "boolean"
          ? introSource.manualApprovalRequired
          : typeof introSource.manual_approval_required === "boolean"
            ? introSource.manual_approval_required
            : introType === "premium",
      readyToBook:
        typeof introSource.readyToBook === "boolean"
          ? introSource.readyToBook
          : typeof introSource.ready_to_book === "boolean"
            ? introSource.ready_to_book
            : introType === "free",
    },
  };
}

function normalizeProject(value: unknown, fallbackTitle: string): ProjectListItem {
  const project = isRecord(value) ? value : {};
  return {
    id: stringValue(project.id, makeId("project")),
    title: stringValue(project.title, fallbackTitle || "Neues Projekt"),
    updatedAt: stringValue(project.updatedAt ?? project.updated_at, new Date().toISOString()),
    status:
      project.status === "draft" ||
      project.status === "matching" ||
      project.status === "shortlisted" ||
      project.status === "contact" ||
      project.status === "closed"
        ? project.status
        : undefined,
  };
}

function normalizeMessage(value: unknown): ConversationMessage {
  if (typeof value === "string") {
    return { id: makeId("assistant"), role: "assistant", content: value };
  }
  const message = isRecord(value) ? value : {};
  return {
    id: stringValue(message.id, makeId("assistant")),
    role: message.role === "user" ? "user" : "assistant",
    content: stringValue(message.content ?? message.text),
    createdAt: nullableString(message.createdAt ?? message.created_at) ?? undefined,
  };
}

function normalizeChatResponse(value: unknown, fallbackTitle: string): ChatResponse {
  const response = isRecord(value) && isRecord(value.data) ? value.data : value;
  if (!isRecord(response)) throw new Error("Die Serverantwort hatte kein gÃ¼ltiges Format.");
  const matchSource = response.matches ?? response.profiles ?? response.shortlist;
  const matches = Array.isArray(matchSource)
    ? matchSource.map(normalizeProfile).filter((item): item is FreelancerProfileResult => item !== null)
    : [];

  return {
    project: normalizeProject(response.project, fallbackTitle),
    message: normalizeMessage(response.message ?? response.assistantMessage ?? response.assistant),
    brief: normalizeBrief(response.brief),
    matches: matches.slice(0, 3),
    mode: response.mode === "fallback" ? "fallback" : "ai",
    notice: nullableString(response.notice) ?? undefined,
  };
}

function normalizeProjectDetail(value: unknown): ProjectDetailResponse {
  const response = isRecord(value) && isRecord(value.data) ? value.data : value;
  if (!isRecord(response)) throw new Error("Das Projekt konnte nicht gelesen werden.");
  const messages = Array.isArray(response.messages) ? response.messages.map(normalizeMessage) : [];
  const matchSource = response.matches ?? response.profiles ?? response.shortlist;
  const profiles = Array.isArray(matchSource)
    ? matchSource.map(normalizeProfile).filter((item): item is FreelancerProfileResult => item !== null)
    : [];
  return {
    project: normalizeProject(response.project, "Gespeichertes Projekt"),
    messages,
    brief: response.brief ? normalizeBrief(response.brief) : null,
    profiles: profiles.slice(0, 3),
  };
}

function authViewFromClaims(data: unknown): AuthView {
  const wrapper = isRecord(data) ? data : {};
  const claims = isRecord(wrapper.claims) ? wrapper.claims : wrapper;
  const userId = nullableString(claims.sub);
  const anonymous = claims.is_anonymous !== false;
  return {
    authenticated: Boolean(userId),
    anonymous,
    user: userId
      ? {
          id: userId,
          displayName: nullableString(claims.name ?? claims.full_name),
          email: nullableString(claims.email),
        }
      : null,
  };
}

function formatRelativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "KÃ¼rzlich";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Gerade eben";
  if (minutes < 60) return `Vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Vor ${hours} Std.`;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "short" }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) return "Nicht angegeben";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function initials(name: string) {
  const result = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return result || "P";
}

function modeLabel(mode: ProjectMode) {
  if (mode === "remote") return "Remote";
  if (mode === "on-site") return "Vor Ort";
  if (mode === "hybrid") return "Hybrid";
  return "Nicht angegeben";
}

function availabilityLabel(status: AvailabilityStatus) {
  if (status === "available") return "VerfÃ¼gbar";
  if (status === "limited") return "Begrenzt verfÃ¼gbar";
  if (status === "unavailable") return "Nicht verfÃ¼gbar";
  return "Status unbekannt";
}

const unknownFieldLabels: Readonly<Record<string, string>> = {
  projectTitle: "Projektname",
  requiredSkills: "Pflichtkompetenzen",
  optionalSkills: "optionale Kompetenzen",
  language: "Sprache",
  workMode: "Arbeitsmodus",
  location: "Ort",
  startWindow: "Startzeitraum",
  duration: "Dauer",
  budget: "Budget",
  rate: "Honorar",
  constraints: "Rahmenbedingungen",
  qualifications: "Qualifikationen",
  availabilityRequirement: "VerfÃ¼gbarkeit",
  contractualRequirements: "Vertragsanforderungen",
};

function presentUnknownFields(fields: string[]) {
  return fields.map((field) => unknownFieldLabels[field] ?? field);
}

async function parseStreamResponse(
  response: Response,
  onDelta: (content: string, progress?: string) => void,
  fallbackTitle: string,
) {
  if (!response.body) throw new Error("Der Server hat keine Antwort gesendet.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let textContent = "";
  let result: ChatResponse | null = null;

  const consume = (line: string) => {
    const cleaned = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
×tÒÚ$z{-®éÜj×4ôåD5Eõ„ôäUôÄ$TÇÓÂöà¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ&’Öæ÷FR#ãÇ7â&–Ö†–FFVãÒ'G'VR#æ“Â÷7ããÇãÇ7G&öæsåG&ç7&VçFRVçFW'7L;ÇG§VæsÂ÷7G&öæsäF–R´’7G'V·GW&–W'B–‡&Ræg&vRâ&öf–ÆRvW&FVâæ6‚fW7FVâÂ;Æ&W',;Æf&&Vâ&VvVÆâvVf–ÇFW'BãÂ÷ãÂöF—cà¢ÂöF—cà¢“°§Ğ ¦gVæ7F–öâÖöFÂ‡²F—FÆT–BÂöä6Æ÷6RÂ6†–ÆG&VâÂ6—¦RÒ&FVfVÇB"Ó¢²F—FÆT–C¢7G&–æs²öä6Æ÷6S¢‚’Óâfö–C²6†–ÆG&Vã¢&V7DæöFS²6—¦Só¢&FVfVÇB"Â&Æ&vR"Ò’°¢6öç7B6Æ÷6U&VbÒW6U&VcÄ…DÔÄ'WGFöäVÆVÖVçCâ†çVÆÂ“°¢6öç7B6&E&VbÒW6U&VcÄ…DÔÄVÆVÖVçCâ†çVÆÂ“°¢W6TVffV7B‚‚’Óâ°¢6öç7B&Wf–÷W6Ç”fö7W6VBÒFö7VÖVçBæ7F—fTVÆVÖVçB–ç7Fæ6Vöb…DÔÄVÆVÖVçBòFö7VÖVçBæ7F—fTVÆVÖVçB¢çVÆÃ°¢6Æ÷6U&Vbæ7W'&VçCòæfö7W2‚“°¢6öç7Böä¶W’Ò†WfVçC¢vÆö&ÅF†—2ä¶W–&ö&DWfVçB’Óâ°¢–b†WfVçBæ¶W’ÓÓÒ$W66R"’öä6Æ÷6R‚“°¢–b†WfVçBæ¶W’ÓÓÒ%F""bb6&E&Vbæ7W'&VçB’°¢6öç7Bfö7W6&ÆRÒ'&’æg&öÒ€¢6&E&Vbæ7W'&VçBçVW'•6VÆV7F÷$ÆÃÄ…DÔÄVÆVÖVçCâ€¢v'WGFöã¦æ÷B…¶F—6&ÆVEÒ’Â¶‡&VeÒÂ–çWC¦æ÷B…¶F—6&ÆVEÒ’ÂFW‡F&V¦æ÷B…¶F—6&ÆVEÒ’Â·F&–æFW…Ó¦æ÷B…·F&–æFWƒÒ"Ó%Ò’rÀ¢’À¢“°¢6öç7Bf—'7BÒfö7W6&ÆU³Ó°¢6öç7BÆ7BÒfö7W6&ÆRæB‚Ó“°¢–b‚f—'7BÇÂÆ7B’&WGW&ã°¢–b†WfVçBç6†–gD¶W’bbFö7VÖVçBæ7F—fTVÆVÖVçBÓÓÒf—'7B’°¢WfVçBç&WfVçDFVfVÇB‚“°¢Æ7Bæfö7W2‚“°¢ÒVÇ6R–b‚WfVçBç6†–gD¶W’bbFö7VÖVçBæ7F—fTVÆVÖVçBÓÓÒÆ7B’°¢WfVçBç&WfVçDFVfVÇB‚“°¢f—'7Bæfö7W2‚“°¢Ğ¢Ğ¢Ó°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚&¶W–F÷vâ"Âöä¶W’“°¢&WGW&â‚’Óâ°¢Fö7VÖVçBç&VÖ÷fTWfVçDÆ—7FVæW"‚&¶W–F÷vâ"Âöä¶W’“°¢&Wf–÷W6Ç”fö7W6VCòæfö7W2‚“°¢Ó°¢ÒÂ¶öä6Æ÷6UÒ“°¢&WGW&â€¢ÆF—b6Æ74æÖSÒ&ÖöFÂÖ&6¶G&÷"&öÆSÒ'&W6VçFF–öâ"öäÖ÷W6TF÷vã×²†WfVçB’Óâ²–b†WfVçBçF&vWBÓÓÒWfVçBæ7W'&VçEF&vWB’öä6Æ÷6R‚“²×Óà¢Ç6V7F–öâ&Vc×¶6&E&VgÒ6Æ74æÖS×¶ÖöFÂÖ6&BG·6—¦RÓÓÒ&Æ&vR"ò&—2ÖÆ&vR"¢"'ÖÒ&öÆSÒ&F–Æör"&–ÖÖöFÃÒ'G'VR"&–ÖÆ&VÆÆVF'“×·F—FÆT–GÓà¢Æ'WGFöâ&Vc×¶6Æ÷6U&VgÒ6Æ74æÖSÒ&ÖöFÂÖ6Æ÷6R"G—SÒ&'WGFöâ"öä6Æ–6³×¶öä6Æ÷6WÒ&–ÖÆ&VÃÒ$F–Æör66†Æ–\9öVâ#ì9sÂö'WGFöãà¢¶6†–ÆG&VçĞ¢Â÷6V7F–öãà¢ÂöF—cà¢“°§Ğ ¦gVæ7F–öâWF„F–Æör‡°¢–æ—F–ÄÖöFRÀ¢öä6Æ÷6RÀ¢öäWF†VçF–6FVBÀ¢6†÷uFö7BÀ§Ó¢°¢–æ—F–ÄÖöFS¢&Æöv–â"Â'&Vv—7FW""Â'6WB×77v÷&B#°¢öä6Æ÷6S¢‚’Óâfö–C°¢öäWF†VçF–6FVC¢‚’Óâfö–C°¢6†÷uFö7C¢†ÖW76vS¢7G&–ærÂFöæSó¢Fö7E7FFU²'FöæR%Ò’Óâfö–C°§Ò’°¢6öç7B¶ÖöFRÂ6WDÖöFUÒÒW6U7FFR†–æ—F–ÄÖöFR“°¢6öç7B¶VÖ–ÂÂ6WDVÖ–ÅÒÒW6U7FFR‚""“°¢6öç7B·77v÷&BÂ6WE77v÷&EÒÒW6U7FFR‚""“°¢6öç7B·77v÷&E&WVBÂ6WE77v÷&E&WVEÒÒW6U7FFR‚""“°¢6öç7B¶6öæf—&ÖF–öå6VçBÂ6WD6öæf—&ÖF–öå6VçEÒÒW6U7FFR†fÇ6R“°¢6öç7B¶'W7’Â6WD'W7•ÒÒW6U7FFSÂ&vöövÆR"Â&Ö–7&÷6ögB"Â&VÖ–Â"ÂçVÆÃâ†çVÆÂ“°¢6öç7B¶W'&÷"Â6WDW'&÷%ÒÒW6U7FFSÇ7G&–ærÂçVÆÃâ†çVÆÂ“° ¢6öç7B6öææV7E&÷f–FW"Ò7–æ2‡&÷f–FW#¢&vöövÆR"Â&Ö–7&÷6ögB"’Óâ°¢6WD'W7’‡&÷f–FW"“°¢6WDW'&÷"†çVÆÂ“°¢G'’°¢v—B7F'DöWF…Ww&FR‡&÷f–FW"“°¢Ò6F6‚‡&÷f–FW$W'&÷"’°¢6WDW'&÷"‡&÷f–FW$W'&÷"–ç7Fæ6VöbW'&÷"ò&÷f–FW$W'&÷"æÖW76vR¢$æÖVÆGVær¶öæçFRæ–6‡BvW7F'FWBvW&FVââ"“°¢6WD'W7’†çVÆÂ“°¢Ğ¢Ó° ¢6öç7B7V&Ö—DVÖ–ÂÒ7–æ2†WfVçC¢f÷&ÔWfVçCÄ…DÔÄf÷&ÔVÆVÖVçCâ’Óâ°¢WfVçBç&WfVçDFVfVÇB‚“°¢6WD'W7’‚&VÖ–Â"“°¢6WDW'&÷"†çVÆÂ“°¢–b†ÖöFRÓÓÒ'6WB×77v÷&B"bb77v÷&BÓÒ77v÷&E&WVB’°¢6WDW'&÷"‚$F–R&V–FVâ77|;g'FW"7F–ÖÖVâæ–6‡B;Æ&W&V–ââ"“°¢6WD'W7’†çVÆÂ“°¢&WGW&ã°¢Ğ¢G'’°¢–b†ÖöFRÓÓÒ&Æöv–â"’°¢v—B6–vä–äW†—7F–æt66÷VçB†VÖ–ÂÂ77v÷&B“°¢6†÷uFö7B‚$æÖVÆGVærW&föÆw&V–6‚â–‡&RW7v†Âv—&Bf÷'FvW6WG§Bâ"“°¢öäWF†VçF–6FVB‚“°¢ÒVÇ6R–b†ÖöFRÓÓÒ'&Vv—7FW""’°¢v—B&Vv–äVÖ–ÅWw&FR†VÖ–Â“°¢6WD6öæf—&ÖF–öå6VçB‡G'VR“°¢6WD'W7’†çVÆÂ“°¢ÒVÇ6R°¢v—B6WD66÷VçE77v÷&B‡77v÷&B“°¢6öç7B6ÆVåW&ÂÒG·v–æF÷ræÆö6F–öâçF†æÖWÒG·v–æF÷ræÆö6F–öâæ†6‡Ö°¢v–æF÷ræ†—7F÷'’ç&WÆ6U7FFR‡·ÒÂ""Â6ÆVåW&Â“°¢6†÷uFö7B‚$–‡"¶öçFò—7BV–ævW&–6‡FWBâ–‡&RW7v†Âv—&Bf÷'FvW6WG§Bâ"“°¢öäWF†VçF–6FVB‚“°¢Ğ¢Ò6F6‚†VÖ–ÄW'&÷"’°¢6WDW'&÷"€¢VÖ–ÄW'&÷"–ç7Fæ6VöbW'&÷ ¢òVÖ–ÄW'&÷"æÖW76vP¢¢ÖöFRÓÓÒ&Æöv–â ¢ò$RÔÖ–ÂöFW"77v÷'B—7Bæ–6‡B¶÷'&V·Bâ ¢¢$F2¶öçFò¶öæçFRvW&FRæ–6‡BV–ævW&–6‡FWBvW&FVââ"À¢“°¢6WD'W7’†çVÆÂ“°¢Ğ¢Ó° ¢&WGW&â€¢ÄÖöFÂF—FÆT–CÒ&WF‚×F—FÆR"öä6Æ÷6S×¶öä6Æ÷6WÓà¢ÆF—b6Æ74æÖSÒ&WF‚ÖF–Æör#à¢Ç7â6Æ74æÖSÒ&F–ÆörÖW–V'&÷r#äW7v†Â6–6†W&ãÂ÷7ãà¢Æƒ"–CÒ&WF‚×F—FÆR#à¢¶ÖöFRÓÓÒ'6WB×77v÷&B"ò$¶öçFòfW'F–rV–ç&–6‡FVâ"¢$æÖVÆFVâVæBF—&V·Bf÷'Ff‡&Vâ'Ğ¢Âöƒ#à¢Çà¢¶ÖöFRÓÓÒ'6WB×77v÷&B ¢ò$–‡&RRÔÖ–ÂwW&FR&W7L:GF–wBâÆVvVâ6–R¦WG§B–‡"77v÷'BfW7Bâ ¢¢$–‡&Ræg&vR&ÆV–'BW&†ÇFVââæ6‚FW"æÖVÆGVær¶V‡&Vâ6–RvVæR§R–‡&VÒW6vW|:F†ÇFVâ&öf–Â§W,;Æ6²â'Ğ¢Â÷à ¢¶ÖöFRÓÒ'6WB×77v÷&B"ò€¢Ãà¢ÆF—b6Æ74æÖSÒ'&÷f–FW"Ö'WGFöç2#à¢Æ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×²‚’Óâfö–B6öææV7E&÷f–FW"‚&vöövÆR"—ÒF—6&ÆVC×´&ööÆVâ†'W7’—ÓãÇ7â6Æ74æÖSÒ'&÷f–FW"ÖÆWGFW""&–Ö†–FFVãÒ'G'VR#äsÂ÷7ãç¶'W7’ÓÓÒ&vöövÆR"ò$vöövÆRv—&Bv\;fffæWB(
b"¢$Ö—BvöövÆRf÷'Ff‡&Vâ'ÓÂö'WGFöãà¢Æ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×²‚’Óâfö–B6öææV7E&÷f–FW"‚&Ö–7&÷6ögB"—ÒF—6&ÆVC×´&ööÆVâ†'W7’—ÓãÇ7â6Æ74æÖSÒ'&÷f–FW"ÖÆWGFW"Ö–7&÷6ögB"&–Ö†–FFVãÒ'G'VR#äÓÂ÷7ãç¶'W7’ÓÓÒ&Ö–7&÷6ögB"ò$Ö–7&÷6ögBv—&Bv\;fffæWB(
b"¢$Ö—BÖ–7&÷6ögBf÷'Ff‡&Vâ'ÓÂö'WGFöãà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&÷"ÖF—f–FW"#ãÇ7ãæöFW#Â÷7ããÂöF—cà¢ÆF—b6Æ74æÖSÒ&WF‚ÖÖöFR×F'2"&öÆSÒ'F&Æ—7B"&–ÖÆ&VÃÒ$RÔÖ–ÂÕ§Vvær#à¢Æ'WGFöâG—SÒ&'WGFöâ"&öÆSÒ'F""&–×6VÆV7FVC×¶ÖöFRÓÓÒ&Æöv–â'Ò6Æ74æÖS×¶ÖöFRÓÓÒ&Æöv–â"ò&7F—fR"¢"'Òöä6Æ–6³×²‚’Óâ²6WDÖöFR‚&Æöv–â"“²6WDW'&÷"†çVÆÂ“²×Óä&W7FV†VæFW2¶öçFóÂö'WGFöãà¢Æ'WGFöâG—SÒ&'WGFöâ"&öÆSÒ'F""&–×6VÆV7FVC×¶ÖöFRÓÓÒ'&Vv—7FW"'Ò6Æ74æÖS×¶ÖöFRÓÓÒ'&Vv—7FW""ò&7F—fR"¢"'Òöä6Æ–6³×²‚’Óâ²6WDÖöFR‚'&Vv—7FW""“²6WDW'&÷"†çVÆÂ“²×ÓäæWVW2¶öçFóÂö'WGFöãà¢ÂöF—cà¢Âóà¢’¢çVÆÇĞ ¢¶6öæf—&ÖF–öå6VçBò€¢ÆF—b6Æ74æÖSÒ&6öæf—&ÖF–öâ×7FFR"&öÆSÒ'7FGW2#à¢Ç7â&–Ö†–FFVãÒ'G'VR#î)É3Â÷7ãà¢Æƒ3ä&W7L:GF–wVæw6Æ–æ²fW'6VæFWCÂöƒ3à¢Çì9fffæVâ6–RFVâÆ–æ²–âFW"RÔÖ–ÂâÇ7G&öæsç¶VÖ–ÇÓÂ÷7G&öæsââç66†Æ–\9öVæBÆVvVâ6–R†–W"–‡"77v÷'BfW7BVæBf‡&VâÖ—B–‡&W"W7v†Âf÷'BãÂ÷à¢Æ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×¶öä6Æ÷6WÓåfW'7FæFVãÂö'WGFöãà¢ÂöF—cà¢’¢€¢Æf÷&Ò6Æ74æÖSÒ&VÖ–ÂÖÆöv–â"öå7V&Ö—C×·7V&Ö—DVÖ–ÇÓà¢¶ÖöFRÓÒ'6WB×77v÷&B"ò€¢Ãà¢ÆÆ&VÂ‡FÖÄf÷#Ò&Æöv–âÖVÖ–Â#äRÔÖ–ÂÔG&W76SÂöÆ&VÃà¢Æ–çWB–CÒ&Æöv–âÖVÖ–Â"G—SÒ&VÖ–Â"fÇVS×¶VÖ–ÇÒöä6†ævS×²†WfVçB’Óâ6WDVÖ–Â†WfVçBçF&vWBçfÇVR—ÒWFô6ö×ÆWFSÒ&VÖ–Â"&WV—&VBóà¢Âóà¢’¢çVÆÇĞ¢¶ÖöFRÓÒ'&Vv—7FW""ò€¢Ãà¢ÆÆ&VÂ‡FÖÄf÷#Ò&Æöv–â×77v÷&B#ç¶ÖöFRÓÓÒ'6WB×77v÷&B"ò$æWVW277v÷'B"¢%77v÷'B'ÓÂöÆ&VÃà¢Æ–çWB–CÒ&Æöv–â×77v÷&B"G—SÒ'77v÷&B"fÇVS×·77v÷&GÒöä6†ævS×²†WfVçB’Óâ6WE77v÷&B†WfVçBçF&vWBçfÇVR—ÒWFô6ö×ÆWFS×¶ÖöFRÓÓÒ'6WB×77v÷&B"ò&æWr×77v÷&B"¢&7W'&VçB×77v÷&B'ÒÖ–äÆVæwFƒ×³‡Ò&WV—&VBóà¢Âóà¢’¢çVÆÇĞ¢¶ÖöFRÓÓÒ'6WB×77v÷&B"ò€¢Ãà¢ÆÆ&VÂ‡FÖÄf÷#Ò&Æöv–â×77v÷&B×&WVB#å77v÷'Bv–VFW&†öÆVãÂöÆ&VÃà¢Æ–çWB–CÒ&Æöv–â×77v÷&B×&WVB"G—SÒ'77v÷&B"fÇVS×·77v÷&E&WVGÒöä6†ævS×²†WfVçB’Óâ6WE77v÷&E&WVB†WfVçBçF&vWBçfÇVR—ÒWFô6ö×ÆWFSÒ&æWr×77v÷&B"Ö–äÆVæwFƒ×³‡Ò&WV—&VBóà¢Âóà¢’¢çVÆÇĞ¢¶W'&÷"òÇ6Æ74æÖSÒ&f÷&ÒÖW'&÷""&öÆSÒ&ÆW'B#ç¶W'&÷'ÓÂ÷â¢çVÆÇĞ¢Æ'WGFöâ6Æ74æÖSÒ&WF‚×7V&Ö—B"G—SÒ'7V&Ö—B"F—6&ÆVC×´&ööÆVâ†'W7’—Óà¢¶'W7’ÓÓÒ&VÖ–Â ¢ò$&—GFRv'FVâ(
b ¢¢ÖöFRÓÓÒ&Æöv–â ¢ò$Ö—BRÔÖ–ÂæÖVÆFVâ ¢¢ÖöFRÓÓÒ'&Vv—7FW" ¢ò$&W7L:GF–wVæw6Æ–æ²6VæFVâ ¢¢%77v÷'B7V–6†W&âbf÷'Ff‡&Vâ'Ğ¢Âö'WGFöãà¢Âöf÷&Óà¢—Ğ¢Ç6Æ74æÖSÒ&WF‚×&—f7’#äF–RæÖVÆGVærF–VçBF§RÂ&ö¦V·FRvW,:GF\;Æ&W&w&V–fVæB§W§V÷&FæVâVæBV–æR&öf–Çv†Â6–6†W"f÷'G§W6WG¦VâãÂ÷à¢ÂöF—cà¢ÂôÖöFÃà¢“°§Ğ ¦gVæ7F–öâ6öçF7DF–Æör‡²&öf–ÆRÂöä6Æ÷6RÂöå&V6÷&D–çG&öGV7F–öâÓ¢²&öf–ÆS¢g&VVÆæ6W%&öf–ÆU&W7VÇC²öä6Æ÷6S¢‚’Óâfö–C²öå&V6÷&D–çG&öGV7F–öã¢†–FV×÷FVæ7”¶W“¢7G&–ær’Óâ&öÖ—6SÆ&ööÆVãâÒ’°¢6öç7B¶6ÆVæFÇ”ÆöFVBÂ6WD6ÆVæFÇ”ÆöFVEÒÒW6U7FFR†fÇ6R“°¢6öç7B·&WVW7E7FFRÂ6WE&WVW7E7FFUÒÒW6U7FFSÂ&–FÆR"Â'6VæF–ær"Â'6VçB"Â&W'&÷"#â‚&–FÆR"“°¢6öç7B–çG&öGV7F–öä¶W’ÒW6U&Vb†Ö¶T–B‚&–çG&ò"’“°¢6öç7B6ä&öö´F—&V7FÇ’Ò&öf–ÆRæ–çG&õöÆ–7’çG—RÓÓÒ&g&VR"ÇÂ&öf–ÆRæ–çG&õöÆ–7’ç&VG•Fô&öö²ÓÓÒG'VS°¢6öç7BÆöD6ÆVæFÇ’Ò7–æ2‚’Óâ°¢6WE&WVW7E7FFR‚'6VæF–ær"“°¢6öç7B&V6÷&FVBÒv—Böå&V6÷&D–çG&öGV7F–öâ†–çG&öGV7F–öä¶W’æ7W'&VçB“°¢–b‚&V6÷&FVB’°¢6WE&WVW7E7FFR‚&W'&÷""“°¢&WGW&ã°¢Ğ¢6WE&WVW7E7FFR‚'6VçB"“°¢6WD6ÆVæFÇ”ÆöFVB‡G'VR“°¢Ó°¢6öç7B&WVW7D&÷fÂÒ7–æ2‚’Óâ°¢6WE&WVW7E7FFR‚'6VæF–ær"“°¢6öç7B&V6÷&FVBÒv—Böå&V6÷&D–çG&öGV7F–öâ†–çG&öGV7F–öä¶W’æ7W'&VçB“°¢6WE&WVW7E7FFR‡&V6÷&FVBò'6VçB"¢&W'&÷""“°¢Ó°¢&WGW&â€¢ÄÖöFÂF—FÆT–CÒ&6öçF7B×F—FÆR"öä6Æ÷6S×¶öä6Æ÷6WÒ6—¦SÒ&Æ&vR#à¢ÆF—b6Æ74æÖSÒ&6öçF7BÖF–Æör#à¢ÆF—b6Æ74æÖSÒ&6öçF7BÖF–ÆörÖ†VFW"#à¢ÆF—b6Æ74æÖSÒ&6öçF7B×&öf–ÆRÖfF""&–Ö†–FFVãÒ'G'VR#ç¶–æ—F–Ç2‡&öf–ÆRæF—7Æ”æÖR—ÓÂöF—cà¢ÆF—cãÇ7â6Æ74æÖSÒ&F–ÆörÖW–V'&÷r#ç·&öf–ÆRæFVÖõ7FGW2ÓÓÒ&FVÖò"ò$FVÖòÕ&öf–ÂW6vW|:F†ÇB"¢%&öf–ÂW6vW|:F†ÇB'ÓÂ÷7ããÆƒ"–CÒ&6öçF7B×F—FÆR#ç·&öf–ÆRæFVÖõ7FGW2ÓÓÒ&FVÖò"òFVÖòÔ&ÆVbl;Ç"G·&öf–ÆRæF—7Æ”æÖWÖ¢V–æl;Æ‡'Vær§RG·&öf–ÆRæF—7Æ”æÖWÖÓÂöƒ#ãÇç·&öf–ÆRç&öÆWÓÂ÷ãÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&6öçF7BÖÆ–÷WB#à¢ÆF—b6Æ74æÖSÒ&6öçF7BÖ6÷’#à¢ÆF—b6Æ74æÖSÒ'&öÖâÖ6&B#à¢ÆF—b6Æ74æÖSÒ&Æ—fR×&÷r#ãÇ7â6Æ74æÖSÒ&Æ—fRÖF÷B"&–Ö†–FFVãÒ'G'VR"óâÆ—fRW'&V–6†&#ÂöF—cà¢Æƒ3å&öÖâFW&–ær¶ö÷&F–æ–W'BFVâ¶öçF·CÂöƒ3à¢Çç·&öf–ÆRæFVÖõ7FGW2ÓÓÒ&FVÖò"ò$F–W6W2&öf–Â—7B7–çF†WF—66‚âFW"¶öçF·Bl;Æ‡'BW766†Æ–\9öÆ–6‚§R&öÖâFW&–ærÂVÒFVâ&ÆVb§RFVÖöç7G&–W&Vââ"¢&öf–ÆRæ–çG&õöÆ–7’æÖçVÄ&÷fÅ&WV—&VBò%&öÖâ,;ÆgBF–RV–æl;Æ‡'VærW'<;fæÆ–6‚VæB&W7L:GF–wBFVâì:F6‡7FVâ66‡&—GB·W'¦g&—7F–râ"¢%|:F†ÆVâ6–RF—&V·BV–æVâFW&Ö–âöFW"'VfVâ6–Rââ&öÖâ&VvÆV—FWBF–RV–æl;Æ‡'Værâ'ÓÂ÷à¢Æ6Æ74æÖSÒ'†öæRÖ7F–öâ"‡&Vc×¶FVÃ¢G´4ôåD5Eõ„ôäWÖÒöä6Æ–6³×²‚’Óâfö–Böå&V6÷&D–çG&öGV7F–öâ†–çG&öGV7F–öä¶W’æ7W'&VçB—ÓãÇ7â&–Ö†–FFVãÒ'G'VR#î)ˆãÂ÷7ããÇ7ããÇ6ÖÆÃäF—&V·Bç'VfVãÂ÷6ÖÆÃç´4ôåD5Eõ„ôäUôÄ$TÇÓÂ÷7ããÂöà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&6öçF–çVRÖæ÷FR#ãÇ7â&–Ö†–FFVãÒ'G'VR#îûÈ³Â÷7ããÇãÇ7G&öæsäæö6‚WGv2W&|:Fç¦VãóÂ÷7G&öæså66†Æ–\9öVâ6–RF–W6W2fVç7FW"VæB66‡&V–&Vâ6–Rg&V’–Ò6†BvV—FW"âF–RFW&Ö–æ÷F–öâ&ÆV–'B6–6‡F&"ãÂ÷ãÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&6ÆVæF"Ö&V#à¢¶6ä&öö´F—&V7FÇ’bb6ÆVæFÇ”ÆöFVBò€¢Æ–g&ÖR6Æ74æÖSÒ&6ÆVæFÇ’Ög&ÖR"7&3×´4ÄTäDÅ•õU$ÇÒF—FÆSÒ%FW&Ö–âÖ—B&öÖâFW&–ær;Æ&W"6ÆVæFÇ’'V6†Vâ"ÆöF–æsÒ&Æ§’"óà¢’¢6ä&öö´F—&V7FÇ’ò€¢ÆF—b6Æ74æÖSÒ&6ÆVæF"Ö6öç6VçB#à¢ÆF—b6Æ74æÖSÒ&6ÆVæF"×7–Ö&öÂ"&–Ö†–FFVãÒ'G'VR#ãÇ7ãã3Â÷7ããÇ6ÖÆÃä„UUDSÂ÷6ÖÆÃãÂöF—cà¢Æƒ3ã3Ö–çWFVâ&W6W'f–W&VãÂöƒ3à¢Çä6ÆVæFÇ’v—&BW'7Bæ6‚–‡&VÒ¶Æ–6²vVÆFVââF&V’v—&BV–æRfW&&–æGVær§R6ÆVæFÇ’†W&vW7FVÆÇBãÂ÷à¢·&WVW7E7FFRÓÓÒ&W'&÷""òÇ6Æ74æÖSÒ&&÷fÂÖW'&÷""&öÆSÒ&ÆW'B#äF–RW7v†Â¶öæçFRæ–6‡BvW7V–6†W'BvW&FVââ&—GFRfW'7V6†Vâ6–RW2W&æWWBãÂ÷â¢çVÆÇĞ¢Æ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×²‚’Óâfö–BÆöD6ÆVæFÇ’‚—ÒF—6&ÆVC×·&WVW7E7FFRÓÓÒ'6VæF–ær'Óç·&WVW7E7FFRÓÓÒ'6VæF–ær"ò$W7v†Âv—&BvW7V–6†W'B(
b"¢$6ÆVæFÇ’ÆFVâbFW&Ö–â|:F†ÆVâ'ÒÇ7â&–Ö†–FFVãÒ'G'VR#î(i#Â÷7ããÂö'WGFöãà¢Æ‡&Vc×´4ÄTäDÅ•õU$ÇÒF&vWCÒ%ö&Ææ²"&VÃÒ&æ÷&VfW'&W""öä6Æ–6³×²‚’Óâfö–Böå&V6÷&D–çG&öGV7F–öâ†–çG&öGV7F–öä¶W’æ7W'&VçB—ÓäÇFW&æF—b–âæWVVÒF";fffæVãÂöà¢ÂöF—cà¢’¢€¢ÆF—b6Æ74æÖSÒ&6ÆVæF"Ö6öç6VçB&÷fÂÖ6öç6VçB#à¢ÆF—b6Æ74æÖSÒ&&÷fÂ×7–Ö&öÂ"&–Ö†–FFVãÒ'G'VR#î)É3ÂöF—cà¢Æƒ3åW'<;fæÆ–6†Rg&V–v&SÂöƒ3à¢Çäl;Ç"F–W6W2&öf–Â&W7L:GF–wB&öÖâFW&–ær§VW'7BF–RV–æl;Æ‡'VærâV–æRFW&Ö–çv†Âv—&BW'7BFæ6‚g&V–vW66†ÇFWBãÂ÷à¢·&WVW7E7FFRÓÓÒ'6VçB"ò€¢ÆF—b6Æ74æÖSÒ&&÷fÂ×6VçB"&öÆSÒ'7FGW2#ãÇ7â&–Ö†–FFVãÒ'G'VR#î)É3Â÷7ããÆF—cãÇ7G&öæsä¶öçF·Fæg&vR;Æ&W&Ö—GFVÇCÂ÷7G&öæsãÇ6ÖÆÃå&öÖâÖVÆFWB6–6‚·W'¦g&—7F–r§VÒì:F6‡7FVâ66‡&—GBãÂ÷6ÖÆÃãÂöF—cãÂöF—cà¢’¢€¢Ãà¢·&WVW7E7FFRÓÓÒ&W'&÷""òÇ6Æ74æÖSÒ&&÷fÂÖW'&÷""&öÆSÒ&ÆW'B#äF–Ræg&vR¶öæçFRæ–6‡BvW7V–6†W'BvW&FVââfW'7V6†Vâ6–RW2W&æWWBöFW"'VfVâ6–RF—&V·BâãÂ÷â¢çVÆÇĞ¢Æ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×²‚’Óâfö–B&WVW7D&÷fÂ‚—ÒF—6&ÆVC×·&WVW7E7FFRÓÓÒ'6VæF–ær'Óç·&WVW7E7FFRÓÓÒ'6VæF–ær"ò$æg&vRv—&BvW6VæFWB(
b"¢&WVW7E7FFRÓÓÒ&W'&÷""ò$W&æWWB6VæFVâ"¢$¶öçF·Fæg&vRâ&öÖâ6VæFVâ'ÓÂö'WGFöãà¢Âóà¢—Ğ¢Æ‡&Vc×¶FVÃ¢G´4ôåD5Eõ„ôäWÖÒöä6Æ–6³×²‚’Óâfö–Böå&V6÷&D–çG&öGV7F–öâ†–çG&öGV7F–öä¶W’æ7W'&VçB—ÓäöFW"F—&V·Bç'VfVã¢´4ôåD5Eõ„ôäUôÄ$TÇÓÂöà¢ÂöF—cà¢—Ğ¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà¢ÂôÖöFÃà¢“°§Ğ ¦gVæ7F–öâ6öæf—&ÔFVÆWFTF–Æör‡²'W7’Âöä6Æ÷6RÂöä6öæf—&ÒÓ¢²'W7“¢&ööÆVã²öä6Æ÷6S¢‚’Óâfö–C²öä6öæf—&Ó¢‚’Óâfö–BÒ’°¢&WGW&â€¢ÄÖöFÂF—FÆT–CÒ&FVÆWFR×F—FÆR"öä6Æ÷6S×¶öä6Æ÷6WÓà¢ÆF—b6Æ74æÖSÒ&FVÆWFRÖF–Æör#à¢Ç7â6Æ74æÖSÒ&FævW"×7–Ö&öÂ"&–Ö†–FFVãÒ'G'VR#âÂ÷7ãà¢Æƒ"–CÒ&FVÆWFR×F—FÆR#äçvVæGVæw6FFVâÌ;g66†VãóÂöƒ#à¢Çä–‡&R&ö¦V·FRÂæ6‡&–6‡FVâVæBvW7V–6†W'FVâW&vV&æ—76RvW&FVâVçG7&V6†VæBFW"vVÇFVæFVâVf&Wv‡'Væw7&VvVÆâvVÌ;g66‡BöFW"æöç–Ö—6–W'BâF–W6W"66‡&—GB¶æâæ–6‡B,;Æ6¶|:Fæv–rvVÖ6‡BvW&FVâãÂ÷à¢ÆF—b6Æ74æÖSÒ&F–ÆörÖ7F–öç2#à¢Æ'WGFöâ6Æ74æÖSÒ'6V6öæF'’Ö7F–öâ"G—SÒ&'WGFöâ"öä6Æ–6³×¶öä6Æ÷6WÒF—6&ÆVC×¶'W7—Óä&'&V6†VãÂö'WGFöãà¢Æ'WGFöâ6Æ74æÖSÒ&FævW"Ö7F–öâ"G—SÒ&'WGFöâ"öä6Æ–6³×¶öä6öæf—&×ÒF—6&ÆVC×¶'W7—Óç¶'W7’ò%v—&BvVÌ;g66‡B(
b"¢$FFVâVæF|;ÆÇF–rÌ;g66†Vâ'ÓÂö'WGFöãà¢ÂöF—cà¢ÂöF—cà¢ÂôÖöFÃà¢“°§Ğ