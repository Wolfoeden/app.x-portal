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
  claimPreparedGuestWorkspace,
  ensureGuestSession,
  registerEmailAccount,
  requestPasswordRecovery,
  setAccountPassword,
  signInExistingAccount,
  signOut as signOutAccount,
  startOauthUpgrade,
} from "@/lib/auth/browser";
import {
  type AiAnalysisTrace,
  type AiCreditSnapshot,
  type AvailabilityStatus,
  type ChatApiPaths,
  type ChatRequest,
  type ChatResponse,
  type ChatStreamEvent,
  type ConversationMessage,
  type ExternalFreelancerCandidate,
  type ExternalFreelancerSearchResponse,
  type FreelancerProfileResult,
  type ProjectDetailResponse,
  type ProjectListItem,
  type ProjectMode,
  type SessionResponse,
  type StructuredBrief,
  type VerificationLevel,
  defaultChatApiPaths,
} from "./chat-contract";

const CONTACT_PHONE = process.env.NEXT_PUBLIC_CONTACT_PHONE ?? "+491758934338";
const CONTACT_PHONE_LABEL = "+49 175 8934338";
const GOOGLE_AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true";
const MICROSOFT_AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED === "true";

const suggestions = [
  {
    label: "React-Entwicklung",
    description: "Freelancer f√ºr ein Webprojekt finden",
    draftPrefix: "React-Entwicklung\n\nProjektbeschreibung:\n",
    intro:
      "React-Entwicklung ist ausgew√§hlt. F√ºgen Sie jetzt einfach Ihre vorhandene Projektbeschreibung ein ‚Äì auch als langen Copy-and-paste-Text. Ich strukturiere Aufgaben, ben√∂tigte Kompetenzen, Rahmenbedingungen und offene Angaben und gleiche sie anschlie√üend mit verf√ºgbaren Profilen ab.",
  },
  {
    label: "Anforderungsmanagement",
    description: "Anforderungen strukturieren und begleiten",
    draftPrefix: "Anforderungsmanagement\n\nProjektbeschreibung:\n",
    intro:
      "Anforderungsmanagement ist ausgew√§hlt. F√ºgen Sie jetzt Ihre Projektbeschreibung, Ihr Lastenheft oder vorhandene Notizen ein. Ich fasse Ziel, Aufgaben, Pflichtkompetenzen, Rahmenbedingungen und offene Punkte zusammen und suche danach passende verf√ºgbare Profile.",
  },
  {
    label: "Prozessmanagement",
    description: "Abl√§ufe analysieren und verbessern",
    draftPrefix: "Prozessmanagement\n\nProjektbeschreibung:\n",
    intro:
      "Prozessmanagement ist ausgew√§hlt. Kopieren Sie Ihre Ausgangslage oder Projektbeschreibung in das Eingabefeld. Ich strukturiere Prozessziel, Aufgaben, ben√∂tigte Erfahrung, zeitliche Vorgaben und weitere Einschr√§nkungen und starte dann den Profilabgleich.",
  },
  {
    label: "Informationssicherheit",
    description: "Expertise f√ºr sichere Organisationen",
    draftPrefix: "Informationssicherheit\n\nProjektbeschreibung:\n",
    intro:
      "Informationssicherheit ist ausgew√§hlt. F√ºgen Sie Ihre Projektbeschreibung oder Anforderungsliste direkt ein. Ich erfasse Thema, ben√∂tigte Qualifikationen, Standards, Einsatzrahmen und offene Angaben, ohne fehlende Fakten zu erfinden, und gleiche das Ergebnis anschlie√üend mit verf√ºgbaren Profilen ab.",
  },
] as const;

type Suggestion = (typeof suggestions)[number];

type AuthView = SessionResponse;
type AuthDialogMode = "login" | "register" | "recover" | "set-password";

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
  admin: false,
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

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeCreditSnapshot(value: unknown): AiCreditSnapshot | null {
  const wrapper = isRecord(value) && isRecord(value.data) ? value.data : value;
  if (!isRecord(wrapper)) return null;
  const source = isRecord(wrapper.credits)
    ? wrapper.credits
    : isRecord(wrapper.creditSnapshot)
      ? wrapper.creditSnapshot
      : isRecord(wrapper.credit_snapshot)
        ? wrapper.credit_snapshot
        : wrapper;
  const total = nonNegativeNumber(source.total ?? source.creditsTotal ?? source.credits_total);
  const used = nonNegativeNumber(source.used ?? source.creditsUsed ?? source.credits_used);
  const remaining = nonNegativeNumber(
    source.remaining ?? source.creditsRemaining ?? source.credits_remaining,
  );
  if (total === null || used === null || remaining === null) return null;
  const reserved = nonNegativeNumber(
    source.reserved ?? source.creditsReserved ?? source.credits_reserved,
  );

  return {
    total,
    used,
    remaining,
    ...(reserved === null ? {} : { reserved }),
    ...(typeof source.low === "boolean" ? { low: source.low } : {}),
    ...(typeof source.exhausted === "boolean" ? { exhausted: source.exhausted } : {}),
  };
}

function secureBookingUrl(value: unknown): string | null {
  const candidate = nullableString(value);
  if (!candidate) return null;
  try {
    return new URL(candidate).protocol === "https:" ? candidate : null;
  } catch {
    return null;
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function normalizeAnalysisTrace(value: unknown): AiAnalysisTrace | undefined {
  if (!isRecord(value)) return undefined;
  const provider = isRecord(value.provider) ? value.provider : {};
  if (
    typeof provider.configured !== "boolean" ||
    typeof provider.attempted !== "boolean" ||
    typeof provider.succeeded !== "boolean" ||
    typeof provider.fallback !== "boolean"
  ) {
    return undefined;
  }
  const requestedTransport =
    provider.requestedTransport === "direct_openai" ||
    provider.requestedTransport === "netlify_ai_gateway" ||
    provider.requestedTransport === "custom_gateway" ||
    provider.requestedTransport === "unconfigured"
      ? provider.requestedTransport
      : "unconfigured";
  const succeeded = provider.attempted && provider.succeeded;
  const actualTransport =
    succeeded &&
    (provider.actualTransport === "direct_openai" ||
      provider.actualTransport === "netlify_ai_gateway" ||
      provider.actualTransport === "custom_gateway")
      ? provider.actualTransport
      : null;
  const steps = Array.isArray(value.steps)
    ? value.steps.flatMap((step) => {
        if (!isRecord(step)) return [];
        const label = nullableString(step.label);
        const detail = nullableString(step.detail);
        if (!label || !detail) return [];
        return [{
          label,
          detail,
          status: step.status === "warning" ? "warning" as const : "completed" as const,
        }];
      })
    : [];
  return {
    provider: {
      configured: provider.configured,
      attempted: provider.attempted,
      succeeded,
      fallback: provider.fallback,
      requestedTransport,
      actualTransport,
      requestedModel: nullableString(provider.requestedModel),
      actualModel: succeeded ? nullableString(provider.actualModel) : null,
    },
    steps,
    externalSearchAvailable: value.externalSearchAvailable === true,
  };
}

function normalizeExternalCandidate(value: unknown): ExternalFreelancerCandidate | null {
  if (!isRecord(value)) return null;
  const displayName = nullableString(value.displayName);
  const role = nullableString(value.role);
  const summary = nullableString(value.summary);
  const profileUrl = secureBookingUrl(value.profileUrl);
  const bookingUrl = secureBookingUrl(value.bookingUrl);
  if (!displayName || !role || !summary || !profileUrl || !bookingUrl) return null;
  const sourceUrls = stringList(value.sourceUrls)
    .map(secureBookingUrl)
    .filter((url): url is string => Boolean(url));
  return {
    displayName,
    role,
    summary,
    profileUrl,
    bookingUrl,
    sourceUrls,
    matchedRequirements: stringList(value.matchedRequirements),
    knownGaps: stringList(value.knownGaps),
    verificationStatus: "external_unverified",
  };
}

function normalizeExternalSearchResponse(value: unknown): ExternalFreelancerSearchResponse {
  const response = isRecord(value) && isRecord(value.data) ? value.data : value;
  if (!isRecord(response)) throw new Error("Die Websuche hatte kein g√ºltiges Format.");
  const trace = isRecord(response.searchTrace) ? response.searchTrace : {};
  const candidates = Array.isArray(response.candidates)
    ? response.candidates
        .map(normalizeExternalCandidate)
        .filter((candidate): candidate is ExternalFreelancerCandidate => candidate !== null)
        .slice(0, 3)
    : [];
  const credits = normalizeCreditSnapshot(response.credits);
  return {
    projectId: stringValue(response.projectId),
    candidates,
    disclosure: stringValue(
      response.disclosure,
      "Externe Treffer stammen aus √∂ffentlich zug√§nglichen Quellen und sind nicht durch XPORTAL verifiziert.",
    ),
    mode: response.mode === "openai" ? "openai" : "unavailable",
    notice: nullableString(response.notice) ?? undefined,
    searchTrace: {
      queries: stringList(trace.queries),
      consultedSourceCount: nonNegativeNumber(trace.consultedSourceCount) ?? 0,
      returnedCandidateCount: nonNegativeNumber(trace.returnedCandidateCount) ?? candidates.length,
    },
    ...(credits ? { credits } : {}),
  };
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
  const demoStatus =
    profileSource.demoStatus === "real" || profileSource.demo_status === "real"
      ? "real"
      : "demo";
  const bookingUrl = secureBookingUrl(
    profileSource.bookingUrl ??
      profileSource.booking_url ??
      introSource.bookingUrl ??
      introSource.booking_url,
  );
  if (demoStatus !== "real") return null;

  return {
    id,
    demoStatus,
    bookingUrl,
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
        introType === "premium" ? "Pers√∂nliche Freigabe" : "Kostenfreie Einf√ºhrung",
      ),
      manualApprovalRequired:
        typeof introSource.manualApprovalRequired ===€~vÓ⁄$z{-ÆÈ‹j◊ù&ñÊs¬ˆÉ3‡–¢«ÂW'<;fÊ∆ñ6ÜW"Á7&V6á'FÊW"l;«"&ˆfñ∆g&vV‚VÊBFñRVñÊl;∆á'VÊr„¬˜‡–¢∆á&Vc◊∂FV√¢G¥4ÙÂD5EıÑÙ‰W÷”Á¥4ÙÂD5EıÑÙ‰UÙƒ$T«”¬ˆ‡–¢¬ˆFóc‡–†–¢∆Fób6∆74Ê÷S“&í÷Ê˜FR#„«7‚&ñ÷ÜñFFV„“'G'VR#Êì¬˜7„„«„«7G&ˆÊsÂG&Á7&VÁFRVÁFW'7L;«GßVÊs¬˜7G&ˆÊs‰FñR¥í7G'V∑GW&ñW'Bñá&RÊg&vR‚&ˆfñ∆RvW&FV‚Ê6ÇfW7FV‚¬;∆&W',;∆f&&V‚&VvV∆‚vVfñ«FW'B„¬˜„¬ˆFóc‡–¢¬ˆFóc‡–¢ì∞–ß––†–¶gVÊ7Fñˆ‚÷ˆF¬á≤FóF∆TñB¬ˆ‰6∆˜6R¬6Üñ∆G&V‚¬6ó¶R“&FVfV«B"”¢≤FóF∆TñC¢7G&ñÊs≤ˆ‰6∆˜6S¢Çí”‚fˆñC≤6Üñ∆G&V„¢&V7DÊˆFS≤6ó¶SÛ¢&FVfV«B"¬&∆&vR"“í∞–¢6ˆÁ7B6∆˜6U&Vb“W6U&VcƒÖD‘ƒ'WGFˆ‰V∆V÷VÁC‚ÜÁV∆¬ì∞–¢6ˆÁ7B6&E&Vb“W6U&VcƒÖD‘ƒV∆V÷VÁC‚ÜÁV∆¬ì∞–¢W6TVffV7BÇÇí”‚∞–¢6ˆÁ7B&Wfñ˜W6«îfˆ7W6VB“Fˆ7V÷VÁBÊ7FófTV∆V÷VÁBñÁ7FÊ6VˆbÖD‘ƒV∆V÷VÁBÚFˆ7V÷VÁBÊ7FófTV∆V÷VÁB¢ÁV∆√∞–¢6∆˜6U&VbÊ7W'&VÁCÚÊfˆ7W2Çì∞–¢6ˆÁ7Bˆ‰∂Wí“ÜWfVÁC¢v∆ˆ&≈FÜó2‰∂Wñ&ˆ&DWfVÁBí”‚∞–¢ñbÜWfVÁBÊ∂Wí””“$W66R"íˆ‰6∆˜6RÇì∞–¢ñbÜWfVÁBÊ∂Wí””“%F""bb6&E&VbÊ7W'&VÁBí∞–¢6ˆÁ7Bfˆ7W6&∆R“'&íÊg&ˆ“Ä–¢6&E&VbÊ7W'&VÁBÁVW'ï6V∆V7F˜$∆√ƒÖD‘ƒV∆V÷VÁC‚Ä–¢v'WGFˆ„¶Ê˜BÖ∂Fó6&∆VE“í¬∂á&Ve“¬ñÁWC¶Ê˜BÖ∂Fó6&∆VE“í¬FWáF&V¶Ê˜BÖ∂Fó6&∆VE“í¬∑F&ñÊFWÖ”¶Ê˜BÖ∑F&ñÊFWÉ“"”%“ír¿–¢í¿–¢ì∞–¢6ˆÁ7Bfó'7B“fˆ7W6&∆U≥”∞–¢6ˆÁ7B∆7B“fˆ7W6&∆RÊBÇ”ì∞–¢ñbÇfó'7B«¬∆7Bí&WGW&„∞–¢ñbÜWfVÁBÁ6ÜñgD∂WíbbFˆ7V÷VÁBÊ7FófTV∆V÷VÁB””“fó'7Bí∞–¢WfVÁBÁ&WfVÁDFVfV«BÇì∞–¢∆7BÊfˆ7W2Çì∞–¢“V«6RñbÇWfVÁBÁ6ÜñgD∂WíbbFˆ7V÷VÁBÊ7FófTV∆V÷VÁB””“∆7Bí∞–¢WfVÁBÁ&WfVÁDFVfV«BÇì∞–¢fó'7BÊfˆ7W2Çì∞–¢––¢––¢”∞–¢Fˆ7V÷VÁBÊFDWfVÁD∆ó7FVÊW"Ç&∂WñF˜v‚"¬ˆ‰∂Wíì∞–¢&WGW&‚Çí”‚∞–¢Fˆ7V÷VÁBÁ&V÷˜fTWfVÁD∆ó7FVÊW"Ç&∂WñF˜v‚"¬ˆ‰∂Wíì∞–¢&Wfñ˜W6«îfˆ7W6VCÚÊfˆ7W2Çì∞–¢”∞–¢“¬∂ˆ‰6∆˜6U“ì∞–¢&WGW&‚Ä–¢∆Fób6∆74Ê÷S“&÷ˆF¬÷&6∂G&˜"&ˆ∆S“'&W6VÁFFñˆ‚"ˆ‰÷˜W6TF˜v„◊≤ÜWfVÁBí”‚≤ñbÜWfVÁBÁF&vWB””“WfVÁBÊ7W'&VÁEF&vWBíˆ‰6∆˜6RÇì≤◊”‡–¢«6V7Fñˆ‚&Vc◊∂6&E&Vg“6∆74Ê÷S◊∂÷ˆF¬÷6&BG∑6ó¶R””“&∆&vR"Ú&ó2÷∆&vR"¢"'÷“&ˆ∆S“&Fñ∆ˆr"&ñ÷÷ˆF√“'G'VR"&ñ÷∆&V∆∆VF'ì◊∑FóF∆TñG”‡–¢∆'WGFˆ‚&Vc◊∂6∆˜6U&Vg“6∆74Ê÷S“&÷ˆF¬÷6∆˜6R"GóS“&'WGFˆ‚"ˆ‰6∆ñ6≥◊∂ˆ‰6∆˜6W“&ñ÷∆&V√“$Fñ∆ˆr66Ü∆ñ\9ˆV‚#Ï9s¬ˆ'WGFˆ„‡–¢∂6Üñ∆G&VÁ––¢¬˜6V7Fñˆ„‡–¢¬ˆFóc‡–¢ì∞–ß––†–¶gVÊ7Fñˆ‚WFÑFñ∆ˆrá∞–¢ñÊóFñƒ÷ˆFR¿–¢ˆ‰6∆˜6R¿–¢ˆ‰WFÜVÁFñ6FVB¿–¢6Ü˜uFˆ7B¿–ß”¢∞¢ñÊóFñƒ÷ˆFS¢WFÑFñ∆ˆt÷ˆFS∞¢ˆ‰6∆˜6S¢Çí”‚fˆñC∞–¢ˆ‰WFÜVÁFñ6FVC¢Çí”‚fˆñC∞–¢6Ü˜uFˆ7C¢Ü÷W76vS¢7G&ñÊr¬FˆÊSÛ¢Fˆ7E7FFU≤'FˆÊR%“í”‚fˆñC∞–ß“í∞–¢6ˆÁ7B∂÷ˆFR¬6WD÷ˆFU““W6U7FFRÜñÊóFñƒ÷ˆFRì∞–¢6ˆÁ7B∂V÷ñ¬¬6WDV÷ñ≈““W6U7FFRÇ""ì∞–¢6ˆÁ7B∑77v˜&B¬6WE77v˜&E““W6U7FFRÇ""ì∞–¢6ˆÁ7B∑77v˜&E&WVB¬6WE77v˜&E&WVE““W6U7FFRÇ""ì∞–¢6ˆÁ7B∂6ˆÊfó&÷FñˆÂ6VÁB¬6WD6ˆÊfó&÷FñˆÂ6VÁE““W6U7FFRÜf«6Rì∞–¢6ˆÁ7B∂'W7í¬6WD'W7ï““W6U7FFS¬&vˆˆv∆R"¬&÷ñ7&˜6ˆgB"¬&V÷ñ¬"¬ÁV∆√‚ÜÁV∆¬ì∞–¢6ˆÁ7B∂W'&˜"¬6WDW'&˜%““W6U7FFS«7G&ñÊr¬ÁV∆√‚ÜÁV∆¬ì∞–†–¢6ˆÁ7B6ˆÊÊV7E&˜fñFW"“7ñÊ2á&˜fñFW#¢&vˆˆv∆R"¬&÷ñ7&˜6ˆgB"í”‚∞–¢6WD'W7íá&˜fñFW"ì∞–¢6WDW'&˜"ÜÁV∆¬ì∞–¢G'í∞–¢vóB7F'DˆWFÖWw&FRá&˜fñFW"ì∞–¢“6F6Çá&˜fñFW$W'&˜"í∞–¢6WDW'&˜"á&˜fñFW$W'&˜"ñÁ7FÊ6VˆbW'&˜"Ú&˜fñFW$W'&˜"Ê÷W76vR¢$Ê÷V∆GVÊr∂ˆÊÁFRÊñ6áBvW7F'FWBvW&FV‚‚"ì∞–¢6WD'W7íÜÁV∆¬ì∞–¢––¢”∞–†–¢6ˆÁ7B7V&÷óDV÷ñ¬“7ñÊ2ÜWfVÁC¢f˜&‘WfVÁCƒÖD‘ƒf˜&‘V∆V÷VÁC‚í”‚∞¢WfVÁBÁ&WfVÁDFVfV«BÇì∞¢6WD'W7íÇ&V÷ñ¬"ì∞¢6WDW'&˜"ÜÁV∆¬ì∞¢ñbÇÜ÷ˆFR””“'&Vvó7FW""«¬÷ˆFR””“'6WB◊77v˜&B"íbb77v˜&B”“77v˜&E&WVBí∞¢6WDW'&˜"Ç$FñR&VñFV‚77|;g'FW"7Fñ÷÷V‚Êñ6áB;∆&W&Vñ‚‚"ì∞¢6WD'W7íÜÁV∆¬ì∞¢&WGW&„∞¢––¢G'í∞–¢ñbÜ÷ˆFR””“&∆ˆvñ‚"í∞–¢vóB6ñv‰ñ‰WÜó7FñÊt66˜VÁBÜV÷ñ¬¬77v˜&Bì∞–¢6Ü˜uFˆ7BÇ$Ê÷V∆GVÊrW&fˆ∆w&Vñ6Ç‚ñá&RW7vÜ¬vó&Bf˜'FvW6WGßB‚"ì∞¢ˆ‰WFÜVÁFñ6FVBÇì∞¢“V«6RñbÜ÷ˆFR””“'&Vvó7FW""í∞¢6ˆÁ7B&W7V«B“vóB&Vvó7FW$V÷ñƒ66˜VÁBÜV÷ñ¬¬77v˜&Bì∞¢ñbá&W7V«BÊ6ˆÊfó&÷FñˆÂ&WVó&VBí∞¢6WD6ˆÊfó&÷FñˆÂ6VÁBáG'VRì∞¢6WD'W7íÜÁV∆¬ì∞¢“V«6R∞¢6Ü˜uFˆ7BÇ$∂ˆÁFÚW'7FV∆«B‚ñá&RW7vÜ¬vó&Bf˜'FvW6WGßB‚"ì∞¢ˆ‰WFÜVÁFñ6FVBÇì∞¢–¢“V«6RñbÜ÷ˆFR””“'&V6˜fW""í∞¢vóB&WVW7E77v˜&E&V6˜fW'íÜV÷ñ¬ì∞¢6WD6ˆÊfó&÷FñˆÂ6VÁBáG'VRì∞¢6WD'W7íÜÁV∆¬ì∞¢“V«6R∞¢vóB6WD66˜VÁE77v˜&Bá77v˜&Bì∞¢6ˆÁ7B6∆VÂW&¬“G∑vñÊF˜rÊ∆ˆ6Fñˆ‚ÁFÜÊ÷W“G∑vñÊF˜rÊ∆ˆ6Fñˆ‚ÊÜ6á÷∞¢vñÊF˜rÊÜó7F˜'íÁ&W∆6U7FFRá∑“¬""¬6∆VÂW&¬ì∞–¢6Ü˜uFˆ7BÇ$ñá"∂ˆÁFÚó7BVñÊvW&ñ6áFWB‚ñá&RW7vÜ¬vó&Bf˜'FvW6WGßB‚"ì∞–¢ˆ‰WFÜVÁFñ6FVBÇì∞–¢––¢“6F6ÇÜV÷ñƒW'&˜"í∞¢6ˆÁ7Bf∆∆&6≤“÷ˆFR””“&∆ˆvñ‚ ¢Ú$R‘÷ñ¬ˆFW"77v˜'Bó7BÊñ6áB∂˜'&V∑B‚ÁWG¶V‚6ñR&Ví&VF&b(	•77v˜'BfW&vW76V„˛(	Ç‚ ¢¢÷ˆFR””“'&V6˜fW" ¢Ú$FW"vñVFW&ÜW'7FV∆«VÊw6∆ñÊ≤∂ˆÊÁFRvW&FRÊñ6áBfW'6VÊFWBvW&FV‚‚ ¢¢÷ˆFR””“'&Vvó7FW" ¢Ú$F2∂ˆÁFÚ∂ˆÊÁFRvW&FRÊñ6áBW'7FV∆«BvW&FV‚‚,;∆fV‚6ñRR‘÷ñ¬VÊB77v˜'B‚ ¢¢$F2ÊWVR77v˜'B∂ˆÊÁFRvW&FRÊñ6áBvW7Vñ6ÜW'BvW&FV‚‚#∞¢6ˆÁ7B÷W76vR“V÷ñƒW'&˜"ñÁ7FÊ6VˆbW'&˜"ÚV÷ñƒW'&˜"Ê÷W76vRÁFÙ∆˜vW$66RÇí¢"#∞¢6WDW'&˜"Ä¢÷ˆFR””“&∆ˆvñ‚"bbÜ÷W76vRÊñÊ6«VFW2Ç&ñÁf∆ñB∆ˆvñ‚"í«¬÷W76vRÊñÊ6«VFW2Ç&ñÁf∆ñB7&VFVÁFñ«2"íê¢Ú$R‘÷ñ¬ˆFW"77v˜'Bó7BÊñ6áB∂˜'&V∑B‚ÁWG¶V‚6ñR&Ví&VF&b(	•77v˜'BfW&vW76V„˛(	Ç‚ ¢¢f∆∆&6≤¿¢ì∞¢6WD'W7íÜÁV∆¬ì∞¢––¢”∞–†–¢&WGW&‚Ä–¢ƒ÷ˆF¬FóF∆TñC“&WFÇ◊FóF∆R"ˆ‰6∆˜6S◊∂ˆ‰6∆˜6W”‡–¢∆Fób6∆74Ê÷S“&WFÇ÷Fñ∆ˆr#‡–¢«7‚6∆74Ê÷S“&Fñ∆ˆr÷WñV'&˜r#‰W7vÜ¬6ñ6ÜW&„¬˜7„‡¢∆É"ñC“&WFÇ◊FóF∆R#‡¢∂÷ˆFR””“'6WB◊77v˜&B ¢Ú$ÊWVW277v˜'BfW7F∆VvV‚ ¢¢÷ˆFR””“'&V6˜fW" ¢Ú%ßVvÊrvñVFW&ÜW'7FV∆∆V‚ ¢¢÷ˆFR””“'&Vvó7FW" ¢Ú$∂ˆÁFÚW'7FV∆∆V‚ ¢¢$Ê÷V∆FV‚VÊBFó&V∑Bf˜'Ffá&V‚'–¢¬ˆÉ#‡¢«‡¢∂÷ˆFR””“'6WB◊77v˜&B ¢Ú$∆VvV‚6ñR¶WGßBVñ‚ÊWVW277v˜'Bl;«"ñá"&W7L:GFñwFW2∂ˆÁFÚfW7B‚ ¢¢÷ˆFR””“'&V6˜fW" ¢Ú%vó"6VÊFV‚VñÊV‚6ñ6ÜW&V‚∆ñÊ≤‚ñá&RR‘÷ñ¬‘G&W76R‚ñá&R∑GVV∆∆RÊg&vR&∆Vñ'BF&VíW&Ü«FV‚‚ ¢¢$ñá&RÊg&vR&∆Vñ'BW&Ü«FV‚‚Ê6ÇFW"Ê÷V∆GVÊr∂Vá&V‚6ñRvVÊRßRñá&V“W6vW|:FÜ«FV‚&ˆfñ¬ßW,;∆6≤‚'–¢¬˜‡†¢∂÷ˆFR”“'6WB◊77v˜&B"bb÷ˆFR”“'&V6˜fW""ÚÄ¢√‡¢¥tÙÙtƒUÙUDÖÙT‰$ƒTB«¬‘î5$ı4ÙeEÙUDÖÙT‰$ƒTBÚÄ¢√‡¢∆Fób6∆74Ê÷S“'&˜fñFW"÷'WGFˆÁ2#‡¢¥tÙÙtƒUÙUDÖÙT‰$ƒTBÚÄ¢∆'WGFˆ‚GóS“&'WGFˆ‚"ˆ‰6∆ñ6≥◊≤Çí”‚fˆñB6ˆÊÊV7E&˜fñFW"Ç&vˆˆv∆R"ó“Fó6&∆VC◊¥&ˆˆ∆V‚Ü'W7íó”„«7‚6∆74Ê÷S“'&˜fñFW"÷∆WGFW""&ñ÷ÜñFFV„“'G'VR#‰s¬˜7„Á∂'W7í””“&vˆˆv∆R"Ú$vˆˆv∆Rvó&Bv\;fffÊWB(
b"¢$÷óBvˆˆv∆Rf˜'Ffá&V‚'”¬ˆ'WGFˆ„‡¢í¢ÁV∆«–¢¥‘î5$ı4ÙeEÙUDÖÙT‰$ƒTBÚÄ¢∆'WGFˆ‚GóS“&'WGFˆ‚"ˆ‰6∆ñ6≥◊≤Çí”‚fˆñB6ˆÊÊV7E&˜fñFW"Ç&÷ñ7&˜6ˆgB"ó“Fó6&∆VC◊¥&ˆˆ∆V‚Ü'W7íó”„«7‚6∆74Ê÷S“'&˜fñFW"÷∆WGFW"÷ñ7&˜6ˆgB"&ñ÷ÜñFFV„“'G'VR#‰”¬˜7„Á∂'W7í””“&÷ñ7&˜6ˆgB"Ú$÷ñ7&˜6ˆgBvó&Bv\;fffÊWB(
b"¢$÷óB÷ñ7&˜6ˆgBf˜'Ffá&V‚'”¬ˆ'WGFˆ„‡¢í¢ÁV∆«–¢¬ˆFóc‡¢∆Fób6∆74Ê÷S“&˜"÷FófñFW"#„«7„ÊˆFW#¬˜7„„¬ˆFóc‡¢¬Û‡¢í¢ÁV∆«–¢∆Fób6∆74Ê÷S“&WFÇ÷÷ˆFR◊F'2"&ˆ∆S“'F&∆ó7B"&ñ÷∆&V√“$R‘÷ñ¬’ßVvÊr#‡¢∆'WGFˆ‚GóS“&'WGFˆ‚"&ˆ∆S“'F""&ñ◊6V∆V7FVC◊∂÷ˆFR””“&∆ˆvñ‚'“6∆74Ê÷S◊∂÷ˆFR””“&∆ˆvñ‚"Ú&7FófR"¢"'“ˆ‰6∆ñ6≥◊≤Çí”‚≤6WD÷ˆFRÇ&∆ˆvñ‚"ì≤6WDW'&˜"ÜÁV∆¬ì≤◊”‰&W7FVÜVÊFW2∂ˆÁFÛ¬ˆ'WGFˆ„‡¢∆'WGFˆ‚GóS“&'WGFˆ‚"&ˆ∆S“'F""&ñ◊6V∆V7FVC◊∂÷ˆFR””“'&Vvó7FW"'“6∆74Ê÷S◊∂÷ˆFR””“'&Vvó7FW""Ú&7FófR"¢"'“ˆ‰6∆ñ6≥◊≤Çí”‚≤6WD÷ˆFRÇ'&Vvó7FW""ì≤6WDW'&˜"ÜÁV∆¬ì≤◊”‰ÊWVW2∂ˆÁFÛ¬ˆ'WGFˆ„‡–¢¬ˆFóc‡–¢¬Û‡–¢í¢ÁV∆«––†–¢∂6ˆÊfó&÷FñˆÂ6VÁBÚÄ–¢∆Fób6∆74Ê÷S“&6ˆÊfó&÷Fñˆ‚◊7FFR"&ˆ∆S“'7FGW2#‡–¢«7‚&ñ÷ÜñFFV„“'G'VR#Ó)…3¬˜7„‡¢∆É3Á∂÷ˆFR””“'&V6˜fW""Ú%vñVFW&ÜW'7FV∆«VÊw6∆ñÊ≤fW'6VÊFWB"¢$&W7L:GFñwVÊw6∆ñÊ≤fW'6VÊFWB'”¬ˆÉ3‡¢«‡¢∂÷ˆFR””“'&V6˜fW""ÚÄ¢√Ï9fffÊV‚6ñRFV‚∆ñÊ≤ñ‚FW"R‘÷ñ¬‚«7G&ˆÊsÁ∂V÷ñ«”¬˜7G&ˆÊs‚VÊB∆VvV‚6ñRÁ66Ü∆ñ\9ˆVÊBVñ‚ÊWVW277v˜'BfW7B„¬Û‡¢í¢Ä¢√Ï9fffÊV‚6ñRFV‚∆ñÊ≤ñ‚FW"R‘÷ñ¬‚«7G&ˆÊsÁ∂V÷ñ«”¬˜7G&ˆÊs‚¬V“ñá"∂ˆÁFÚ÷óBFV“vW|:FÜ«FV‚77v˜'BßR∑FófñW&V‚„¬Û‡¢ó–¢¬˜‡¢∆'WGFˆ‚GóS“&'WGFˆ‚"ˆ‰6∆ñ6≥◊∂ˆ‰6∆˜6W”ÂfW'7FÊFV„¬ˆ'WGFˆ„‡¢¬ˆFóc‡–¢í¢Ä–¢∆f˜&“6∆74Ê÷S“&V÷ñ¬÷∆ˆvñ‚"ˆÂ7V&÷óC◊∑7V&÷óDV÷ñ«”‡–¢∂÷ˆFR”“'6WB◊77v˜&B"ÚÄ–¢√‡–¢∆∆&V¬áF÷ƒf˜#“&∆ˆvñ‚÷V÷ñ¬#‰R‘÷ñ¬‘G&W76S¬ˆ∆&V√‡–¢∆ñÁWBñC“&∆ˆvñ‚÷V÷ñ¬"GóS“&V÷ñ¬"f«VS◊∂V÷ñ«“ˆ‰6ÜÊvS◊≤ÜWfVÁBí”‚6WDV÷ñ¬ÜWfVÁBÁF&vWBÁf«VRó“WFÙ6ˆ◊∆WFS“&V÷ñ¬"&WVó&VBÛ‡–¢¬Û‡–¢í¢ÁV∆«––¢∂÷ˆFR””“&∆ˆvñ‚"«¬÷ˆFR””“'&Vvó7FW""«¬÷ˆFR””“'6WB◊77v˜&B"ÚÄ¢√‡¢∆∆&V¬áF÷ƒf˜#“&∆ˆvñ‚◊77v˜&B#Á∂÷ˆFR””“'6WB◊77v˜&B"Ú$ÊWVW277v˜'B"¢%77v˜'B'”¬ˆ∆&V√‡¢∆ñÁWBñC“&∆ˆvñ‚◊77v˜&B"GóS“'77v˜&B"f«VS◊∑77v˜&G“ˆ‰6ÜÊvS◊≤ÜWfVÁBí”‚6WE77v˜&BÜWfVÁBÁF&vWBÁf«VRó“WFÙ6ˆ◊∆WFS◊∂÷ˆFR””“&∆ˆvñ‚"Ú&7W'&VÁB◊77v˜&B"¢&ÊWr◊77v˜&B'“÷ñ‰∆VÊwFÉ◊≥á“&WVó&VBÛ‡¢¬Û‡¢í¢ÁV∆«–¢∂÷ˆFR””“'&Vvó7FW""«¬÷ˆFR””“'6WB◊77v˜&B"ÚÄ¢√‡¢∆∆&V¬áF÷ƒf˜#“&∆ˆvñ‚◊77v˜&B◊&WVB#Â77v˜'BvñVFW&Üˆ∆V„¬ˆ∆&V√‡¢∆ñÁWBñC“&∆ˆvñ‚◊77v˜&B◊&WVB"GóS“'77v˜&B"f«VS◊∑77v˜&E&WVG“ˆ‰6ÜÊvS◊≤ÜWfVÁBí”‚6WE77v˜&E&WVBÜWfVÁBÁF&vWBÁf«VRó“WFÙ6ˆ◊∆WFS“&ÊWr◊77v˜&B"÷ñ‰∆VÊwFÉ◊≥á“&WVó&VBÛ‡¢¬Û‡¢í¢ÁV∆«–¢∂÷ˆFR””“&∆ˆvñ‚"ÚÄ¢∆'WGFˆ‚6∆74Ê÷S“&f˜&v˜B◊77v˜&B"GóS“&'WGFˆ‚"ˆ‰6∆ñ6≥◊≤Çí”‚≤6WD÷ˆFRÇ'&V6˜fW""ì≤6WDW'&˜"ÜÁV∆¬ì≤6WE77v˜&BÇ""ì≤◊”‡¢77v˜'BfW&vW76V„¢¬ˆ'WGFˆ„‡¢í¢ÁV∆«–¢∂÷ˆFR””“'&V6˜fW""ÚÄ¢∆'WGFˆ‚6∆74Ê÷S“&&6≤◊FÚ÷∆ˆvñ‚"GóS“&'WGFˆ‚"ˆ‰6∆ñ6≥◊≤Çí”‚≤6WD÷ˆFRÇ&∆ˆvñ‚"ì≤6WDW'&˜"ÜÁV∆¬ì≤◊”‡¢ßW,;∆6≤ßW"Ê÷V∆GVÊp¢¬ˆ'WGFˆ„‡¢í¢ÁV∆«–¢∂W'&˜"Ú«6∆74Ê÷S“&f˜&“÷W'&˜""&ˆ∆S“&∆W'B#Á∂W'&˜'”¬˜‚¢ÁV∆«––¢∆'WGFˆ‚6∆74Ê÷S“&WFÇ◊7V&÷óB"GóS“'7V&÷óB"Fó6&∆VC◊¥&ˆˆ∆V‚Ü'W7íó”‡–¢∂'W7í””“&V÷ñ¬ –¢Ú$&óGFRv'FV‚(
b –¢¢÷ˆFR””“&∆ˆvñ‚ –¢Ú$÷óBR‘÷ñ¬Ê÷V∆FV‚ ¢¢÷ˆFR””“'&Vvó7FW" ¢Ú$∂ˆÁFÚW'7FV∆∆V‚ ¢¢÷ˆFR””“'&V6˜fW" ¢Ú%vñVFW&ÜW'7FV∆«VÊw6∆ñÊ≤6VÊFV‚ ¢¢%77v˜'B7Vñ6ÜW&‚bf˜'Ffá&V‚'–¢¬ˆ'WGFˆ„‡–¢¬ˆf˜&”‡–¢ó––¢«6∆74Ê÷S“&WFÇ◊&óf7í#‰FñRÊ÷V∆GVÊrFñVÁBFßR¬&ˆ¶V∑FRvW,:GF\;∆&W&w&VñfVÊBßWßV˜&FÊV‚VÊBVñÊR&ˆfñ«vÜ¬6ñ6ÜW"f˜'GßW6WG¶V‚„¬˜‡–¢¬ˆFóc‡–¢¬Ù÷ˆF√‡–¢ì∞–ß––†–¶gVÊ7Fñˆ‚6ˆÁF7DFñ∆ˆrá≤&ˆfñ∆R¬ˆ‰6∆˜6R”¢≤&ˆfñ∆S¢g&VV∆Ê6W%&ˆfñ∆U&W7V«C≤ˆ‰6∆˜6S¢Çí”‚fˆñB“í∞¢&WGW&‚Ä¢ƒ÷ˆF¬FóF∆TñC“&6ˆÁF7B◊FóF∆R"ˆ‰6∆˜6S◊∂ˆ‰6∆˜6W“6ó¶S“&∆&vR#‡–¢∆Fób6∆74Ê÷S“&6ˆÁF7B÷Fñ∆ˆr#‡–¢∆Fób6∆74Ê÷S“&6ˆÁF7B÷Fñ∆ˆr÷ÜVFW"#‡¢∆Fób6∆74Ê÷S“&6ˆÁF7B◊&ˆfñ∆R÷fF""&ñ÷ÜñFFV„“'G'VR#Á∂ñÊóFñ«2á&ˆfñ∆RÊFó7∆îÊ÷Ró”¬ˆFóc‡¢∆Fóc„«7‚6∆74Ê÷S“&Fñ∆ˆr÷WñV'&˜r#Â&V∆W2&ˆfñ¬W6vW|:FÜ«C¬˜7„„∆É"ñC“&6ˆÁF7B◊FóF∆R#ÂFW&÷ñ‚÷óB∑&ˆfñ∆RÊFó7∆îÊ÷W”¬ˆÉ#„«Á∑&ˆfñ∆RÁ&ˆ∆W”¬˜„¬ˆFóc‡¢¬ˆFóc‡–¢∆Fób6∆74Ê÷S“&6ˆÁF7B÷∆ñ˜WB#‡–¢∆Fób6∆74Ê÷S“&6ˆÁF7B÷6˜í#‡–¢∆Fób6∆74Ê÷S“'&ˆ÷‚÷6&B#‡–¢∆Fób6∆74Ê÷S“&∆ófR◊&˜r#„«7‚6∆74Ê÷S“&∆ófR÷F˜B"&ñ÷ÜñFFV„“'G'VR"Û‚∆ófRW'&Vñ6Ü&#¬ˆFóc‡¢∆É3Â&ˆ÷‚FW&ñÊr&Vv∆VóFWBFV‚∂ˆÁF∑C¬ˆÉ3‡¢«Á∑&ˆfñ∆RÊ&ˆˆ∂ñÊuW&¬Ú$'V6ÜV‚6ñRFó&V∑BVñÊV‚g&VñV‚FW&÷ñ‚&Vñ“g&VV∆Ê6W"‚&Ví,;∆6∂g&vV‚ó7B&ˆ÷‚FW&ñÊrßW<:GG¶∆ñ6ÇW'&Vñ6Ü&"‚"¢$FñW6W2Üó7F˜&ó66ÜR÷F6Çó7BFW'¶VóBÊñ6áBFó&V∑B'V6Ü&"‚&ˆ÷‚FW&ñÊrÜñ∆gB&Ví,;∆6∂g&vV‚ˆFW"«FW&ÊFófV‚‚'”¬˜‡¢∆6∆74Ê÷S“'ÜˆÊR÷7Fñˆ‚"á&Vc◊∂FV√¢G¥4ÙÂD5EıÑÙ‰W÷”„«7‚&ñ÷ÜñFFV„“'G'VR#Ó)à„¬˜7„„«7„„«6÷∆√‰Fó&V∑BÁ'VfV„¬˜6÷∆√Á¥4ÙÂD5EıÑÙ‰UÙƒ$T«”¬˜7„„¬ˆ‡¢¬ˆFóc‡–¢∆Fób6∆74Ê÷S“&6ˆÁFñÁVR÷Ê˜FR#„«7‚&ñ÷ÜñFFV„“'G'VR#Ó˚»≥¬˜7„„«„«7G&ˆÊs‰Êˆ6ÇWGv2W&|:FÁ¶V„Û¬˜7G&ˆÊsÂ66Ü∆ñ\9ˆV‚6ñRFñW6W2fVÁ7FW"VÊB66á&Vñ&V‚6ñRg&Víñ“6ÜBvVóFW"‚FñRFW&÷ñÊ˜Fñˆ‚&∆Vñ'B6ñ6áF&"„¬˜„¬ˆFóc‡–¢¬ˆFóc‡¢∆Fób6∆74Ê÷S“&6∆VÊF"÷&V#‡¢∆Fób6∆74Ê÷S“&6∆VÊF"÷6ˆÁ6VÁB#‡¢∆Fób6∆74Ê÷S“&6∆VÊF"◊7ñ÷&ˆ¬"&ñ÷ÜñFFV„“'G'VR#„«7„Ó(is¬˜7„„«6÷∆√‰$ÙÙ¥î‰s¬˜6÷∆√„¬ˆFóc‡¢∆É3Á∑&ˆfñ∆RÊ&ˆˆ∂ñÊuW&¬Ú$Fó&V∑BFW&÷ñ‚|:FÜ∆V‚"¢$∑GVV∆¬Êñ6áB'V6Ü&"'”¬ˆÉ3‡¢«Á∑&ˆfñ∆RÊ&ˆˆ∂ñÊuW&¬ÚFñR'V6áVÊw76VóFRfˆ‚G∑&ˆfñ∆RÊFó7∆îÊ÷W“vó&BW'7BÊ6Çñá&V“∂∆ñ6≤ñ‚VñÊV“ÊWVV‚F"v\;fffÊWBÊ¢$FW"g,;∆ÜW&RG&VffW"&∆Vñ'BßW"Ê6áfˆ∆«¶ñVÜ&&∂VóB6ñ6áF&"¬&W"W2ó7B∂Vñ‚∑GVV∆∆W"&ˆˆ∂ñÊr‘∆ñÊ≤g&VñvVvV&V‚‚'”¬˜‡¢∑&ˆfñ∆RÊ&ˆˆ∂ñÊuW&¬ÚÄ¢∆¢6∆74Ê÷S“&&ˆˆ∂ñÊr÷∆ñÊ≤÷7Fñˆ‚ ¢á&Vc◊∑&ˆfñ∆RÊ&ˆˆ∂ñÊuW&«–¢F&vWC“%ˆ&∆Ê≤ ¢&V√“&Êˆ˜VÊW"Ê˜&VfW'&W" ¢‡¢÷VWFñÊr'V6ÜV‚«7‚&ñ÷ÜñFFV„“'G'VR#Ó(i#¬˜7„‡¢¬ˆ‡¢í¢Ä¢«7‚6∆74Ê÷S“&&ˆˆ∂ñÊr◊VÊfñ∆&∆R#‰∑GVV∆¬∂Vñ‚Fó&V∑FW"&ˆˆ∂ñÊr‘∆ñÊ≥¬˜7„‡¢ó–¢¬ˆFóc‡¢¬ˆFóc‡¢¬ˆFóc‡–¢¬ˆFóc‡–¢¬Ù÷ˆF√‡–¢ì∞–ß––†–¶gVÊ7Fñˆ‚6ˆÊfó&‘FV∆WFTFñ∆ˆrá≤'W7í¬ˆ‰6∆˜6R¬ˆ‰6ˆÊfó&“”¢≤'W7ì¢&ˆˆ∆V„≤ˆ‰6∆˜6S¢Çí”‚fˆñC≤ˆ‰6ˆÊfó&”¢Çí”‚fˆñB“í∞–¢&WGW&‚Ä–¢ƒ÷ˆF¬FóF∆TñC“&FV∆WFR◊FóF∆R"ˆ‰6∆˜6S◊∂ˆ‰6∆˜6W”‡–¢∆Fób6∆74Ê÷S“&FV∆WFR÷Fñ∆ˆr#‡–¢«7‚6∆74Ê÷S“&FÊvW"◊7ñ÷&ˆ¬"&ñ÷ÜñFFV„“'G'VR#‚¬˜7„‡–¢∆É"ñC“&FV∆WFR◊FóF∆R#‰ÁvVÊGVÊw6FFV‚Ã;g66ÜV„Û¬ˆÉ#‡–¢«‰ñá&R&ˆ¶V∑FR¬Ê6á&ñ6áFV‚VÊBvW7Vñ6ÜW'FV‚W&vV&Êó76RvW&FV‚VÁG7&V6ÜVÊBFW"vV«FVÊFV‚Vf&Wvá'VÊw7&VvV∆‚vVÃ;g66áBˆFW"ÊˆÁñ÷ó6ñW'B‚FñW6W"66á&óGB∂Ê‚Êñ6áB,;∆6∂|:FÊvñrvV÷6áBvW&FV‚„¬˜‡–¢∆Fób6∆74Ê÷S“&Fñ∆ˆr÷7FñˆÁ2#‡–¢∆'WGFˆ‚6∆74Ê÷S“'6V6ˆÊF'í÷7Fñˆ‚"GóS“&'WGFˆ‚"ˆ‰6∆ñ6≥◊∂ˆ‰6∆˜6W“Fó6&∆VC◊∂'W7ó”‰&'&V6ÜV„¬ˆ'WGFˆ„‡–¢∆'WGFˆ‚6∆74Ê÷S“&FÊvW"÷7Fñˆ‚"GóS“&'WGFˆ‚"ˆ‰6∆ñ6≥◊∂ˆ‰6ˆÊfó&◊“Fó6&∆VC◊∂'W7ó”Á∂'W7íÚ%vó&BvVÃ;g66áB(
b"¢$FFV‚VÊF|;∆«FñrÃ;g66ÜV‚'”¬ˆ'WGFˆ„‡–¢¬ˆFóc‡–¢¬ˆFóc‡–¢¬Ù÷ˆF√‡–¢ì∞–ß––†