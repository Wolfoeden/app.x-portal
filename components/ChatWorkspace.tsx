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
  useSyncExternalStore,
} from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { openCookieSettings } from "@/components/CookieConsent";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowRight,
  IconArrowUp,
  IconArrowUpRight,
  IconCalendar,
  IconChat,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconDocument,
  IconFolder,
  IconInfo,
  IconMenu,
  IconPanelRight,
  IconPen,
  IconPlus,
  IconSearch,
  IconSpark,
} from "@/components/icons";
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
  type AiUsageSnapshot,
  type AiUsageUpdate,
  type AvailabilityStatus,
  type ChatApiPaths,
  type ChatRequest,
  type ChatResponse,
  type ChatStreamEvent,
  type ConversationMessage,
  type ExternalFreelancerCandidate,
  type ExternalFreelancerSearchResponse,
  type FreelancerProfileResult,
  type FreeAnalysisUsageSnapshot,
  type ProductCreditSnapshot,
  type ProjectDetailResponse,
  type ProjectCollectionItem,
  type ProjectListItem,
  type ProjectMode,
  type SessionResponse,
  type StructuredBrief,
  type VerificationLevel,
  defaultChatApiPaths,
} from "./chat-contract";

const GOOGLE_AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true";
const MICROSOFT_AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED === "true";

export function sidebarAccountButtonClassName(isAccountUser: boolean): string {
  return `sidebar-account-button${isAccountUser ? "" : " is-guest-login"}`;
}

const suggestions = [
  {
    label: "React-Entwicklung",
    description: "Freelancer für ein Webprojekt finden",
    draftPrefix: "React-Entwicklung\n\nProjektbeschreibung:\n",
    intro:
      "React-Entwicklung ist ausgewählt. Fügen Sie jetzt einfach Ihre vorhandene Projektbeschreibung ein – auch als langen Copy-and-paste-Text. Ich strukturiere Aufgaben, benötigte Kompetenzen, Rahmenbedingungen und offene Angaben und gleiche sie anschließend mit verfügbaren Profilen ab.",
  },
  {
    label: "Anforderungsmanagement",
    description: "Anforderungen strukturieren und begleiten",
    draftPrefix: "Anforderungsmanagement\n\nProjektbeschreibung:\n",
    intro:
      "Anforderungsmanagement ist ausgewählt. Fügen Sie jetzt Ihre Projektbeschreibung, Ihr Lastenheft oder vorhandene Notizen ein. Ich fasse Ziel, Aufgaben, Pflichtkompetenzen, Rahmenbedingungen und offene Punkte zusammen und suche danach passende verfügbare Profile.",
  },
  {
    label: "Prozessmanagement",
    description: "Abläufe analysieren und verbessern",
    draftPrefix: "Prozessmanagement\n\nProjektbeschreibung:\n",
    intro:
      "Prozessmanagement ist ausgewählt. Kopieren Sie Ihre Ausgangslage oder Projektbeschreibung in das Eingabefeld. Ich strukturiere Prozessziel, Aufgaben, benötigte Erfahrung, zeitliche Vorgaben und weitere Einschränkungen und starte dann den Profilabgleich.",
  },
  {
    label: "Informationssicherheit",
    description: "Expertise für sichere Organisationen",
    draftPrefix: "Informationssicherheit\n\nProjektbeschreibung:\n",
    intro:
      "Informationssicherheit ist ausgewählt. Fügen Sie Ihre Projektbeschreibung oder Anforderungsliste direkt ein. Ich erfasse Thema, benötigte Qualifikationen, Standards, Einsatzrahmen und offene Angaben, ohne fehlende Fakten zu erfinden, und gleiche das Ergebnis anschließend mit verfügbaren Profilen ab.",
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
  action?: "retry" | "refresh";
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

// The new-chat shortcut label depends on the operating system, which only the
// browser knows. Reading it through useSyncExternalStore keeps the prerendered
// /chat markup and the hydrated client in agreement; the platform never changes
// during a session, so the subscription is a no-op.
const subscribeToNothing = () => () => {};
const readIsApplePlatform = () => /Mac|iPhone|iPad|iPod/u.test(navigator.userAgent);
const readIsApplePlatformOnServer = () => false;

const CLIENT_BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION?.trim() || null;
const REFRESH_RECOVERY_KEY = "xportal.chat.refresh-recovery.v1";

export function buildVersionsDiffer(
  clientVersion: string | null | undefined,
  serverVersion: string | null | undefined,
): boolean {
  return Boolean(
    clientVersion?.trim() &&
    serverVersion?.trim() &&
    clientVersion.trim() !== serverVersion.trim(),
  );
}

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

export function normalizeUsageUpdate(value: unknown): AiUsageUpdate | null {
  const envelope = isRecord(value) && isRecord(value.data) ? value.data : value;
  if (!isRecord(envelope)) return null;
  const source = isRecord(envelope.usage) ? envelope.usage : envelope;
  const hasFreeUsageField = Object.prototype.hasOwnProperty.call(source, "freeUsage") ||
    Object.prototype.hasOwnProperty.call(source, "free_usage");
  const freeUsageSource = isRecord(source.freeUsage)
    ? source.freeUsage
    : isRecord(source.free_usage)
      ? source.free_usage
      : null;
  const hasProductCreditField = Object.prototype.hasOwnProperty.call(source, "productCredits") ||
    Object.prototype.hasOwnProperty.call(source, "product_credits");
  const productCreditsSource = isRecord(source.productCredits)
    ? source.productCredits
    : isRecord(source.product_credits)
      ? source.product_credits
      : null;
  if (!hasFreeUsageField && !hasProductCreditField) return null;

  const update: AiUsageUpdate = {};
  if (hasFreeUsageField) {
    if (!freeUsageSource) return null;
    const limit = nonNegativeNumber(freeUsageSource.limit ?? freeUsageSource.usage_limit);
    const used = nonNegativeNumber(freeUsageSource.used);
    const reserved = nonNegativeNumber(freeUsageSource.reserved);
    const remaining = nonNegativeNumber(freeUsageSource.remaining);
    const periodStart = nullableString(
      freeUsageSource.periodStart ?? freeUsageSource.period_start,
    );
    const periodEnd = nullableString(freeUsageSource.periodEnd ?? freeUsageSource.period_end);
    if (
      limit === null || used === null || reserved === null || remaining === null ||
      !periodStart || !periodEnd
    ) {
      return null;
    }
    update.freeUsage = {
      limit,
      used,
      reserved,
      remaining,
      periodStart,
      periodEnd,
      exhausted: freeUsageSource.exhausted === true || remaining <= 0,
    };
  }

  if (hasProductCreditField) {
    if (!productCreditsSource) {
      update.productCredits = null;
      return update;
    }
    const balance = nonNegativeNumber(productCreditsSource.balance);
    const reserved = nonNegativeNumber(productCreditsSource.reserved);
    const available = nonNegativeNumber(productCreditsSource.available);
    const euroPerCredit = nullableString(
      productCreditsSource.euroPerCredit ?? productCreditsSource.euro_per_credit,
    );
    if (balance === null || reserved === null || available === null || !euroPerCredit) {
      return null;
    }
    update.productCredits = {
      balance,
      reserved,
      available,
      euroPerCredit,
    };
  }
  return update;
}

export function normalizeUsageSnapshot(value: unknown): AiUsageSnapshot | null {
  const update = normalizeUsageUpdate(value);
  if (!update?.freeUsage || !("productCredits" in update)) return null;
  return {
    freeUsage: update.freeUsage,
    productCredits: update.productCredits ?? null,
  };
}

export function mergeUsageSnapshot(
  current: AiUsageSnapshot | null,
  update: AiUsageUpdate | null | undefined,
): AiUsageSnapshot | null {
  if (!update) return current;
  const freeUsage = update.freeUsage ?? current?.freeUsage;
  if (!freeUsage) return current;
  const productCredits = Object.prototype.hasOwnProperty.call(update, "productCredits")
    ? update.productCredits ?? null
    : current?.productCredits ?? null;
  return { freeUsage, productCredits };
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
  const failureCategory =
    provider.failureCategory === "application_limit" ||
    provider.failureCategory === "auth_error" ||
    provider.failureCategory === "billing_or_quota" ||
    provider.failureCategory === "rate_limit" ||
    provider.failureCategory === "permission" ||
    provider.failureCategory === "model_unavailable" ||
    provider.failureCategory === "timeout" ||
    provider.failureCategory === "invalid_output" ||
    provider.failureCategory === "provider_error" ||
    provider.failureCategory === "unconfigured"
      ? provider.failureCategory
      : null;
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
      failureCategory: succeeded && !provider.fallback ? null : failureCategory,
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
  if (!isRecord(response)) throw new Error("Die Websuche hatte kein gültiges Format.");
  const trace = isRecord(response.searchTrace) ? response.searchTrace : {};
  const candidates = Array.isArray(response.candidates)
    ? response.candidates
        .map(normalizeExternalCandidate)
        .filter((candidate): candidate is ExternalFreelancerCandidate => candidate !== null)
        .slice(0, 3)
    : [];
  const usage = normalizeUsageUpdate(response.usage ?? response);
  return {
    projectId: stringValue(response.projectId),
    candidates,
    disclosure: stringValue(
      response.disclosure,
      "Externe Treffer stammen aus öffentlich zugänglichen Quellen und sind nicht durch XPORTAL verifiziert.",
    ),
    mode: response.mode === "openai" ? "openai" : "unavailable",
    notice: nullableString(response.notice) ?? undefined,
    searchTrace: {
      queries: stringList(trace.queries),
      consultedSourceCount: nonNegativeNumber(trace.consultedSourceCount) ?? 0,
      returnedCandidateCount: nonNegativeNumber(trace.returnedCandidateCount) ?? candidates.length,
    },
    ...(usage ? { usage } : {}),
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
    languageSource:
      brief.languageSource === "required" || brief.languageSource === "detected"
        ? brief.languageSource
        : null,
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
        introType === "premium" ? "Persönliche Freigabe" : "Kostenfreie Einführung",
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
    collectionId: nullableString(project.collectionId ?? project.collection_id),
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
  const envelope = isRecord(value) ? value : {};
  const response = isRecord(envelope.data) ? envelope.data : value;
  if (!isRecord(response)) throw new Error("Die Serverantwort hatte kein gültiges Format.");
  const matchSource = response.matches ?? response.profiles ?? response.shortlist;
  const matches = Array.isArray(matchSource)
    ? matchSource
        .map(normalizeProfile)
        .filter(
          (item): item is FreelancerProfileResult =>
            item !== null && item.bookingUrl !== null,
        )
    : [];
  const usage = normalizeUsageUpdate(response.usage ?? response);
  const analysis = normalizeAnalysisTrace(response.analysis);

  return {
    project: normalizeProject(response.project, fallbackTitle),
    message: normalizeMessage(response.message ?? response.assistantMessage ?? response.assistant),
    brief: normalizeBrief(response.brief),
    matches: matches.slice(0, 3),
    mode: response.mode === "fallback" ? "fallback" : "ai",
    notice: nullableString(response.notice) ?? undefined,
    ...(usage ? { usage } : {}),
    ...(analysis ? { analysis } : {}),
    ...(nullableString(response.buildVersion ?? envelope.buildVersion)
      ? { buildVersion: nullableString(response.buildVersion ?? envelope.buildVersion)! }
      : {}),
  };
}

function normalizeProjectCollection(value: unknown): ProjectCollectionItem {
  const collection = isRecord(value) ? value : {};
  return {
    id: stringValue(collection.id, makeId("collection")),
    name: stringValue(collection.name, "Unbenanntes Projekt"),
    updatedAt: stringValue(
      collection.updatedAt ?? collection.updated_at,
      new Date().toISOString(),
    ),
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
    ...(response.analysisMode === "ai" || response.analysisMode === "fallback"
      ? { analysisMode: response.analysisMode }
      : {}),
    analysisNotice: nullableString(response.analysisNotice),
  };
}

function authViewFromClaims(data: unknown): AuthView {
  const wrapper = isRecord(data) ? data : {};
  const claims = isRecord(wrapper.claims) ? wrapper.claims : wrapper;
  const sessionUser = isRecord(wrapper.user) ? wrapper.user : {};
  const appMetadata = isRecord(claims.app_metadata) ? claims.app_metadata : {};
  const metadataRoles = Array.isArray(appMetadata.roles)
    ? appMetadata.roles
    : [];
  const userId = nullableString(claims.sub ?? sessionUser.id);
  const anonymous =
    typeof wrapper.anonymous === "boolean"
      ? wrapper.anonymous
      : claims.is_anonymous !== false;
  return {
    authenticated: wrapper.authenticated === false ? false : Boolean(userId),
    anonymous,
    admin:
      wrapper.admin === true ||
      claims.admin === true ||
      appMetadata.role === "admin" ||
      metadataRoles.includes("admin"),
    user: userId
      ? {
          id: userId,
          displayName: nullableString(
            sessionUser.displayName ?? claims.name ?? claims.full_name,
          ),
          email: nullableString(sessionUser.email ?? claims.email),
        }
      : null,
  };
}

function formatRelativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Kürzlich";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Gerade eben";
  if (minutes < 60) return `Vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Vor ${hours} Std.`;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "short" }).format(date);
}

function formatCredits(value: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value);
}

function freeUsageIsLow(usage: FreeAnalysisUsageSnapshot) {
  if (usage.exhausted || usage.remaining <= 0) return false;
  return usage.limit > 0 && usage.remaining / usage.limit <= 0.2;
}

export function usageSummary(
  usage: AiUsageSnapshot,
  authenticated: boolean,
): string {
  const free = `${formatCredits(usage.freeUsage.remaining)}/${formatCredits(usage.freeUsage.limit)} freie Analysen`;
  return authenticated
    ? usage.productCredits
      ? `${free} · ${formatCredits(usage.productCredits.available)} Credits`
      : `${free} · Produkt-Credits werden geladen`
    : free;
}

export type ExternalSearchCtaState = {
  kind: "login" | "loading" | "insufficient" | "ready";
  label: string;
  disabled: boolean;
};

export function externalSearchCtaState(
  authenticated: boolean,
  productCredits: ProductCreditSnapshot | null,
): ExternalSearchCtaState {
  if (!authenticated) {
    return {
      kind: "login",
      label: "Anmelden, um die Internetsuche zu nutzen",
      disabled: false,
    };
  }
  if (!productCredits) {
    return {
      kind: "loading",
      label: "Creditstand wird geladen …",
      disabled: true,
    };
  }
  if (productCredits.available < 30) {
    return {
      kind: "insufficient",
      label: `30 Credits erforderlich · ${formatCredits(productCredits.available)} verfügbar`,
      disabled: true,
    };
  }
  return {
    kind: "ready",
    label: "Internetsuche starten – 30 Credits / 0,50 €",
    disabled: false,
  };
}

export function publicProgressLabel(label: string): string {
  const normalized = label.toLocaleLowerCase("de-DE");
  if (normalized.includes("speicher")) return "Anfrage wird sicher gespeichert …";
  if (normalized.includes("kein") && normalized.includes("treffer")) {
    return "Interner Profilabgleich abgeschlossen · kein passendes Profil gefunden …";
  }
  if (normalized.includes("profil") || normalized.includes("abgleich")) {
    if (normalized.includes("aufbereit") || normalized.includes("vorbereit")) {
      return "Bis zu drei Ergebnisse werden nachvollziehbar vorbereitet …";
    }
    return "Interne Profile werden regelbasiert abgeglichen …";
  }
  if (normalized.includes("struktur") || normalized.includes("analys")) {
    return "GPT-5.4 Nano strukturiert Ihre Anforderungen …";
  }
  return "Anfrage wird verarbeitet …";
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
  if (status === "available") return "Projektverfügbarkeit bestätigt";
  if (status === "limited") return "Projektverfügbarkeit begrenzt";
  if (status === "unavailable") return "Nicht verfügbar";
  return "Projektverfügbarkeit nicht bestätigt";
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
  availabilityRequirement: "Verfügbarkeit",
  contractualRequirements: "Vertragsanforderungen",
};

function presentUnknownFields(fields: string[]) {
  return fields.map((field) => unknownFieldLabels[field] ?? field);
}

function formatUsageReset(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Beginn des nächsten Abrechnungszeitraums";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

class ProcessedRequestError extends Error {
  constructor(
    message: string,
    readonly projectId: string,
  ) {
    super(message);
    this.name = "ProcessedRequestError";
  }
}

export class IncompleteChatStreamError extends Error {
  constructor(
    message: string,
    readonly projectId: string | null,
    readonly buildVersion: string | null = null,
  ) {
    super(message);
    this.name = "IncompleteChatStreamError";
  }
}

export class ChatBuildVersionMismatchError extends Error {
  constructor(
    readonly projectId: string | null,
    readonly serverBuildVersion: string,
  ) {
    super("Eine neue Version ist verfügbar. Bitte aktualisieren Sie die Seite.");
    this.name = "ChatBuildVersionMismatchError";
  }
}

export async function parseStreamResponse(
  response: Response,
  onDelta: (content: string, progress?: string) => void,
  fallbackTitle: string,
) {
  if (!response.body) throw new Error("Der Server hat keine Antwort gesendet.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let textContent = "";
  const streamState: { result: ChatResponse | null } = { result: null };
  let acceptedProjectId: string | null = null;
  let acceptedBuildVersion: string | null = null;

  const consume = (line: string) => {
    const cleaned = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
    if (!cleaned || cleaned === "[DONE]") return;
    try {
      const event = JSON.parse(cleaned) as ChatStreamEvent;
      if (event.type === "accepted") {
        acceptedProjectId = event.projectId;
        acceptedBuildVersion = event.buildVersion ?? null;
      } else if (event.type === "text_delta") {
        textContent += event.delta;
        onDelta(textContent);
      } else if (event.type === "progress") {
        onDelta(textContent, publicProgressLabel(event.label));
      } else if (event.type === "result") {
        streamState.result = normalizeChatResponse(event.data, fallbackTitle);
      } else if (event.type === "error") {
        if (event.code === "request_already_processed" && event.projectId) {
          throw new ProcessedRequestError(event.message, event.projectId);
        }
        if (event.projectId || acceptedProjectId) {
          throw new IncompleteChatStreamError(
            event.message,
            event.projectId ?? acceptedProjectId,
            acceptedBuildVersion,
          );
        }
        throw new Error(event.message);
      }
    } catch (error) {
      if (error instanceof SyntaxError) return;
      throw error;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    lines.forEach(consume);
    if (done) break;
  }
  consume(buffer);

  const completedResult = streamState.result;
  if (completedResult) {
    const serverBuildVersion = completedResult.buildVersion ?? acceptedBuildVersion;
    if (buildVersionsDiffer(CLIENT_BUILD_VERSION, serverBuildVersion)) {
      throw new ChatBuildVersionMismatchError(
        acceptedProjectId ?? completedResult.project.id,
        serverBuildVersion!,
      );
    }
    if (acceptedBuildVersion && !completedResult.buildVersion) {
      return { ...completedResult, buildVersion: acceptedBuildVersion };
    }
    return completedResult;
  }
  throw new IncompleteChatStreamError(
    acceptedProjectId
      ? "Die Übertragung wurde unterbrochen. Der gespeicherte Chat wird wiederhergestellt."
      : "Die Übertragung wurde unterbrochen. Bitte versuchen Sie die Anfrage erneut.",
    acceptedProjectId,
    acceptedBuildVersion,
  );
}

export function ChatWorkspace({ apiPaths: apiOverrides }: ChatWorkspaceProps) {
  const apiPaths = useMemo(
    () => ({ ...defaultChatApiPaths, ...apiOverrides }),
    [apiOverrides],
  );
  const [auth, setAuth] = useState<AuthView>(emptyAuth);
  const [authOpen, setAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<AuthDialogMode>("login");
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectCollections, setProjectCollections] = useState<ProjectCollectionItem[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectListItem | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [brief, setBrief] = useState<StructuredBrief | null>(null);
  const [profiles, setProfiles] = useState<FreelancerProfileResult[]>([]);
  const [hasResult, setHasResult] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<"ai" | "fallback" | null>(null);
  const [analysisTrace, setAnalysisTrace] = useState<AiAnalysisTrace | null>(null);
  const [externalSearch, setExternalSearch] = useState<ExternalFreelancerSearchResponse | null>(null);
  const [externalSearchState, setExternalSearchState] = useState<"idle" | "searching" | "error">("idle");
  const [draft, setDraft] = useState("");
  const [pendingAssistant, setPendingAssistant] = useState<PendingAssistant | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [usage, setUsage] = useState<AiUsageSnapshot | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [manageChat, setManageChat] = useState<ProjectListItem | null>(null);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [dataAction, setDataAction] = useState<"export" | "delete" | null>(null);
  const newChatShortcut = useSyncExternalStore(
    subscribeToNothing,
    readIsApplePlatform,
    readIsApplePlatformOnServer,
  )
    ? "⌘ K"
    : "Strg K";
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const startNewProjectRef = useRef<(() => void) | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const externalSearchRequestIdsRef = useRef(new Map<string, string>());

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const isAccountUser = auth.authenticated && !auth.anonymous;
  const freeUsageExhausted = Boolean(
    usage && (usage.freeUsage.exhausted || usage.freeUsage.remaining <= 0),
  );
  const freeUsageLow = Boolean(usage && freeUsageIsLow(usage.freeUsage));

  const showToast = useCallback((message: string, tone: ToastState["tone"] = "neutral") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), message, tone });
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const refreshAuth = useCallback(async () => {
    const claims = await ensureGuestSession();
    let view = authViewFromClaims(claims);
    try {
      const response = await fetch(apiPaths.session, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (response.ok) view = authViewFromClaims(await response.json());
    } catch {
      // The verified browser session remains a safe UI fallback. Protected
      // routes independently enforce server-side authorization.
    }
    setAuth(view);
    return view;
  }, [apiPaths.session]);

  const refreshUsage = useCallback(async () => {
    if (!apiPaths.credits) {
      setUsage(null);
      return null;
    }
    try {
      const response = await fetch(apiPaths.credits, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 404 || response.status === 501) {
          setUsage(null);
        }
        return null;
      }
      const snapshot = normalizeUsageSnapshot(await response.json());
      if (snapshot) setUsage(snapshot);
      return snapshot;
    } catch {
      // Usage information is supplementary and never blocks the chat shell.
      return null;
    }
  }, [apiPaths.credits]);

  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch(apiPaths.projects, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return;
      const body: unknown = await response.json();
      const source = Array.isArray(body)
        ? body
        : isRecord(body) && Array.isArray(body.projects)
          ? body.projects
          : [];
      setProjects(source.map((item) => normalizeProject(item, "Gespeichertes Projekt")));
    } catch {
      // A project list is helpful, but never blocks the chat shell.
    }
  }, [apiPaths.projects]);

  const loadProjectCollections = useCallback(async () => {
    try {
      const response = await fetch(apiPaths.projectCollections, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) return;
      const body: unknown = await response.json();
      const source = isRecord(body) && Array.isArray(body.collections)
        ? body.collections
        : [];
      setProjectCollections(source.map(normalizeProjectCollection));
    } catch {
      // Folder navigation is supplementary; chats remain directly accessible.
    }
  }, [apiPaths.projectCollections]);

  const loadProject = useCallback(
    async (project: ProjectListItem | string) => {
      const projectId = typeof project === "string" ? project : project.id;
      setLoadingProjectId(projectId);
      setSidebarOpen(false);
      try {
        const response = await fetch(`${apiPaths.projects}/${encodeURIComponent(projectId)}`, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Projekt konnte nicht geladen werden.");
        const detail = normalizeProjectDetail(await response.json());
        setActiveProject(detail.project);
        setMessages(detail.messages);
        setBrief(detail.brief);
        setProfiles(detail.profiles.slice(0, 3));
        setHasResult(Boolean(detail.brief));
        setAnalysisMode(detail.analysisMode ?? null);
        setAnalysisTrace(null);
        setExternalSearch(null);
        setExternalSearchState("idle");
        setSelectedProfileId(null);
        return detail;
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Projekt konnte nicht geladen werden.", "error");
        return null;
      } finally {
        setLoadingProjectId(null);
      }
    },
    [apiPaths.projects, showToast],
  );

  useEffect(() => {
    let alive = true;
    const supabase = getBrowserSupabaseClient();

    void (async () => {
      try {
        const view = await refreshAuth();
        if (!alive) return;
        await refreshUsage();
        if (!alive) return;
        const searchParams = new URLSearchParams(window.location.search);
        const authError = searchParams.get("auth_error");
        if (authError) {
          showToast(
            authError === "exchange_failed" || authError === "confirmation_failed"
              ? "Der Anmeldelink ist ungültig oder abgelaufen. Bitte starten Sie die Anmeldung erneut."
              : "Die Anmeldung konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.",
            "error",
          );
          searchParams.delete("auth_error");
          searchParams.delete("set-password");
          const cleanUrl = `${window.location.pathname}${
            searchParams.size ? `?${searchParams.toString()}` : ""
          }${window.location.hash}`;
          window.history.replaceState({}, "", cleanUrl);
        }
        if (!view.anonymous && searchParams.has("code")) {
          searchParams.delete("code");
          searchParams.delete("next");
          const cleanUrl = `${window.location.pathname}${
            searchParams.size ? `?${searchParams.toString()}` : ""
          }${window.location.hash}`;
          window.history.replaceState({}, "", cleanUrl);
        }
        if (!authError && searchParams.get("set-password") === "1") {
          if (view.anonymous) {
            showToast(
              "Der Link zum Zurücksetzen ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen Link an.",
              "error",
            );
            searchParams.delete("set-password");
            const cleanUrl = `${window.location.pathname}${
              searchParams.size ? `?${searchParams.toString()}` : ""
            }${window.location.hash}`;
            window.history.replaceState({}, "", cleanUrl);
          } else {
            setAuthInitialMode("set-password");
            setAuthOpen(true);
          }
        }
        if (searchParams.get("admin-login") === "1") {
          if (view.admin && !view.anonymous) {
            window.location.assign(
              apiPaths.adminUsage ?? "/chat/admin/ai-usage",
            );
            return;
          }
          if (view.anonymous) {
            setAuthInitialMode("login");
            setAuthOpen(true);
          } else {
            searchParams.delete("admin-login");
            const cleanUrl = `${window.location.pathname}${
              searchParams.size ? `?${searchParams.toString()}` : ""
            }${window.location.hash}`;
            window.history.replaceState({}, "", cleanUrl);
            showToast(
              "Dieses Konto hat keinen Zugriff auf das AI-Usage-Dashboard.",
              "error",
            );
          }
        }
        if (searchParams.get("claim_warning") === "transfer_pending" && !view.anonymous) {
          try {
            await claimPreparedGuestWorkspace();
            searchParams.delete("claim_warning");
            const cleanUrl = `${window.location.pathname}${
              searchParams.size ? `?${searchParams.toString()}` : ""
            }${window.location.hash}`;
            window.history.replaceState({}, "", cleanUrl);
          } catch (error) {
            showToast(
              error instanceof Error
                ? error.message
                : "Die Gastanfrage konnte nicht übertragen werden.",
              "error",
            );
          }
        }
        await Promise.all([loadProjects(), loadProjectCollections()]);
        const refreshRecovery = sessionStorage.getItem(REFRESH_RECOVERY_KEY);
        if (refreshRecovery) {
          sessionStorage.removeItem(REFRESH_RECOVERY_KEY);
          try {
            const saved: unknown = JSON.parse(refreshRecovery);
            if (isRecord(saved)) {
              const savedText = nullableString(saved.text);
              const savedProjectId = nullableString(saved.projectId);
              const savedAt = typeof saved.savedAt === "number" ? saved.savedAt : 0;
              if (savedText && Date.now() - savedAt < 60 * 60 * 1000) {
                setDraft(savedText.slice(0, 12_000));
              }
              if (savedProjectId) {
                const recovered = await loadProject(savedProjectId);
                if (recovered) showToast("Der gespeicherte Chat wurde wiederhergestellt.");
              }
            }
          } catch {
            // Invalid session recovery data is discarded and never blocks the app.
          }
        }
        const pendingProject = sessionStorage.getItem("pending_project_id");
        if (pendingProject && !view.anonymous) {
          const detail = await loadProject(pendingProject);
          sessionStorage.removeItem("pending_project_id");
          const pendingProfile = sessionStorage.getItem("pending_profile_selection");
          if (detail && pendingProfile && detail.profiles.some((profile) => profile.id === pendingProfile)) {
            setSelectedProfileId(pendingProfile);
            setContactOpen(true);
            sessionStorage.removeItem("pending_profile_selection");
          }
        }
      } catch {
        if (alive) showToast("Der temporäre Zugang konnte nicht gestartet werden. Bitte neu laden.", "error");
      }
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      setUsage(null);
      void refreshAuth()
        .then(() => refreshUsage())
        .catch(() => undefined);
    });
    return () => {
      alive = false;
      subscription.subscription.unsubscribe();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [
    apiPaths.adminUsage,
    loadProject,
    loadProjectCollections,
    loadProjects,
    refreshAuth,
    refreshUsage,
    showToast,
  ]);

  useEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [draft]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pendingAssistant, profiles]);

  const startNewProject = () => {
    setActiveProject(null);
    setMessages([]);
    setBrief(null);
    setProfiles([]);
    setHasResult(false);
    setAnalysisMode(null);
    setAnalysisTrace(null);
    setExternalSearch(null);
    setExternalSearchState("idle");
    setDraft("");
    setPendingAssistant(null);
    setSelectedProfileId(null);
    setContactOpen(false);
    setSidebarOpen(false);
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  // The sidebar advertised a "⌘ K" shortcut that was never bound, and showed
  // the Mac symbol on every platform. Bind it and label it per operating
  // system. The label resolves after mount so the static /chat markup and the
  // client render agree.
  useEffect(() => {
    startNewProjectRef.current = startNewProject;
  });

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k") return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      startNewProjectRef.current?.();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const startGuidedRequest = (suggestion: Suggestion) => {
    setActiveProject(null);
    setBrief(null);
    setProfiles([]);
    setHasResult(false);
    setAnalysisMode(null);
    setAnalysisTrace(null);
    setExternalSearch(null);
    setExternalSearchState("idle");
    setSelectedProfileId(null);
    setContactOpen(false);
    setPendingAssistant(null);
    setMessages([
      {
        id: makeId("assistant-guide"),
        role: "assistant",
        content: suggestion.intro,
        createdAt: new Date().toISOString(),
      },
    ]);
    setDraft(suggestion.draftPrefix);
    requestAnimationFrame(() => {
      const textarea = composerRef.current;
      textarea?.focus();
      textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  };

  const finishChatResponse = useCallback(
    (result: ChatResponse) => {
      const assistantMessage = normalizeMessage(result.message);
      setMessages((current) => [...current, assistantMessage]);
      setBrief(result.brief);
      setProfiles(result.matches.slice(0, 3));
      setHasResult(true);
      setAnalysisMode(result.mode ?? "ai");
      setAnalysisTrace(result.analysis ?? null);
      setExternalSearch(null);
      setExternalSearchState("idle");
      setSelectedProfileId((current) =>
        result.matches.some((profile) => profile.id === current) ? current : null,
      );
      setActiveProject(result.project);
      setProjects((current) => {
        const withoutCurrent = current.filter((project) => project.id !== result.project.id);
        return [result.project, ...withoutCurrent];
      });
      if (result.usage) setUsage((current) => mergeUsageSnapshot(current, result.usage));
      void refreshUsage();
      if (result.notice) showToast(result.notice);
    },
    [refreshUsage, showToast],
  );

  const sendMessage = useCallback(
    async (
      rawText: string,
      appendUser = true,
      existingClientMessageId?: string,
    ) => {
      const text = rawText.trim();
      if (!text || pendingAssistant) return;
      const optimistic: ConversationMessage = {
        id: existingClientMessageId ?? makeId("user"),
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      };
      if (appendUser) setMessages((current) => [...current, optimistic]);
      setDraft("");
      setPendingAssistant({
        id: makeId("assistant"),
        clientMessageId: optimistic.id,
        content: "",
        progress: "GPT-5.4 Nano strukturiert Ihre Anforderungen …",
        retryText: null,
      });
      const recoveryProjectId = activeProject?.id ?? null;

      try {
        await refreshAuth();
        const requestBody: ChatRequest = {
          projectId: activeProject?.id ?? null,
          message: text,
          clientMessageId: optimistic.id,
        };
        const response = await fetch(apiPaths.chat, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
          body: JSON.stringify(requestBody),
        });
        if (!response.ok) {
          const retryAfter = response.headers.get("Retry-After");
          if (response.status === 429) {
            setDraft(text);
            void refreshUsage();
            throw new Error(
              retryAfter
                ? `Das Nutzungslimit ist erreicht. Erneut möglich in ${retryAfter} Sekunden.`
                : "Das Nutzungslimit ist erreicht. Bitte versuchen Sie es später erneut.",
            );
          }
          let message = "Die Anfrage konnte gerade nicht verarbeitet werden.";
          let processedProjectId: string | null = null;
          try {
            const body: unknown = await response.json();
            if (isRecord(body)) {
              message = stringValue(body.error ?? body.message, message);
              if (
                body.code === "request_already_processed" &&
                typeof body.projectId === "string"
              ) {
                processedProjectId = body.projectId;
              }
            }
          } catch {
            // Keep the safe generic error message.
          }
          if (processedProjectId) {
            await loadProject(processedProjectId);
            setPendingAssistant(null);
            return;
          }
          throw new Error(message);
        }

        const contentType = response.headers.get("content-type") ?? "";
        const result = contentType.includes("text/event-stream") || contentType.includes("x-ndjson")
          ? await parseStreamResponse(
              response,
              (content, progress) => {
                setPendingAssistant((current) =>
                  current
                    ? { ...current, content, progress: progress ?? current.progress }
                    : current,
                );
              },
              text.slice(0, 52),
            )
          : normalizeChatResponse(await response.json(), text.slice(0, 52));

        if (buildVersionsDiffer(CLIENT_BUILD_VERSION, result.buildVersion)) {
          throw new ChatBuildVersionMismatchError(result.project.id, result.buildVersion!);
        }

        finishChatResponse(result);
        setPendingAssistant(null);
      } catch (error) {
        if (error instanceof ChatBuildVersionMismatchError) {
          try {
            sessionStorage.setItem(
              REFRESH_RECOVERY_KEY,
              JSON.stringify({
                text,
                projectId: error.projectId ?? recoveryProjectId,
                savedAt: Date.now(),
              }),
            );
          } catch {
            // The current React state still keeps the text until refresh.
          }
          setDraft(text);
          setPendingAssistant({
            id: makeId("assistant-update"),
            clientMessageId: optimistic.id,
            content: error.message,
            progress: "",
            retryText: null,
            action: "refresh",
          });
          return;
        }
        if (error instanceof ProcessedRequestError) {
          const recovered = await loadProject(error.projectId);
          if (recovered) {
            setPendingAssistant(null);
            return;
          }
        }
        if (error instanceof IncompleteChatStreamError) {
          const projectId = error.projectId ?? recoveryProjectId;
          if (projectId) {
            const recovered = await loadProject(projectId);
            if (recovered) {
              setPendingAssistant(null);
              return;
            }
          }
          setPendingAssistant({
            id: makeId("assistant-error"),
            clientMessageId: optimistic.id,
            content: "Die Übertragung wurde unterbrochen. Bitte versuchen Sie die Anfrage erneut.",
            progress: "",
            retryText: text,
          });
          return;
        }
        const message = error instanceof Error ? error.message : "Die Anfrage konnte nicht verarbeitet werden.";
        setPendingAssistant({
          id: makeId("assistant-error"),
          clientMessageId: optimistic.id,
          content: message,
          progress: "",
          retryText: text,
        });
      }
    },
    [
      activeProject,
      apiPaths.chat,
      finishChatResponse,
      loadProject,
      pendingAssistant,
      refreshAuth,
      refreshUsage,
    ],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(draft);
  };

  const runExternalFreelancerSearch = async () => {
    if (!activeProject?.id || externalSearchState === "searching") return;
    const projectId = activeProject.id;
    if (!isAccountUser) {
      setAuthInitialMode("login");
      setAuthOpen(true);
      return;
    }
    if (!usage?.productCredits || usage.productCredits.available < 30) {
      showToast("Für die Internetsuche sind 30 verfügbare Produkt-Credits erforderlich.", "error");
      void refreshUsage();
      return;
    }
    setExternalSearch(null);
    setExternalSearchState("searching");
    const storageKey = `xportal.external-search-request.v1:${projectId}`;
    const requestId =
      externalSearchRequestIdsRef.current.get(projectId) ??
      sessionStorage.getItem(storageKey) ??
      makeId("external-search");
    externalSearchRequestIdsRef.current.set(projectId, requestId);
    sessionStorage.setItem(storageKey, requestId);
    let resetRequestId = false;
    try {
      const response = await fetch(apiPaths.freelancerSearch, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          projectId,
          requestId,
        }),
      });
      if (!response.ok) {
        let message = "Die externe Suche konnte gerade nicht abgeschlossen werden.";
        try {
          const body: unknown = await response.json();
          if (isRecord(body)) {
            message = stringValue(body.error, message);
            resetRequestId =
              body.code === "search_technical_error_refunded" ||
              body.code === "search_previous_attempt_released";
          }
        } catch {
          // Keep the safe generic message.
        }
        throw new Error(message);
      }
      const result = normalizeExternalSearchResponse(await response.json());
      externalSearchRequestIdsRef.current.delete(projectId);
      sessionStorage.removeItem(storageKey);
      setExternalSearch(result);
      if (result.usage) setUsage((current) => mergeUsageSnapshot(current, result.usage));
      void refreshUsage();
      if (result.notice) showToast(result.notice);
      setExternalSearchState("idle");
    } catch (error) {
      if (resetRequestId) {
        externalSearchRequestIdsRef.current.delete(projectId);
        sessionStorage.removeItem(storageKey);
      }
      setExternalSearchState("error");
      void refreshUsage();
      showToast(
        error instanceof Error
          ? error.message
          : "Die externe Suche konnte gerade nicht abgeschlossen werden.",
        "error",
      );
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (draft.trim() && !pendingAssistant) void sendMessage(draft);
    }
  };

  const requestProfileSelection = (profile: FreelancerProfileResult) => {
    if (!isAccountUser) {
      setPendingProfileId(profile.id);
      sessionStorage.setItem("pending_profile_selection", profile.id);
      if (activeProject?.id) sessionStorage.setItem("pending_project_id", activeProject.id);
      setAuthInitialMode("login");
      setAuthOpen(true);
      return;
    }
    setSelectedProfileId(profile.id);
    setContactOpen(true);
  };

  const handleAuthenticated = async () => {
    const view = await refreshAuth();
    if (view.anonymous) return;
    setAuthOpen(false);
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("admin-login") === "1") {
      if (view.admin) {
        window.location.assign(
          apiPaths.adminUsage ?? "/chat/admin/ai-usage",
        );
        return;
      }
      searchParams.delete("admin-login");
      const cleanUrl = `${window.location.pathname}${
        searchParams.size ? `?${searchParams.toString()}` : ""
      }${window.location.hash}`;
      window.history.replaceState({}, "", cleanUrl);
      showToast(
        "Dieses Konto hat keinen Zugriff auf das AI-Usage-Dashboard.",
        "error",
      );
    }
    if (pendingProfileId) {
      setSelectedProfileId(pendingProfileId);
      setPendingProfileId(null);
      sessionStorage.removeItem("pending_profile_selection");
      setContactOpen(true);
    }
    await Promise.all([loadProjects(), loadProjectCollections()]);
  };

  const createProjectCollection = async (name: string) => {
    const response = await fetch(apiPaths.projectCollections, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name }),
    });
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok || !isRecord(body) || !isRecord(body.collection)) {
      throw new Error(
        isRecord(body) ? stringValue(body.error, "Projekt konnte nicht erstellt werden.") : "Projekt konnte nicht erstellt werden.",
      );
    }
    const collection = normalizeProjectCollection(body.collection);
    setProjectCollections((current) => [collection, ...current.filter((item) => item.id !== collection.id)]);
    setCreateProjectOpen(false);
    showToast("Projekt erstellt.");
    return collection;
  };

  const moveChatToProject = async (chat: ProjectListItem, collectionId: string | null) => {
    const response = await fetch(`${apiPaths.projects}/${encodeURIComponent(chat.id)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ collectionId }),
    });
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok || !isRecord(body) || !isRecord(body.project)) {
      throw new Error(isRecord(body) ? stringValue(body.error, "Chat konnte nicht verschoben werden.") : "Chat konnte nicht verschoben werden.");
    }
    const updated = normalizeProject(body.project, chat.title);
    setProjects((current) => current.map((item) => item.id === updated.id ? updated : item));
    setActiveProject((current) => current?.id === updated.id ? updated : current);
    setManageChat(null);
    showToast(collectionId ? "Chat im Projekt gespeichert." : "Chat aus dem Projekt gelöst.");
  };

  const deleteChat = async (chat: ProjectListItem) => {
    const response = await fetch(`${apiPaths.projects}/${encodeURIComponent(chat.id)}`, {
      method: "DELETE",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => ({}));
      throw new Error(isRecord(body) ? stringValue(body.error, "Chat konnte nicht gelöscht werden.") : "Chat konnte nicht gelöscht werden.");
    }
    setProjects((current) => current.filter((item) => item.id !== chat.id));
    if (activeProject?.id === chat.id) startNewProject();
    setManageChat(null);
    showToast("Chat gelöscht.");
  };

  const exportData = async () => {
    setDataAction("export");
    setAccountMenuOpen(false);
    try {
      const response = await fetch(apiPaths.exportData, { credentials: "same-origin" });
      if (!response.ok) throw new Error("Export konnte nicht erstellt werden.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "meine-projektdaten.json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      showToast("Der Datenexport wurde erstellt.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Export fehlgeschlagen.", "error");
    } finally {
      setDataAction(null);
    }
  };

  const deleteData = async () => {
    setDataAction("delete");
    try {
      const response = await fetch(apiPaths.deleteData, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Die Daten konnten nicht gelöscht werden.");
      await signOutAccount();
      setDeleteOpen(false);
      startNewProject();
      setProjects([]);
      setProjectCollections([]);
      await refreshAuth();
      showToast("Ihre Anwendungsdaten wurden gelöscht.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Löschen fehlgeschlagen.", "error");
    } finally {
      setDataAction(null);
    }
  };

  const signOut = async () => {
    setAccountMenuOpen(false);
    await signOutAccount();
    startNewProject();
    setProjects([]);
    setProjectCollections([]);
    await refreshAuth();
    showToast("Sie wurden abgemeldet. Ein neuer Gastzugang ist aktiv.");
  };

  const unassignedChats = projects.filter((project) => !project.collectionId);

  return (
    <div className={`app-shell ${detailsOpen ? "" : "details-hidden"}`}>
      <a className="skip-link" href="#chat-composer">Direkt zur Nachricht</a>

      <aside className={`project-sidebar ${sidebarOpen ? "is-open" : ""}`} aria-label="Projekte">
        <div className="sidebar-top">
          <div className="product-mark" aria-label="Freelancer Beta">
            <span className="mark-glyph" aria-hidden="true">F</span>
            <span>Freelancer Beta</span>
          </div>
          <button className="icon-button sidebar-close" type="button" onClick={() => setSidebarOpen(false)} aria-label="Projektleiste schließen"><IconClose size={18} /></button>
        </div>

        <nav className="sidebar-primary-nav" aria-label="Hauptnavigation">
          <button
            className="sidebar-primary-button is-new-chat"
            type="button"
            onClick={startNewProject}
            data-sidebar-primary="new-chat"
          >
            <span className="sidebar-primary-icon" aria-hidden="true"><IconPlus size={18} /></span>
            <span>Neuer Chat</span>
            <span className="new-chat-key" aria-hidden="true">{newChatShortcut}</span>
          </button>
          <button
            className="sidebar-primary-button"
            type="button"
            onClick={() => setCreateProjectOpen(true)}
            data-sidebar-primary="projects"
          >
            <span className="sidebar-primary-icon" aria-hidden="true"><IconFolder size={18} /></span>
            <span>Projekte</span>
            <span className="sidebar-primary-chevron" aria-hidden="true"><IconPlus size={16} /></span>
          </button>
          <button
            className="sidebar-primary-button"
            type="button"
            onClick={() => setAgentsOpen(true)}
            data-sidebar-primary="agents"
          >
            <span className="agent-glyph" aria-hidden="true">A</span>
            <span>Agenten</span>
            <span className="sidebar-primary-chevron" aria-hidden="true"><IconChevronRight size={16} /></span>
          </button>
        </nav>

        <nav className="project-nav" aria-label="Gespeicherte Chats">
          <p className="nav-label">Chats</p>
          {unassignedChats.length === 0 ? (
            <div className="empty-projects">
              <span aria-hidden="true"><IconChat size={22} /></span>
              <p>Noch keine freien Chats</p>
              <small>Neue Unterhaltungen erscheinen automatisch hier.</small>
            </div>
          ) : (
            <SidebarChatList
              chats={unassignedChats}
              activeProjectId={activeProject?.id ?? null}
              loadingProjectId={loadingProjectId}
              onOpen={(project) => void loadProject(project)}
              onManage={setManageChat}
            />
          )}

          <div className="sidebar-section-heading">
            <p className="nav-label">In Projekten</p>
            <button type="button" onClick={() => setCreateProjectOpen(true)}><IconPlus size={13} /> Projekt</button>
          </div>
          {projectCollections.length === 0 ? (
            <p className="sidebar-section-empty">Erstellen Sie ein Projekt und speichern Sie mehrere Chats darin.</p>
          ) : (
            <div className="collection-list">
              {projectCollections.map((collection) => {
                const chats = projects.filter((project) => project.collectionId === collection.id);
                return (
                  <section className="collection-group" key={collection.id} aria-label={`Projekt ${collection.name}`}>
                    <div className="collection-title"><span aria-hidden="true"><IconChevronDown size={14} /></span>{collection.name}<small>{chats.length}</small></div>
                    {chats.length ? (
                      <SidebarChatList
                        chats={chats}
                        activeProjectId={activeProject?.id ?? null}
                        loadingProjectId={loadingProjectId}
                        onOpen={(project) => void loadProject(project)}
                        onManage={setManageChat}
                      />
                    ) : <p className="collection-empty">Noch keine Chats</p>}
                  </section>
                );
              })}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="account-menu-wrap sidebar-account-menu-wrap">
            {accountMenuOpen ? (
              <div className="account-popover sidebar-account-popover" role="dialog" aria-label="Konto und Einstellungen">
                <div className="account-identity">
                  <strong>{isAccountUser ? auth.user?.displayName ?? "Ihr Konto" : "Ohne Konto"}</strong>
                  <span>{isAccountUser ? auth.user?.email ?? "Angemeldet" : "Aktuelle Anfrage bleibt in diesem Browser verfügbar"}</span>
                </div>
                {usage ? <UsagePanel usage={usage} authenticated={isAccountUser} /> : null}
                {isAccountUser ? (
                  <>
                    {auth.admin && apiPaths.adminUsage ? (
                      <button
                        type="button"
                        onClick={() => window.location.assign(apiPaths.adminUsage!)}
                      >
                        Geschütztes AI-Usage-Dashboard
                      </button>
                    ) : null}
                    <button type="button" onClick={() => void exportData()} disabled={dataAction === "export"}>Daten exportieren</button>
                    <button type="button" onClick={() => { setAccountMenuOpen(false); openCookieSettings(); }}>Cookie-Einstellungen verwalten</button>
                    <button type="button" onClick={() => { setAccountMenuOpen(false); setDeleteOpen(true); }}>Daten & Konto löschen</button>
                    <div className="menu-divider" />
                    <button type="button" onClick={() => void signOut()}>Abmelden</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => { setAccountMenuOpen(false); setSidebarOpen(false); setAuthInitialMode("login"); setAuthOpen(true); }}>Anmelden oder Konto erstellen</button>
                    <button type="button" onClick={() => { setAccountMenuOpen(false); openCookieSettings(); }}>Cookie-Einstellungen verwalten</button>
                  </>
                )}
                <p className="account-privacy-note">Projekte werden nur Ihrem aktuellen Zugang zugeordnet.</p>
              </div>
            ) : null}
            <button
              className={sidebarAccountButtonClassName(isAccountUser)}
              type="button"
              aria-label={isAccountUser ? "Konto und Einstellungen öffnen" : "Anmelden oder Konto erstellen"}
              aria-haspopup="dialog"
              aria-expanded={accountMenuOpen}
              onClick={() => {
                if (!accountMenuOpen) void refreshUsage();
                setAccountMenuOpen((current) => !current);
              }}
            >
              <span className="sidebar-account-avatar" aria-hidden="true">
                {isAccountUser ? initials(auth.user?.displayName ?? auth.user?.email ?? "Konto") : "G"}
              </span>
              <span className="sidebar-account-copy">
                <strong>{isAccountUser ? auth.user?.displayName ?? auth.user?.email ?? "Ihr Konto" : "Anmelden"}</strong>
                <span>
                  {usage
                    ? usageSummary(usage, isAccountUser)
                    : isAccountUser
                      ? auth.user?.email ?? "Konto verwalten"
                      : "Projekte dauerhaft speichern"}
                </span>
              </span>
              <span className="sidebar-account-more" aria-hidden="true">•••</span>
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen ? <button className="sidebar-scrim" type="button" onClick={() => setSidebarOpen(false)} aria-label="Projektleiste schließen" /> : null}

      <main className="chat-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" type="button" onClick={() => setSidebarOpen(true)} aria-label="Projekte öffnen"><IconMenu size={18} /></button>
            <div>
              <p className="topbar-title">{activeProject?.title ?? "Freelancer finden"}</p>
              <p className="topbar-subtitle">KI-gestützte Anfrage · Sie treffen jede Entscheidung</p>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="icon-button details-toggle" type="button" onClick={() => setDetailsOpen((current) => !current)} aria-label={detailsOpen ? "Projektübersicht ausblenden" : "Projektübersicht einblenden"} aria-pressed={detailsOpen}><IconPanelRight size={18} /></button>
          </div>
        </header>

        <div className="chat-scroll" aria-live="polite">
          <div className="conversation">
            {messages.length === 0 && !pendingAssistant ? (
              <WelcomeState onSuggestion={startGuidedRequest} />
            ) : (
              <div className="message-list">
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                {pendingAssistant ? (
                  <PendingMessage
                    pending={pendingAssistant}
                    onRetry={() => {
                      const text = pendingAssistant.retryText;
                      const clientMessageId = pendingAssistant.clientMessageId;
                      setPendingAssistant(null);
                      if (text) void sendMessage(text, false, clientMessageId);
                    }}
                    onRefresh={() => window.location.reload()}
                  />
                ) : null}
                {hasResult && !pendingAssistant ? (
                  <ResultSection
                    brief={brief}
                    profiles={profiles}
                    analysis={analysisTrace}
                    analysisMode={analysisMode}
                    externalSearch={externalSearch}
                    externalSearchState={externalSearchState}
                    onExternalSearch={() => void runExternalFreelancerSearch()}
                    isAccountUser={isAccountUser}
                    productCredits={usage?.productCredits ?? null}
                    onRequireLogin={() => {
                      setAuthInitialMode("login");
                      setAuthOpen(true);
                    }}
                    selectedProfileId={selectedProfileId}
                    onSelect={requestProfileSelection}
                    onContact={(profile) => {
                      setSelectedProfileId(profile.id);
                      setContactOpen(true);
                    }}
                  />
                ) : null}
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className="composer-zone">
          {selectedProfile ? (
            <div className="selection-strip">
              <div>
                <span className="selection-check" aria-hidden="true"><IconCheck size={11} /></span>
                <span><strong>{selectedProfile.displayName}</strong> ausgewählt</span>
              </div>
              <button type="button" onClick={() => setContactOpen(true)}>Termin oder Kontakt</button>
            </div>
          ) : null}
          <form className={`composer ${freeUsageExhausted ? "is-quota-exhausted" : ""}`} onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="chat-composer">Projekt oder Ergänzung beschreiben</label>
            <textarea
              id="chat-composer"
              ref={composerRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={messages.length ? "Projektbeschreibung einfügen oder weitere Informationen ergänzen …" : "Welchen Freelancer suchen Sie?"}
              rows={1}
              maxLength={12_000}
            />
            <div className="composer-bottom">
              <div className="composer-hint"><span aria-hidden="true"><IconPlus size={14} /></span> Details jederzeit frei ergänzen</div>
              <button
                className="send-button"
                type="submit"
                disabled={!draft.trim() || Boolean(pendingAssistant)}
                aria-label="Nachricht senden"
              >
                <IconArrowUp size={17} />
              </button>
            </div>
          </form>
          {usage && (freeUsageExhausted || freeUsageLow) ? (
            <p className={`composer-credit-status ${freeUsageExhausted ? "is-exhausted" : ""}`} role="status">
              {freeUsageExhausted
                ? `Das monatliche Nano-Kontingent ist aufgebraucht. Sie können weiter schreiben; XPORTAL speichert und gleicht Ihre Angaben regelbasiert ab. Neue Nano-Analysen sind ab ${formatUsageReset(usage.freeUsage.periodEnd)} möglich.`
                : `Noch ${formatCredits(usage.freeUsage.remaining)} von ${formatCredits(usage.freeUsage.limit)} kostenlosen Nano-Analysen in diesem Monat verfügbar.`}
            </p>
          ) : null}
          <p className="composer-disclosure">KI kann Fehler machen. Profile werden regelbasiert gefiltert; Sie wählen selbst. Keine Gesundheitsdaten oder vertraulichen Daten Dritter eingeben.</p>
        </div>
      </main>

      <aside className={`details-panel ${detailsOpen ? "is-open" : ""}`} aria-label="Projektübersicht">
        <ProjectDetails
          brief={brief}
          selectedProfile={selectedProfile}
          onContact={() => setContactOpen(true)}
        />
      </aside>

      {authOpen ? (
        <AuthDialog
          initialMode={authInitialMode}
          onClose={() => setAuthOpen(false)}
          onAuthenticated={() => void handleAuthenticated()}
          showToast={showToast}
        />
      ) : null}

      {contactOpen && selectedProfile ? (
        <ContactDialog
          profile={selectedProfile}
          onClose={() => setContactOpen(false)}
        />
      ) : null}

      {deleteOpen ? (
        <ConfirmDeleteDialog
          busy={dataAction === "delete"}
          onClose={() => setDeleteOpen(false)}
          onConfirm={() => void deleteData()}
        />
      ) : null}

      {createProjectOpen ? (
        <CreateProjectDialog
          onClose={() => setCreateProjectOpen(false)}
          onCreate={createProjectCollection}
        />
      ) : null}

      {manageChat ? (
        <ManageChatDialog
          chat={manageChat}
          collections={projectCollections}
          onClose={() => setManageChat(null)}
          onMove={(collectionId) => moveChatToProject(manageChat, collectionId)}
          onDelete={() => deleteChat(manageChat)}
        />
      ) : null}

      {agentsOpen ? <AgentsDialog onClose={() => setAgentsOpen(false)} /> : null}

      {toast ? <div className={`toast ${toast.tone}`} role="status" key={toast.id}>{toast.message}</div> : null}
    </div>
  );
}

function UsagePanel({
  usage,
  authenticated,
}: {
  usage: AiUsageSnapshot;
  authenticated: boolean;
}) {
  const exhausted = usage.freeUsage.exhausted || usage.freeUsage.remaining <= 0;
  const low = freeUsageIsLow(usage.freeUsage);
  const consumed = usage.freeUsage.used + usage.freeUsage.reserved;
  const progress = usage.freeUsage.limit > 0
    ? Math.min(100, Math.max(0, (consumed / usage.freeUsage.limit) * 100))
    : 0;

  return (
    <section className={`credit-usage ${exhausted ? "is-exhausted" : low ? "is-low" : ""}`} aria-label="KI-Nutzung">
      <div className="credit-usage-heading">
        <span>Freie Nano-Analysen · monatlich</span>
        <strong>{formatCredits(usage.freeUsage.remaining)}/{formatCredits(usage.freeUsage.limit)}</strong>
      </div>
      <div
        className="credit-progress"
        role="progressbar"
        aria-label={`${formatCredits(usage.freeUsage.remaining)} von ${formatCredits(usage.freeUsage.limit)} kostenlosen Analysen verfügbar`}
        aria-valuemin={0}
        aria-valuemax={Math.max(usage.freeUsage.limit, 1)}
        aria-valuenow={Math.min(consumed, Math.max(usage.freeUsage.limit, 1))}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <dl className="credit-stats">
        <div><dt>Verfügbar</dt><dd>{formatCredits(usage.freeUsage.remaining)}</dd></div>
        <div><dt>Genutzt</dt><dd>{formatCredits(usage.freeUsage.used)}</dd></div>
        {usage.freeUsage.reserved > 0 ? (
          <div><dt>In Bearbeitung</dt><dd>{formatCredits(usage.freeUsage.reserved)}</dd></div>
        ) : null}
        <div><dt>Monatslimit</dt><dd>{formatCredits(usage.freeUsage.limit)}</dd></div>
      </dl>
      <p className={`credit-status-copy ${exhausted ? "is-exhausted" : low ? "is-low" : ""}`}>
        {exhausted
          ? `Neue kostenlose Analysen sind ab ${formatUsageReset(usage.freeUsage.periodEnd)} wieder möglich.`
          : low
            ? "Ihr kostenloses Monatskontingent wird knapp."
            : "Eine erfolgreiche Projektanalyse zählt als eine Nutzung."}
      </p>
      {authenticated ? (
        <div className="product-credit-balance" aria-label="Gekaufte Produkt-Credits">
          <span>Produkt-Credits</span>
          <strong>
            {usage.productCredits
              ? `${formatCredits(usage.productCredits.available)} verfügbar`
              : "Wird geladen …"}
          </strong>
          <small>Getrennt vom kostenlosen Monatskontingent · Internetsuche: 30 Credits</small>
        </div>
      ) : null}
    </section>
  );
}

function WelcomeState({ onSuggestion }: { onSuggestion: (suggestion: Suggestion) => void }) {
  return (
    <section className="welcome-state" aria-labelledby="welcome-title">
      <div className="assistant-emblem" aria-hidden="true"><span><IconSpark size={22} /></span></div>
      <p className="eyebrow">Freelancer-Suche</p>
      <h1 id="welcome-title">Wobei können wir Sie unterstützen?</h1>
      <p className="welcome-copy">
        Beschreiben Sie das Projekt so, wie Sie es einem Kollegen erklären würden. Die KI strukturiert Ihre Angaben und zeigt bis zu drei nachvollziehbar passende Profile.
      </p>
      <div className="trust-row" aria-label="So funktioniert die Suche">
        <span><b>1</b> Frei beschreiben</span>
        <span className="trust-line" aria-hidden="true" />
        <span><b>2</b> Profile vergleichen</span>
        <span className="trust-line" aria-hidden="true" />
        <span><b>3</b> Kontakt starten</span>
      </div>
      <div className="suggestion-grid" aria-label="Beispielanfragen">
        {suggestions.map((suggestion) => (
          <button key={suggestion.label} type="button" onClick={() => onSuggestion(suggestion)}>
            <span className="suggestion-label">{suggestion.label}</span>
            <span className="suggestion-description">{suggestion.description}</span>
            <span className="suggestion-arrow" aria-hidden="true"><IconArrowRight size={17} /></span>
          </button>
        ))}
      </div>
      <p className="no-form-note"><span aria-hidden="true"><IconPen size={15} /></span> Kein Fragebogen – fehlende Angaben bleiben sichtbar als „nicht angegeben“.</p>
    </section>
  );
}

export function assistantAttribution(): {
  ariaLabel: string;
  author: string;
  badge: string | null;
} {
  // Persisted messages do not yet carry their own provider snapshot. A neutral
  // attribution stays truthful when one project contains both AI and fallback
  // turns; the adjacent analysis trace identifies the actual provider state.
  return { ariaLabel: "Nachricht von XPORTAL", author: "XPORTAL", badge: null };
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  if (message.role === "user") {
    return (
      <article className="message-row user-message" aria-label="Ihre Nachricht">
        <div className="message-content"><p>{message.content}</p></div>
      </article>
    );
  }
  const attribution = assistantAttribution();
  return (
    <article className="message-row assistant-message" aria-label={attribution.ariaLabel}>
      <div className="message-avatar" aria-hidden="true"><IconSpark size={15} /></div>
      <div className="message-content">
        <div className="message-author">
          {attribution.author}
          {attribution.badge ? <span>{attribution.badge}</span> : null}
        </div>
        <p>{message.content}</p>
      </div>
    </article>
  );
}

function PendingMessage({
  pending,
  onRetry,
  onRefresh,
}: {
  pending: PendingAssistant;
  onRetry: () => void;
  onRefresh: () => void;
}) {
  const failed = Boolean(pending.retryText || pending.action === "refresh");
  return (
    <article className={`message-row assistant-message ${failed ? "has-error" : ""}`} aria-label={failed ? "Fehler" : "Antwort wird erstellt"}>
      <div className="message-avatar" aria-hidden="true">{failed ? <IconAlertCircle size={15} /> : <IconSpark size={15} />}</div>
      <div className="message-content">
        <div className="message-author">XPORTAL</div>
        {pending.content ? <p>{pending.content}</p> : null}
        {!failed ? (
          <div className="thinking-line"><span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>{pending.progress}</div>
        ) : (
          <button
            className="text-button"
            type="button"
            onClick={pending.action === "refresh" ? onRefresh : onRetry}
          >
            {pending.action === "refresh" ? "Seite aktualisieren" : "Erneut versuchen"}
          </button>
        )}
      </div>
    </article>
  );
}

function ResultSection({
  brief,
  profiles,
  analysis,
  analysisMode,
  externalSearch,
  externalSearchState,
  onExternalSearch,
  isAccountUser,
  productCredits,
  onRequireLogin,
  selectedProfileId,
  onSelect,
  onContact,
}: {
  brief: StructuredBrief | null;
  profiles: FreelancerProfileResult[];
  analysis: AiAnalysisTrace | null;
  analysisMode: "ai" | "fallback" | null;
  externalSearch: ExternalFreelancerSearchResponse | null;
  externalSearchState: "idle" | "searching" | "error";
  onExternalSearch: () => void;
  isAccountUser: boolean;
  productCredits: ProductCreditSnapshot | null;
  onRequireLogin: () => void;
  selectedProfileId: string | null;
  onSelect: (profile: FreelancerProfileResult) => void;
  onContact: (profile: FreelancerProfileResult) => void;
}) {
  const searchCta = externalSearchCtaState(isAccountUser, productCredits);
  return (
    <section className="result-section" aria-label="Suchergebnis">
      {brief ? <BriefCard brief={brief} /> : null}
      {analysis ? <AnalysisTrace trace={analysis} profileCount={profiles.length} /> : null}
      <div className="shortlist-heading">
        <div>
          <p className="eyebrow">Regelbasierter Abgleich</p>
          <h2>
            {profiles.length
              ? `${profiles.length} passende ${profiles.length === 1 ? "Person" : "Profile"}`
              : "Keine passende Person gefunden"}
          </h2>
        </div>
        {profiles.length ? <span className="result-count">Maximal 3 Ergebnisse</span> : null}
      </div>
      {profiles.length ? (
        <>
          <p className="matching-disclosure">Die Reihenfolge folgt dokumentierten Kriterien wie Pflichtkompetenzen, Sprache, Arbeitsmodus und Verfügbarkeit. Die KI trifft keine Einstellungsentscheidung.</p>
          <div className="profile-list">
            {profiles.slice(0, 3).map((profile, index) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                position={index + 1}
                selected={selectedProfileId === profile.id}
                onSelect={() => onSelect(profile)}
                onContact={() => onContact(profile)}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="no-match-card">
            <div className="no-match-icon" aria-hidden="true"><IconSearch size={19} /></div>
            <div>
              <strong>
                {analysisMode === "fallback"
                  ? "Die sichere Basisanalyse hat keinen ausreichend passenden internen Treffer gefunden."
                  : "Aktuell gibt es keinen ausreichend passenden internen Treffer."}
              </strong>
              <p>
                {analysisMode === "fallback"
                  ? "Die internen Profile wurden regelbasiert abgeglichen. Sie können Angaben ergänzen oder die getrennte KI-Websuche nach öffentlich belegten Profilen starten."
                  : "Wir zeigen kein Ersatzprofil, wenn Pflichtkriterien nicht erfüllt sind. Ihre Angaben können Sie jederzeit im Chat ergänzen."}
              </p>
              {(analysis?.externalSearchAvailable ?? true) && externalSearch?.mode !== "openai" ? (
                <>
                  <button
                    className="external-search-button"
                    type="button"
                    onClick={searchCta.kind === "login" ? onRequireLogin : onExternalSearch}
                    disabled={externalSearchState === "searching" || searchCta.disabled}
                  >
                    {externalSearchState === "searching"
                      ? "KI sucht öffentlich zugängliche Profile …"
                      : searchCta.label}
                  </button>
                  {searchCta.kind === "ready" && externalSearchState !== "searching" ? (
                    <p className="external-search-cost-note">
                      Mit Ihrem Klick bestätigen Sie die einmalige Belastung von 30 Produkt-Credits (0,50 €).
                    </p>
                  ) : null}
                  {searchCta.kind === "insufficient" ? (
                    <p className="external-search-cost-note is-warning" role="status">
                      Ihr Credit-Guthaben reicht nicht aus. Es wird keine Internetsuche gestartet und nichts belastet.
                    </p>
                  ) : null}
                  {searchCta.kind === "login" ? (
                    <p className="external-search-cost-note">
                      Die kostenpflichtige Internetsuche ist nur mit einem angemeldeten Konto verfügbar.
                    </p>
                  ) : null}
                  {externalSearchState === "searching" ? (
                    <p className="external-search-progress" role="status">
                      <span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>
                      KI sucht · Quellen und Buchungslinks werden geprüft
                    </p>
                  ) : null}
                  {externalSearchState === "error" ? (
                    <button className="text-button" type="button" onClick={onExternalSearch}>Websuche erneut versuchen</button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
          {externalSearch ? <ExternalSearchResults result={externalSearch} /> : null}
        </>
      )}
    </section>
  );
}

function actualProviderLabel(trace: AiAnalysisTrace): string {
  if (trace.provider.actualTransport === "direct_openai") return "Direkte OpenAI API";
  if (trace.provider.actualTransport === "netlify_ai_gateway") return "Netlify AI Gateway";
  if (trace.provider.actualTransport === "custom_gateway") return "KI-Gateway";
  return "KI-Provider";
}

function failedProviderCallLabel(trace: AiAnalysisTrace): string {
  if (trace.provider.failureCategory === "auth_error") {
    return "OpenAI hat den API-Schlüssel abgelehnt";
  }
  if (trace.provider.failureCategory === "billing_or_quota") {
    return "OpenAI-Abrechnung oder Provider-Limit blockiert";
  }
  if (trace.provider.failureCategory === "rate_limit") {
    return "OpenAI-Anfragelimit vorübergehend erreicht";
  }
  if (trace.provider.failureCategory === "permission") {
    return "OpenAI-Projektberechtigung fehlt";
  }
  if (trace.provider.failureCategory === "model_unavailable") {
    return "Angefordertes OpenAI-Modell nicht verfügbar";
  }
  if (trace.provider.failureCategory === "timeout") {
    return "OpenAI-Aufruf hat das Zeitlimit erreicht";
  }
  if (trace.provider.failureCategory === "invalid_output") {
    return "OpenAI-Antwort war nicht verwendbar";
  }
  if (trace.provider.failureCategory === "application_limit") {
    return "XPORTAL-Nutzungslimit vor OpenAI erreicht";
  }
  if (trace.provider.failureCategory === "unconfigured") {
    return "Kein OpenAI-Schlüssel konfiguriert";
  }
  if (trace.provider.requestedTransport === "direct_openai") {
    return "OpenAI-Aufruf fehlgeschlagen";
  }
  if (trace.provider.requestedTransport === "netlify_ai_gateway") {
    return "Netlify-AI-Gateway-Aufruf fehlgeschlagen";
  }
  if (trace.provider.requestedTransport === "custom_gateway") {
    return "KI-Gateway-Aufruf fehlgeschlagen";
  }
  return "KI-Aufruf fehlgeschlagen";
}

export function providerStatusLabel(trace: AiAnalysisTrace): string {
  if (trace.provider.succeeded) {
    if (!trace.provider.fallback) return actualProviderLabel(trace);
    if (trace.provider.actualTransport === "direct_openai") {
      return "Basisanalyse · OpenAI-Antwort nicht verwendet";
    }
    return `Basisanalyse · Antwort über ${actualProviderLabel(trace)} nicht verwendet`;
  }
  if (trace.provider.failureCategory) {
    return `Basisanalyse · ${failedProviderCallLabel(trace)}`;
  }
  if (trace.provider.attempted) {
    return `Basisanalyse · ${failedProviderCallLabel(trace)}`;
  }
  if (trace.provider.configured) {
    return "Basisanalyse · KI-Aufruf nicht gestartet";
  }
  return "Basisanalyse · Kein KI-Provider konfiguriert";
}

export function providerModelLabel(trace: AiAnalysisTrace): string | null {
  if (trace.provider.succeeded) {
    return trace.provider.actualModel
      ? `Antwortmodell: ${trace.provider.actualModel}`
      : null;
  }
  if (!trace.provider.requestedModel) return null;
  return trace.provider.attempted
    ? `Angefordert: ${trace.provider.requestedModel}`
    : `Vorgesehen: ${trace.provider.requestedModel}`;
}

export function analysisDisclosure(trace: AiAnalysisTrace): string {
  if (trace.provider.succeeded && !trace.provider.fallback) {
    return "Die Angaben wurden anhand der bestätigten Provider-Antwort strukturiert. Die interne Auswahl bleibt ein reproduzierbarer Regelabgleich; Sie treffen die Entscheidung.";
  }
  if (trace.provider.succeeded) {
    return "Eine Provider-Antwort wurde empfangen, aber nicht für die Strukturierung verwendet. Das interne Freelancer-Matching wurde transparent mit der sicheren Basisanalyse ausgeführt.";
  }
  return "Die Anfrage wurde ohne bestätigte Provider-Antwort gespeichert. Das interne Freelancer-Matching wurde transparent mit der sicheren Basisanalyse ausgeführt.";
}

export function visibleAnalysisSteps(
  trace: AiAnalysisTrace,
  profileCount: number,
): AiAnalysisTrace["steps"] {
  const providerConfirmed = trace.provider.succeeded && !trace.provider.fallback;
  const nanoConfirmed = providerConfirmed &&
    trace.provider.actualModel?.toLocaleLowerCase("en-US").startsWith("gpt-5.4-nano");
  return [
    {
      label: providerConfirmed
        ? nanoConfirmed
          ? "Anforderungen mit GPT-5.4 Nano strukturiert"
          : "Anforderungen mit bestätigter KI-Antwort strukturiert"
        : "Anforderungen mit Basisanalyse strukturiert",
      detail: providerConfirmed
        ? "Die Angaben wurden in die vorgegebenen Projektfelder übertragen; fehlende Fakten bleiben unbekannt."
        : "Es lag keine verwendbare Nano-Antwort vor. Die gespeicherten Angaben wurden konservativ in die Projektfelder übertragen.",
      status: providerConfirmed ? "completed" : "warning",
    },
    {
      label: "Interne Profile regelbasiert abgeglichen",
      detail: "Aktive Profile wurden ohne KI-Auswahl anhand der dokumentierten Kriterien geprüft.",
      status: "completed",
    },
    {
      label: "Ergebnis vorbereitet",
      detail: profileCount > 0
        ? `${Math.min(profileCount, 3)} von maximal drei Profilen werden mit Gründen und bekannten Lücken angezeigt.`
        : "Es wurde kein ausreichend relevantes internes Profil gefunden; es wird kein Kandidat erfunden.",
      status: "completed",
    },
  ];
}

function AnalysisTrace({
  trace,
  profileCount,
}: {
  trace: AiAnalysisTrace;
  profileCount: number;
}) {
  const modelLabel = providerModelLabel(trace);
  const steps = visibleAnalysisSteps(trace, profileCount);
  return (
    <details className="analysis-trace" open>
      <summary>
        <span className="analysis-trace-icon" aria-hidden="true"><IconSpark size={15} /></span>
        <span>
          <strong>So wurde Ihre Anfrage bearbeitet</strong>
          <small>{providerStatusLabel(trace)}{modelLabel ? ` · ${modelLabel}` : ""}</small>
        </span>
        <span className="analysis-trace-toggle" aria-hidden="true"><IconChevronDown size={15} /></span>
      </summary>
      <ol>
        {steps.map((step, index) => (
          <li className={step.status === "warning" ? "is-warning" : ""} key={`${step.label}-${index}`}>
            <span aria-hidden="true">{step.status === "warning" ? <IconAlertCircle size={11} /> : <IconCheck size={11} />}</span>
            <div><strong>{step.label}</strong><p>{step.detail}</p></div>
          </li>
        ))}
      </ol>
      <p className="analysis-trace-disclosure">{analysisDisclosure(trace)}</p>
    </details>
  );
}

function ExternalSearchResults({ result }: { result: ExternalFreelancerSearchResponse }) {
  return (
    <section className="external-results" aria-label="Externe, nicht verifizierte Suchergebnisse">
      <div className="external-results-heading">
        <div><p className="eyebrow">Optionale Websuche</p><h3>Öffentlich gefundene Profile</h3></div>
        <span>Nicht durch XPORTAL verifiziert</span>
      </div>
      <p className="external-disclosure">{result.disclosure}</p>
      {result.candidates.length ? (
        <div className="external-profile-list">
          {result.candidates.map((candidate) => (
            <article className="external-profile-card" key={`${candidate.profileUrl}:${candidate.bookingUrl}`}>
              <div className="external-profile-topline"><span>Extern</span><span>Angaben vor Buchung prüfen</span></div>
              <h3>{candidate.displayName}</h3>
              <p className="external-role">{candidate.role}</p>
              <p>{candidate.summary}</p>
              {candidate.matchedRequirements.length ? (
                <div className="external-fact"><strong>Gefundene Übereinstimmungen</strong><p>{candidate.matchedRequirements.join(" · ")}</p></div>
              ) : null}
              {candidate.knownGaps.length ? (
                <div className="external-fact is-gap"><strong>Offen / ungeprüft</strong><p>{candidate.knownGaps.join(" · ")}</p></div>
              ) : null}
              <div className="external-links">
                <a href={candidate.profileUrl} target="_blank" rel="noopener noreferrer">Öffentliches Profil prüfen</a>
                <a className="external-booking-link" href={candidate.bookingUrl} target="_blank" rel="noopener noreferrer">Buchungslink öffnen <IconArrowUpRight size={12} /></a>
              </div>
              {candidate.sourceUrls.length ? (
                <p className="external-sources">Quellen: {candidate.sourceUrls.map((url, index) => (
                  <span key={url}>{index ? " · " : ""}<a href={url} target="_blank" rel="noopener noreferrer">{new URL(url).hostname}</a></span>
                ))}</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="external-empty">Auch in der Websuche wurde kein Profil mit belegbarem öffentlichen Profil und direktem HTTPS-Buchungslink gefunden.</p>
      )}
      <details className="external-trace">
        <summary>Suchschritte ansehen</summary>
        <p>{result.searchTrace.consultedSourceCount} öffentlich zugängliche Quellen wurden berücksichtigt; {result.searchTrace.returnedCandidateCount} Ergebnis(se) erfüllten die Ausgaberegeln.</p>
        {result.searchTrace.queries.length ? <ul>{result.searchTrace.queries.map((query) => <li key={query}>{query}</li>)}</ul> : null}
      </details>
    </section>
  );
}

function BriefCard({ brief }: { brief: StructuredBrief }) {
  const openFields = presentUnknownFields(brief.unknownFields);
  return (
    <article className="brief-card">
      <div className="brief-header">
        <div>
          <p className="eyebrow">Strukturierte Projektanalyse</p>
          <h2>{brief.projectTitle}</h2>
        </div>
        <span className="brief-status"><span aria-hidden="true"><IconCheck size={12} /></span> Strukturiert</span>
      </div>
      {brief.summary ? <p className="brief-summary">{brief.summary}</p> : null}
      <dl className="brief-grid brief-grid-detailed">
        <DetailTerm label="Pflichtkompetenzen" value={brief.requiredSkills.length ? brief.requiredSkills.join(", ") : null} />
        <DetailTerm label="Optionale Kompetenzen" value={brief.optionalSkills.length ? brief.optionalSkills.join(", ") : null} />
        <DetailTerm label="Sprache" value={brief.languages.length ? brief.languages.join(", ") : null} hint={languageHint(brief)} />
        <DetailTerm label="Arbeitsmodus / Ort" value={[brief.mode === "unknown" ? null : modeLabel(brief.mode), brief.location].filter(Boolean).join(" · ") || null} />
        <DetailTerm label="Start & Dauer" value={[brief.startWindow, brief.duration].filter(Boolean).join(" · ") || null} />
        <DetailTerm label="Budget / Satz" value={brief.budgetOrRate} />
        <DetailTerm label="Qualifikationen" value={brief.qualifications.length ? brief.qualifications.join(", ") : null} />
        <DetailTerm label="Verfügbarkeit" value={brief.availabilityRequirement} />
        <DetailTerm label="Vertragsanforderungen" value={brief.contractualRequirements.length ? brief.contractualRequirements.join(", ") : null} />
        <DetailTerm label="Weitere Rahmenbedingungen" value={brief.constraints.length ? brief.constraints.join(", ") : null} />
      </dl>
      {openFields.length ? (
        <div className="unknown-row"><span>Noch offen</span>{openFields.join(" · ")}</div>
      ) : null}
    </article>
  );
}

function DetailTerm({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={!value ? "is-unknown" : ""}>
        {value ?? "Nicht angegeben"}
        {value && hint ? <small className="detail-hint">{hint}</small> : null}
      </dd>
    </div>
  );
}

/**
 * A required language filters profiles; a detected one only reflects how the
 * request was written. Without this hint the second reads as the first.
 */
function languageHint(brief: StructuredBrief): string | undefined {
  return brief.languageSource === "detected" ? "aus der Anfrage abgeleitet" : undefined;
}

function ProfileCard({
  profile,
  position,
  selected,
  onSelect,
  onContact,
}: {
  profile: FreelancerProfileResult;
  position: number;
  selected: boolean;
  onSelect: () => void;
  onContact: () => void;
}) {
  const verifiedFacts = profile.facts.filter((fact) => fact.verification === "verified");
  const selfReportedFacts = profile.facts.filter((fact) => fact.verification === "self-reported");
  return (
    <article className={`profile-card ${selected ? "is-selected" : ""}`}>
      <div className="profile-rank" aria-label={`Ergebnis ${position}`}>{position.toString().padStart(2, "0")}</div>
      <div className="profile-main">
        <header className="profile-header">
          <div className="profile-identity">
            <div className="profile-avatar" aria-hidden="true">{initials(profile.displayName)}</div>
            <div>
              <h3>{profile.displayName}</h3>
              <p>{profile.role}</p>
            </div>
          </div>
          <div className="profile-badges">
            <span className={`availability ${profile.availabilityStatus}`}>{availabilityLabel(profile.availabilityStatus)}</span>
          </div>
        </header>

        {profile.experienceSummary ? <p className="experience-summary">{profile.experienceSummary}</p> : null}

        <div className="profile-tags">
          {profile.skillTags.slice(0, 7).map((skill) => <span key={skill}>{skill}</span>)}
        </div>

        <div className="match-columns">
          <div className="match-column reasons">
            <h4><span aria-hidden="true"><IconCheck size={13} /></span> Warum passend</h4>
            {profile.matchReasons.length ? (
              <ul>{profile.matchReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            ) : <p className="unknown-text">Keine Begründung übermittelt</p>}
          </div>
          <div className="match-column gaps">
            <h4><span aria-hidden="true"><IconAlertCircle size={13} /></span> Bekannte Lücken</h4>
            {profile.knownGaps.length ? (
              <ul>{profile.knownGaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
            ) : <p>Keine bekannten Lücken im Abgleich</p>}
          </div>
        </div>

        <div className="fact-row">
          {verifiedFacts.length ? (
            <FactGroup label="Verifiziert" facts={verifiedFacts.map((fact) => fact.value)} verified />
          ) : null}
          <FactGroup label="Selbstauskunft" facts={selfReportedFacts.map((fact) => fact.value)} />
        </div>

        <dl className="profile-meta-grid">
          <DetailTerm label="Arbeitsmodus" value={profile.remoteMode === "unknown" ? null : modeLabel(profile.remoteMode)} />
          <DetailTerm label="Ort" value={profile.location} />
          <DetailTerm label="Honorar" value={profile.rate} />
          <DetailTerm label="Verfügbarkeit geprüft" value={profile.availabilityUpdatedAt ? formatDateTime(profile.availabilityUpdatedAt) : null} />
        </dl>

        {profile.referenceStatus ? (
          <p className={`reference-note ${profile.referenceStatus === "Verifiziert" ? "is-verified" : "is-unverified"}`}>
            <span aria-hidden="true">{profile.referenceStatus === "Verifiziert" ? <IconCheck size={12} /> : <IconInfo size={12} />}</span> Referenzstatus: {profile.referenceStatus}
          </p>
        ) : null}

        <footer className="profile-footer">
          <div>
            <strong>{profile.bookingUrl ? "Direktes Erstgespräch" : "Historisches Match"}</strong>
            <span>{profile.bookingUrl ? "Der Booking-Link des Freelancers öffnet sich in einem neuen Tab." : "Dieses Profil ist aktuell nicht direkt buchbar."}</span>
          </div>
          <div className="profile-actions">
            {selected ? (
              <button className="secondary-action" type="button" onClick={onContact}><IconCheck size={13} /> Kontaktoptionen</button>
            ) : (
              <button className="secondary-action" type="button" onClick={onSelect}>Profil merken</button>
            )}
            {profile.bookingUrl ? (
              <a
                className="primary-action"
                href={profile.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Meeting mit ${profile.displayName} buchen`}
              >
                Meeting buchen <IconArrowRight size={13} />
              </a>
            ) : (
              <button className="primary-action" type="button" disabled>Nicht mehr buchbar</button>
            )}
          </div>
        </footer>
      </div>
    </article>
  );
}

function FactGroup({ label, facts, verified = false }: { label: string; facts: string[]; verified?: boolean }) {
  const visibleFacts = facts.slice(0, 5);
  const remaining = facts.length - visibleFacts.length;
  return (
    <div className="fact-group">
      <span className={verified ? "verified-label" : "reported-label"}>{verified ? <IconCheck size={12} /> : <IconInfo size={12} />} {label}</span>
      <p>
        {visibleFacts.length ? visibleFacts.join(" · ") : "Keine Angaben"}
        {remaining > 0 ? ` · +${remaining} weitere Angaben` : ""}
      </p>
    </div>
  );
}

function ProjectDetails({
  brief,
  selectedProfile,
  onContact,
}: {
  brief: StructuredBrief | null;
  selectedProfile: FreelancerProfileResult | null;
  onContact: () => void;
}) {
  return (
    <div className="details-inner">
      <div className="details-heading">
        <p className="eyebrow">Projekt</p>
        <h2>Übersicht</h2>
      </div>
      {brief ? (
        <>
          <div className="project-status-line"><span aria-hidden="true"><IconCheck size={11} /></span><div><strong>Anfrage strukturiert</strong><small>Angaben können jederzeit ergänzt werden</small></div></div>
          <dl className="side-details">
            <DetailTerm label="Projekt" value={brief.projectTitle || null} />
            <DetailTerm label="Pflichtkompetenzen" value={brief.requiredSkills.length ? brief.requiredSkills.join(", ") : null} />
            <DetailTerm label="Optionale Kompetenzen" value={brief.optionalSkills.length ? brief.optionalSkills.join(", ") : null} />
            <DetailTerm label="Sprache" value={brief.languages.length ? brief.languages.join(", ") : null} hint={languageHint(brief)} />
            <DetailTerm label="Modus / Ort" value={[brief.mode === "unknown" ? null : modeLabel(brief.mode), brief.location].filter(Boolean).join(" · ") || null} />
            <DetailTerm label="Budget / Satz" value={brief.budgetOrRate} />
            <DetailTerm label="Qualifikationen" value={brief.qualifications.length ? brief.qualifications.join(", ") : null} />
            <DetailTerm label="Verfügbarkeit" value={brief.availabilityRequirement} />
            <DetailTerm label="Vertragsanforderungen" value={brief.contractualRequirements.length ? brief.contractualRequirements.join(", ") : null} />
            <DetailTerm label="Rahmenbedingungen" value={brief.constraints.length ? brief.constraints.join(", ") : null} />
          </dl>
        </>
      ) : (
        <div className="details-empty">
          <span aria-hidden="true"><IconDocument size={22} /></span>
          <strong>Noch keine Projektdaten</strong>
          <p>Schreiben Sie frei in den Chat. Die Übersicht entsteht aus Ihren Angaben.</p>
        </div>
      )}

      {selectedProfile ? (
        <div className="selected-side-card">
          <span className="side-card-label">Ausgewählt</span>
          <div className="selected-person"><span>{initials(selectedProfile.displayName)}</span><div><strong>{selectedProfile.displayName}</strong><small>{selectedProfile.role}</small></div></div>
          <button type="button" onClick={onContact}>Termin oder Kontakt <IconArrowRight size={13} /></button>
          <small>Sie können vorher weiter im Chat ergänzen.</small>
        </div>
      ) : null}

      <div className="ai-note"><span aria-hidden="true"><IconInfo size={11} /></span><p><strong>Transparente Unterstützung</strong>Die KI strukturiert Ihre Anfrage. Profile werden nach festen, überprüfbaren Regeln gefiltert.</p></div>
    </div>
  );
}

function Modal({ titleId, onClose, children, size = "default" }: { titleId: string; onClose: () => void; children: ReactNode; size?: "default" | "large" }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && cardRef.current) {
        const focusable = Array.from(
          cardRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={cardRef} className={`modal-card ${size === "large" ? "is-large" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button ref={closeRef} className="modal-close" type="button" onClick={onClose} aria-label="Dialog schließen"><IconClose size={17} /></button>
        {children}
      </section>
    </div>
  );
}

function AuthDialog({
  initialMode,
  onClose,
  onAuthenticated,
  showToast,
}: {
  initialMode: AuthDialogMode;
  onClose: () => void;
  onAuthenticated: () => void;
  showToast: (message: string, tone?: ToastState["tone"]) => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [busy, setBusy] = useState<"google" | "microsoft" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectProvider = async (provider: "google" | "microsoft") => {
    setBusy(provider);
    setError(null);
    try {
      await startOauthUpgrade(provider);
    } catch (providerError) {
      setError(providerError instanceof Error ? providerError.message : "Anmeldung konnte nicht gestartet werden.");
      setBusy(null);
    }
  };

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("email");
    setError(null);
    if ((mode === "register" || mode === "set-password") && password !== passwordRepeat) {
      setError("Die beiden Passwörter stimmen nicht überein.");
      setBusy(null);
      return;
    }
    try {
      if (mode === "login") {
        await signInExistingAccount(email, password);
        showToast("Anmeldung erfolgreich. Ihre Auswahl wird fortgesetzt.");
        onAuthenticated();
      } else if (mode === "register") {
        const result = await registerEmailAccount(email, password);
        if (result.confirmationRequired) {
          setConfirmationSent(true);
          setBusy(null);
        } else {
          showToast("Konto erstellt. Ihre Auswahl wird fortgesetzt.");
          onAuthenticated();
        }
      } else if (mode === "recover") {
        await requestPasswordRecovery(email);
        setConfirmationSent(true);
        setBusy(null);
      } else {
        await setAccountPassword(password);
        const cleanUrl = `${window.location.pathname}${window.location.hash}`;
        window.history.replaceState({}, "", cleanUrl);
        showToast("Ihr Konto ist eingerichtet. Ihre Auswahl wird fortgesetzt.");
        onAuthenticated();
      }
    } catch (emailError) {
      const fallback = mode === "login"
        ? "E-Mail oder Passwort ist nicht korrekt. Nutzen Sie bei Bedarf ‚Passwort vergessen?‘."
        : mode === "recover"
          ? "Der Wiederherstellungslink konnte gerade nicht versendet werden."
          : mode === "register"
            ? "Das Konto konnte gerade nicht erstellt werden. Prüfen Sie E-Mail und Passwort."
            : "Das neue Passwort konnte gerade nicht gespeichert werden.";
      const message = emailError instanceof Error ? emailError.message.toLowerCase() : "";
      setError(
        mode === "login" && (message.includes("invalid login") || message.includes("invalid credentials"))
          ? "E-Mail oder Passwort ist nicht korrekt. Nutzen Sie bei Bedarf ‚Passwort vergessen?‘."
          : fallback,
      );
      setBusy(null);
    }
  };

  return (
    <Modal titleId="auth-title" onClose={onClose}>
      <div className="auth-dialog">
        <span className="dialog-eyebrow">Auswahl sichern</span>
        <h2 id="auth-title">
          {mode === "set-password"
            ? "Neues Passwort festlegen"
            : mode === "recover"
              ? "Zugang wiederherstellen"
              : mode === "register"
                ? "Konto erstellen"
                : "Anmelden und direkt fortfahren"}
        </h2>
        <p>
          {mode === "set-password"
            ? "Legen Sie jetzt ein neues Passwort für Ihr bestätigtes Konto fest."
            : mode === "recover"
              ? "Wir senden einen sicheren Link an Ihre E-Mail-Adresse. Ihre aktuelle Anfrage bleibt dabei erhalten."
              : "Ihre Anfrage bleibt erhalten. Nach der Anmeldung kehren Sie genau zu Ihrem ausgewählten Profil zurück."}
        </p>

        {mode !== "set-password" && mode !== "recover" ? (
          <>
            {GOOGLE_AUTH_ENABLED || MICROSOFT_AUTH_ENABLED ? (
              <>
                <div className="provider-buttons">
                  {GOOGLE_AUTH_ENABLED ? (
                    <button type="button" onClick={() => void connectProvider("google")} disabled={Boolean(busy)}><span className="provider-letter" aria-hidden="true">G</span>{busy === "google" ? "Google wird geöffnet …" : "Mit Google fortfahren"}</button>
                  ) : null}
                  {MICROSOFT_AUTH_ENABLED ? (
                    <button type="button" onClick={() => void connectProvider("microsoft")} disabled={Boolean(busy)}><span className="provider-letter microsoft" aria-hidden="true">M</span>{busy === "microsoft" ? "Microsoft wird geöffnet …" : "Mit Microsoft fortfahren"}</button>
                  ) : null}
                </div>
                <div className="or-divider"><span>oder</span></div>
              </>
            ) : null}
            <div className="auth-mode-tabs" role="tablist" aria-label="E-Mail-Zugang">
              <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(null); }}>Bestehendes Konto</button>
              <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(null); }}>Neues Konto</button>
            </div>
          </>
        ) : null}

        {confirmationSent ? (
          <div className="confirmation-state" role="status">
            <span aria-hidden="true"><IconCheck size={16} /></span>
            <h3>{mode === "recover" ? "Wiederherstellungslink versendet" : "Bestätigungslink versendet"}</h3>
            <p>
              {mode === "recover" ? (
                <>Öffnen Sie den Link in der E-Mail an <strong>{email}</strong> und legen Sie anschließend ein neues Passwort fest.</>
              ) : (
                <>Öffnen Sie den Link in der E-Mail an <strong>{email}</strong>, um Ihr Konto mit dem gewählten Passwort zu aktivieren.</>
              )}
            </p>
            <button type="button" onClick={onClose}>Verstanden</button>
          </div>
        ) : (
          <form className="email-login" onSubmit={submitEmail}>
            {mode !== "set-password" ? (
              <>
                <label htmlFor="login-email">E-Mail-Adresse</label>
                <input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
              </>
            ) : null}
            {mode === "login" || mode === "register" || mode === "set-password" ? (
              <>
                <label htmlFor="login-password">{mode === "set-password" ? "Neues Passwort" : "Passwort"}</label>
                <input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required />
              </>
            ) : null}
            {mode === "register" || mode === "set-password" ? (
              <>
                <label htmlFor="login-password-repeat">Passwort wiederholen</label>
                <input id="login-password-repeat" type="password" value={passwordRepeat} onChange={(event) => setPasswordRepeat(event.target.value)} autoComplete="new-password" minLength={8} required />
              </>
            ) : null}
            {mode === "login" ? (
              <button className="forgot-password" type="button" onClick={() => { setMode("recover"); setError(null); setPassword(""); }}>
                Passwort vergessen?
              </button>
            ) : null}
            {mode === "recover" ? (
              <button className="back-to-login" type="button" onClick={() => { setMode("login"); setError(null); }}>
                Zurück zur Anmeldung
              </button>
            ) : null}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="auth-submit" type="submit" disabled={Boolean(busy)}>
              {busy === "email"
                ? "Bitte warten …"
                : mode === "login"
                  ? "Mit E-Mail anmelden"
                  : mode === "register"
                    ? "Konto erstellen"
                    : mode === "recover"
                      ? "Wiederherstellungslink senden"
                      : "Passwort speichern & fortfahren"}
            </button>
          </form>
        )}
        <p className="auth-privacy">Die Anmeldung dient dazu, Projekte geräteübergreifend zuzuordnen und eine Profilwahl sicher fortzusetzen.</p>
      </div>
    </Modal>
  );
}

function SidebarChatList({
  chats,
  activeProjectId,
  loadingProjectId,
  onOpen,
  onManage,
}: {
  chats: ProjectListItem[];
  activeProjectId: string | null;
  loadingProjectId: string | null;
  onOpen: (chat: ProjectListItem) => void;
  onManage: (chat: ProjectListItem) => void;
}) {
  if (!chats.length) return <p className="sidebar-section-empty">Keine unzugeordneten Chats</p>;
  return (
    <ul className="project-list">
      {chats.map((chat) => (
        <li key={chat.id} className="sidebar-chat-row">
          <button
            type="button"
            className={`sidebar-chat-open${activeProjectId === chat.id ? " active" : ""}`}
            onClick={() => onOpen(chat)}
            aria-current={activeProjectId === chat.id ? "page" : undefined}
          >
            <span className="project-title">{chat.title}</span>
            <span className="project-meta">
              {loadingProjectId === chat.id ? "Wird geladen …" : formatRelativeDate(chat.updatedAt)}
            </span>
          </button>
          <button
            className="sidebar-chat-manage"
            type="button"
            onClick={() => onManage(chat)}
            aria-label={`${chat.title} verwalten`}
          >
            •••
          </button>
        </li>
      ))}
    </ul>
  );
}

function CreateProjectDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string) => Promise<ProjectCollectionItem>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(name.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Projekt konnte nicht erstellt werden.");
      setBusy(false);
    }
  };
  return (
    <Modal titleId="create-project-title" onClose={onClose}>
      <form className="project-dialog" onSubmit={submit}>
        <span className="dialog-eyebrow">Mehrere Chats organisieren</span>
        <h2 id="create-project-title">Neues Projekt</h2>
        <p>Ein Projekt ist ein Ordner, in dem Sie mehrere zusammengehörige Chats speichern können.</p>
        <label htmlFor="project-name">Projektname</label>
        <input id="project-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus placeholder="z. B. SAP-Rollout 2026" />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <button className="secondary-action" type="button" onClick={onClose} disabled={busy}>Abbrechen</button>
          <button className="primary-action" type="submit" disabled={busy || !name.trim()}>{busy ? "Wird erstellt …" : "Projekt erstellen"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ManageChatDialog({
  chat,
  collections,
  onClose,
  onMove,
  onDelete,
}: {
  chat: ProjectListItem;
  collections: ProjectCollectionItem[];
  onClose: () => void;
  onMove: (collectionId: string | null) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Aktion fehlgeschlagen.");
      setBusy(false);
    }
  };
  return (
    <Modal titleId="manage-chat-title" onClose={onClose}>
      <div className="project-dialog manage-chat-dialog">
        <span className="dialog-eyebrow">Chat verwalten</span>
        <h2 id="manage-chat-title">{chat.title}</h2>
        <p>Speichern Sie den Chat in einem Projekt oder löschen Sie ihn dauerhaft.</p>
        <div className="project-destination-list">
          <button type="button" className={!chat.collectionId ? "active" : ""} disabled={busy} onClick={() => void run(() => onMove(null))}>Ohne Projekt</button>
          {collections.map((collection) => (
            <button key={collection.id} type="button" className={chat.collectionId === collection.id ? "active" : ""} disabled={busy} onClick={() => void run(() => onMove(collection.id))}>{collection.name}</button>
          ))}
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions split-actions">
          {confirmDelete ? (
            <button className="danger-action" type="button" disabled={busy} onClick={() => void run(onDelete)}>{busy ? "Wird gelöscht …" : "Löschen bestätigen"}</button>
          ) : (
            <button className="danger-text-action" type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>Chat löschen</button>
          )}
          <button className="secondary-action" type="button" onClick={onClose} disabled={busy}>Schließen</button>
        </div>
      </div>
    </Modal>
  );
}

function AgentsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal titleId="agents-title" onClose={onClose}>
      <div className="agents-dialog">
        <span className="agent-glyph is-large" aria-hidden="true">A</span>
        <span className="dialog-eyebrow">Vorbereitet für die nächste Ausbaustufe</span>
        <h2 id="agents-title">Agenten</h2>
        <p>Hier können zukünftig eigene spezialisierte Agenten angeschlossen werden. Im aktuellen Freelancer-MVP ist noch kein Agent aktiviert und es werden keine autonomen Aktionen ausgeführt.</p>
        <button className="primary-action" type="button" onClick={onClose}>Verstanden</button>
      </div>
    </Modal>
  );
}

function ContactDialog({ profile, onClose }: { profile: FreelancerProfileResult; onClose: () => void }) {
  return (
    <Modal titleId="contact-title" onClose={onClose} size="large">
      <div className="contact-dialog">
        <div className="contact-dialog-header">
          <div className="contact-profile-avatar" aria-hidden="true">{initials(profile.displayName)}</div>
          <div><span className="dialog-eyebrow">Reales Profil ausgewählt</span><h2 id="contact-title">Termin mit {profile.displayName}</h2><p>{profile.role}</p></div>
        </div>
        <div className="contact-layout">
          <div className="contact-copy">
            <div className="continue-note"><span aria-hidden="true"><IconPlus size={17} /></span><p><strong>Noch etwas ergänzen?</strong>Schließen Sie dieses Fenster und schreiben Sie frei im Chat weiter. Die Terminoption bleibt sichtbar.</p></div>
          </div>
          <div className="calendar-area">
            <div className="calendar-consent">
              <div className="calendar-symbol" aria-hidden="true"><span><IconCalendar size={26} /></span><small>BOOKING</small></div>
              <h3>{profile.bookingUrl ? "Direkt Termin wählen" : "Aktuell nicht buchbar"}</h3>
              <p>{profile.bookingUrl ? `Die Buchungsseite von ${profile.displayName} wird erst nach Ihrem Klick in einem neuen Tab geöffnet.` : "Der frühere Treffer bleibt zur Nachvollziehbarkeit sichtbar, aber es ist kein aktueller Booking-Link freigegeben."}</p>
              {profile.bookingUrl ? (
                <a
                  className="booking-link-action"
                  href={profile.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Meeting buchen <IconArrowRight size={13} />
                </a>
              ) : (
                <span className="booking-unavailable">Aktuell kein direkter Booking-Link</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDeleteDialog({ busy, onClose, onConfirm }: { busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal titleId="delete-title" onClose={onClose}>
      <div className="delete-dialog">
        <span className="danger-symbol" aria-hidden="true"><IconAlertTriangle size={19} /></span>
        <h2 id="delete-title">Anwendungsdaten löschen?</h2>
        <p>Ihre Projekte, Nachrichten und gespeicherten Ergebnisse werden entsprechend der geltenden Aufbewahrungsregeln gelöscht oder anonymisiert. Dieser Schritt kann nicht rückgängig gemacht werden.</p>
        <div className="dialog-actions">
          <button className="secondary-action" type="button" onClick={onClose} disabled={busy}>Abbrechen</button>
          <button className="danger-action" type="button" onClick={onConfirm} disabled={busy}>{busy ? "Wird gelöscht …" : "Daten endgültig löschen"}</button>
        </div>
      </div>
    </Modal>
  );
}
