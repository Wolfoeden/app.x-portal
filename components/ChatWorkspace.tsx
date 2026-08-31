"use client";

import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ACCOUNT_MONTHLY_CREDITS,
  BRIEF_ANALYSIS_CREDITS,
  CREDIT_PLANS,
  creditPlan,
} from "@/lib/ai/credit-policy";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { BrandMark } from "@/components/BrandMark";
import { openCookieSettings } from "@/components/CookieConsent";
import { LegalFooter } from "@/components/LegalFooter";
import {
  AgentDetails,
  AgentDirectory,
  agentById,
  agentCatalog,
  agentTaskById,
  type AgentDefinition,
  type AgentTask,
} from "@/components/AgentDirectory";
import {
  IconAlertCircle,
  IconArrowRight,
  IconArrowUp,
  IconChat,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconFolder,
  IconMenu,
  IconPanelRight,
  IconPlus,
  IconSearch,
  IconSpark,
} from "@/components/icons";
import {
  claimPreparedGuestWorkspace,
  ensureGuestSession,
  signOut as signOutAccount,
} from "@/lib/auth/browser";

import { AccountSummary, CreditPlansDialog } from "./chat/account";
import {
  AuthDialog,
  ConfirmDeleteDialog,
  ContactDialog,
  CreateProjectDialog,
  ManageChatDialog,
} from "./chat/dialogs";
import {
  formatCredits,
  initials,
  isRecord,
  nullableString,
  type AuthDialogMode,
  type ToastState,
} from "./chat/shared";
import { ProjectDetails, ResultSection, SavedProfileList } from "./chat/results";
import {
  type AiAnalysisTrace,
  type AiUsageSnapshot,
  type PlanTeamSnapshot,
  type SavedFreelancer,
  type AiUsageUpdate,
  type AvailabilityStatus,
  type ChatApiPaths,
  type ChatRequest,
  type ChatResponse,
  type ChatStreamEvent,
  type ConversationMessage,
  type CvAccess,
  type ExternalFreelancerCandidate,
  type ExternalFreelancerSearchResponse,
  type FreelancerProfileResult,
  type CreditBalanceSnapshot,
  type MatchingStatus,
  type ProjectDetailResponse,
  type ProjectCollectionItem,
  type ProjectListItem,
  type ProjectMode,
  type SessionResponse,
  type StructuredBrief,
  type StructuredRequirementGroup,
  type VerificationLevel,
  defaultChatApiPaths,
} from "./chat-contract";


export function sidebarAccountButtonClassName(isAccountUser: boolean): string {
  return `sidebar-account-button${isAccountUser ? "" : " is-guest-login"}`;
}

/**
 * Examples, not a menu. They are worded broadly on purpose: the catalogue
 * spans roughly fifty distinct roles — development, marketing, design, AI,
 * consulting — and four narrow labels made it look like the platform only
 * covered those four.
 */
const SIDEBAR_MIN_WIDTH = 224;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_DEFAULT_WIDTH = 288;
const SIDEBAR_WIDTH_STORAGE_KEY = "xportal.sidebar-width.v2";

function clampSidebarWidth(value: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)));
}

type SidebarPreferences = { width: number };

/**
 * The saved sidebar layout, modelled as the external store it actually is.
 *
 * localStorage cannot be read while rendering without desyncing from the
 * server-rendered markup, and reading it in an effect would mean calling
 * setState from an effect body. `useSyncExternalStore` is the supported way in
 * and matches how this file already reads the platform.
 */
const SERVER_SIDEBAR_PREFERENCES: SidebarPreferences = {
  width: SIDEBAR_DEFAULT_WIDTH,
};

let sidebarPreferences: SidebarPreferences = SERVER_SIDEBAR_PREFERENCES;
let sidebarPreferencesLoaded = false;
const sidebarPreferenceListeners = new Set<() => void>();

function readStoredSidebarPreferences(): SidebarPreferences {
  try {
    const storedWidth = Number.parseInt(
      window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) ?? "",
      10,
    );
    return {
      width: Number.isFinite(storedWidth)
        ? clampSidebarWidth(storedWidth)
        : SIDEBAR_DEFAULT_WIDTH,
    };
  } catch {
    // Blocked or full storage must never stop the workspace from rendering.
    return SERVER_SIDEBAR_PREFERENCES;
  }
}

function subscribeSidebarPreferences(listener: () => void) {
  if (!sidebarPreferencesLoaded) {
    sidebarPreferencesLoaded = true;
    sidebarPreferences = readStoredSidebarPreferences();
  }
  sidebarPreferenceListeners.add(listener);
  return () => {
    sidebarPreferenceListeners.delete(listener);
  };
}

/** Identity is stable between writes, which is what getSnapshot requires. */
const getSidebarPreferences = () => sidebarPreferences;
const getServerSidebarPreferences = () => SERVER_SIDEBAR_PREFERENCES;

function writeSidebarPreferences(next: SidebarPreferences, persist = true) {
  sidebarPreferences = next;
  if (persist) {
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(next.width));
    } catch {
      // The preference is a convenience, never a requirement.
    }
  }
  for (const listener of sidebarPreferenceListeners) listener();
}

/**
 * Draggable project sidebar. The default width truncates most chat titles,
 * and the only way to read one was to hover for the tooltip.
 */
function useSidebarWidth() {
  const preferences = useSyncExternalStore(
    subscribeSidebarPreferences,
    getSidebarPreferences,
    getServerSidebarPreferences,
  );
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  const startSidebarResize = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      // Primary button only: a right-click or a second touch point must not
      // leave the layout stuck mid-resize.
      if (event.button !== 0) return;
      event.preventDefault();
      setIsResizingSidebar(true);

      const startX = event.clientX;
      const startWidth = sidebarPreferences.width;

      const onMove = (moveEvent: PointerEvent) => {
        // Not persisted per frame — only the released width is written.
        writeSidebarPreferences(
          {
            ...sidebarPreferences,
            width: clampSidebarWidth(startWidth + moveEvent.clientX - startX),
          },
          false,
        );
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        setIsResizingSidebar(false);
        writeSidebarPreferences(sidebarPreferences);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [],
  );

  const resetSidebarWidth = useCallback(() => {
    writeSidebarPreferences({
      ...sidebarPreferences,
      width: SIDEBAR_DEFAULT_WIDTH,
    });
  }, []);

  return {
    sidebarWidth: preferences.width,
    startSidebarResize,
    resetSidebarWidth,
    isResizingSidebar,
  };
}

/**
 * Three ready-to-send briefs instead of four category headings.
 *
 * Each aims at a cluster the catalogue can actually serve: measured on
 * 2026-08-21 across the 66 matchable profiles, at least two skill hits are
 * available for performance marketing (9 profiles), AI automation (8) and
 * requirements engineering (6). Classic software development reaches 4 and is
 * deliberately not offered, because the example a visitor clicks first sets
 * the expectation the result then has to meet.
 *
 * No rate is named: 52 of those 66 profiles carry none, so a budget in the
 * example would promise a filter the data cannot honour.
 */
const suggestions = [
  {
    label: "KI & Automatisierung",
    description: "LLM · RAG · n8n · AI Agents",
    draftPrefix:
      "Wir wollen wiederkehrende Abläufe mit KI automatisieren: n8n-Workflows bauen und ein LLM an unsere Bestandssysteme anbinden, perspektivisch auch RAG auf unsere eigenen Dokumente. Projektbasis, remote, Start kurzfristig.",
    intro:
      "Ein Beispiel-Brief steht im Eingabefeld — passen Sie ihn an oder schicken Sie ihn direkt ab. Was Sie nicht erwähnen, ergänze ich nicht.",
  },
  {
    label: "SAP",
    description: "S/4HANA · FI/CO · HCM · Migration",
    draftPrefix:
      "Wir suchen Unterstützung im SAP-Umfeld: SAP S/4HANA, Anbindung an unsere bestehenden Systeme und Begleitung der Migration. Erfahrung mit SAP FI/CO oder SAP HCM ist willkommen. Projektbasis, remote möglich, Start in den nächsten Wochen.",
    intro:
      "Ein Beispiel-Brief steht im Eingabefeld — passen Sie ihn an oder schicken Sie ihn direkt ab. Was Sie nicht erwähnen, ergänze ich nicht.",
  },
  {
    label: "1st & 2nd Level Support",
    description: "IT Support · Helpdesk · L1/L2",
    draftPrefix:
      "Wir brauchen Verstärkung im IT Support: 1st und 2nd Level, Helpdesk für unsere Mitarbeitenden, Ticketbearbeitung und Störungsbehebung. Remote möglich, Start kurzfristig.",
    intro:
      "Ein Beispiel-Brief steht im Eingabefeld — passen Sie ihn an oder schicken Sie ihn direkt ab. Was Sie nicht erwähnen, ergänze ich nicht.",
  },
] as const;

type Suggestion = (typeof suggestions)[number];


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
  view?: "chat" | "agents" | "team";
  /** Development-only visual fixture; its presence disables all data loading. */
  previewData?: {
    auth: SessionResponse;
    projects: ProjectListItem[];
    messages: ConversationMessage[];
    brief: StructuredBrief;
    profiles: FreelancerProfileResult[];
    analysis: AiAnalysisTrace;
    usage: AiUsageSnapshot;
  };
}

type AuthView = SessionResponse;

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


function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}


function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function percentValue(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : null;
}

function normalizeMatchingStatus(value: unknown): MatchingStatus | null {
  return value === "ranked" ||
    value === "needs_clarification" ||
    value === "no_reliable_match"
    ? value
    : null;
}

function normalizeRequirementGroup(
  value: unknown,
): StructuredRequirementGroup | null {
  if (!isRecord(value)) return null;
  const category = value.category;
  const priority = value.priority;
  const operator = value.operator;
  const values = stringList(value.values);
  if (
    ![
      "skill",
      "language",
      "work_mode",
      "location",
      "qualification",
      "contractual",
    ].includes(String(category)) ||
    !["hard", "core", "optional"].includes(String(priority)) ||
    !["all_of", "any_of"].includes(String(operator)) ||
    values.length === 0 ||
    (operator === "any_of" && values.length < 2)
  ) {
    return null;
  }
  return {
    id: stringValue(value.id, `${String(category)}:${values.join("|")}`),
    category: category as StructuredRequirementGroup["category"],
    priority: priority as StructuredRequirementGroup["priority"],
    operator: operator as StructuredRequirementGroup["operator"],
    values,
  };
}

export function normalizeUsageUpdate(value: unknown): AiUsageUpdate | null {
  const envelope = isRecord(value) && isRecord(value.data) ? value.data : value;
  if (!isRecord(envelope)) return null;
  const source = isRecord(envelope.usage) ? envelope.usage : envelope;
  const hasCreditsField = Object.prototype.hasOwnProperty.call(source, "credits");
  const creditsSource = isRecord(source.credits) ? source.credits : null;
  const hasProductCreditField = Object.prototype.hasOwnProperty.call(source, "productCredits") ||
    Object.prototype.hasOwnProperty.call(source, "product_credits");
  const productCreditsSource = isRecord(source.productCredits)
    ? source.productCredits
    : isRecord(source.product_credits)
      ? source.product_credits
      : null;
  if (!hasCreditsField && !hasProductCreditField) return null;

  const update: AiUsageUpdate = {};
  if (hasCreditsField) {
    if (!creditsSource) return null;
    const total = nonNegativeNumber(creditsSource.total);
    const used = nonNegativeNumber(creditsSource.used);
    const reserved = nonNegativeNumber(creditsSource.reserved);
    const remaining = nonNegativeNumber(creditsSource.remaining);
    const periodEnd = nullableString(creditsSource.periodEnd ?? creditsSource.period_end);
    const creditsPerRequest = nonNegativeNumber(
      creditsSource.creditsPerRequest ?? creditsSource.credits_per_request,
    );
    if (
      total === null || used === null || reserved === null || remaining === null ||
      !periodEnd || creditsPerRequest === null
    ) {
      return null;
    }
    update.credits = {
      total,
      used,
      reserved,
      remaining,
      periodEnd,
      exhausted: creditsSource.exhausted === true || remaining <= 0,
      creditsPerRequest,
      planId:
        nullableString(creditsSource.planId ?? creditsSource.plan_id) ?? "free",
      // Absent outside a chat response, and absent when a request was
      // answered without ever reaching the provider.
      lastRequestCost: nonNegativeNumber(
        creditsSource.lastRequestCost ?? creditsSource.last_request_cost,
      ),
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
  if (!update?.credits || !("productCredits" in update)) return null;
  return {
    credits: update.credits,
    productCredits: update.productCredits ?? null,
  };
}

export function mergeUsageSnapshot(
  current: AiUsageSnapshot | null,
  update: AiUsageUpdate | null | undefined,
): AiUsageSnapshot | null {
  if (!update) return current;
  const credits = update.credits ?? current?.credits;
  if (!credits) return current;
  const productCredits = Object.prototype.hasOwnProperty.call(update, "productCredits")
    ? update.productCredits ?? null
    : current?.productCredits ?? null;
  return { credits, productCredits };
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
  // Ein fehlender Kalender ist kein Grund, den Treffer zu verwerfen.
  if (!displayName || !role || !summary || !profileUrl) return null;
  const sourceUrls = stringList(value.sourceUrls)
    .map(secureBookingUrl)
    .filter((url): url is string => Boolean(url));
  return {
    displayName,
    role,
    summary,
    profileUrl,
    bookingUrl: secureBookingUrl(value.bookingUrl),
    linkedinUrl: secureBookingUrl(value.linkedinUrl),
    websiteUrl: secureBookingUrl(value.websiteUrl),
    portfolioUrl: secureBookingUrl(value.portfolioUrl),
    skills: stringList(value.skills),
    activities: stringList(value.activities),
    projects: stringList(value.projects),
    sourceUrls,
    matchedRequirements: stringList(value.matchedRequirements),
    knownGaps: stringList(value.knownGaps),
    verificationStatus: "external_unverified",
    nameVerified: value.nameVerified === true,
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
    ...(nullableString(response.completedAt ?? response.completed_at)
      ? { completedAt: nullableString(response.completedAt ?? response.completed_at)! }
      : {}),
    notice: nullableString(response.notice) ?? undefined,
    searchTrace: {
      queries: stringList(trace.queries),
      consultedSourceCount: nonNegativeNumber(trace.consultedSourceCount) ?? 0,
      returnedCandidateCount: nonNegativeNumber(trace.returnedCandidateCount) ?? candidates.length,
      toolCallCount: nonNegativeNumber(trace.toolCallCount) ?? 0,
    },
    ...(typeof response.costCents === "number" && response.costCents >= 0
      ? { costCents: response.costCents }
      : {}),
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
  const rawRequirementGroups =
    brief.requirementGroups ?? brief.requirement_groups;
  const requirementGroups = Array.isArray(rawRequirementGroups)
    ? rawRequirementGroups
        .slice(0, 50)
        .map(normalizeRequirementGroup)
        .filter(
          (group): group is StructuredRequirementGroup => group !== null,
        )
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
    requirementGroups,
  };
}

export function normalizeCvAccess(value: unknown): CvAccess {
  return value === "login_required" ||
    value === "available" ||
    value === "missing" ||
    value === "forbidden"
    ? value
    : "forbidden";
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
    avatarUrl: secureBookingUrl(
      profileSource.avatarUrl ?? profileSource.avatar_url,
    ),
    bookingUrl,
    cvAccess: normalizeCvAccess(
      profileSource.cvAccess ?? profileSource.cv_access,
    ),
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
    recommendationRole:
      value.recommendationRole === "primary" ||
      value.recommendation_role === "primary"
        ? "primary"
        : value.recommendationRole === "partial" ||
            value.recommendation_role === "partial"
          ? "partial"
        : value.recommendationRole === "alternative" ||
            value.recommendation_role === "alternative"
          ? "alternative"
          : null,
    fitScore: percentValue(value.fitScore ?? value.fit_score),
    coreCoverage: percentValue(value.coreCoverage ?? value.core_coverage),
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
  const partialSource = response.partialMatches ?? response.partial_matches;
  const partialMatches = Array.isArray(partialSource)
    ? partialSource
        .map(normalizeProfile)
        .filter(
          (item): item is FreelancerProfileResult =>
            item !== null &&
            item.recommendationRole === "partial" &&
            item.bookingUrl === null,
        )
    : [];
  const usage = normalizeUsageUpdate(response.usage ?? response);
  const analysis = normalizeAnalysisTrace(response.analysis);
  const matchMetadata = isRecord(response.match) ? response.match : {};
  const matchingStatus = normalizeMatchingStatus(
    response.matchingStatus ??
      response.matching_status ??
      matchMetadata.resultStatus ??
      matchMetadata.result_status,
  );

  return {
    project: normalizeProject(response.project, fallbackTitle),
    message: normalizeMessage(response.message ?? response.assistantMessage ?? response.assistant),
    brief: normalizeBrief(response.brief),
    matches: matches.slice(0, 3),
    partialMatches: partialMatches.slice(0, 2),
    ...(matchingStatus ? { matchingStatus } : {}),
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
  const partialSource = response.partialProfiles ?? response.partial_profiles;
  const partialProfiles = Array.isArray(partialSource)
    ? partialSource
        .map(normalizeProfile)
        .filter(
          (item): item is FreelancerProfileResult =>
            item !== null &&
            item.recommendationRole === "partial" &&
            item.bookingUrl === null,
        )
    : [];
  const matchingStatus = normalizeMatchingStatus(
    response.matchingStatus ?? response.matching_status,
  );
  const externalSearch = response.externalSearch
    ? normalizeExternalSearchResponse(response.externalSearch)
    : null;
  return {
    project: normalizeProject(response.project, "Gespeichertes Projekt"),
    messages,
    brief: response.brief ? normalizeBrief(response.brief) : null,
    profiles: profiles.slice(0, 3),
    partialProfiles: partialProfiles.slice(0, 2),
    ...(matchingStatus ? { matchingStatus } : {}),
    ...(response.analysisMode === "ai" || response.analysisMode === "fallback"
      ? { analysisMode: response.analysisMode }
      : {}),
    analysisNotice: nullableString(response.analysisNotice),
    externalSearch,
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



/**
 * Exact since a normal search carries a flat price: the balance divided by
 * that price is the number of searches left, not an estimate. Still floored,
 * so a remainder below one search is never advertised as one.
 */
export function estimatedRequestsLeft(credits: CreditBalanceSnapshot): number {
  if (credits.creditsPerRequest <= 0) return 0;
  return Math.floor(credits.remaining / credits.creditsPerRequest);
}

export function usageSummary(
  usage: AiUsageSnapshot,
  authenticated: boolean,
): string {
  const left = estimatedRequestsLeft(usage.credits);
  const balance = `KI-Guthaben: ${formatCredits(usage.credits.remaining)} Credits · ${formatCredits(left)} ${
    left === 1 ? "Anfrage" : "Anfragen"
  }`;
  return authenticated && usage.productCredits
    ? `${balance} · Recherche-Guthaben: ${formatCredits(usage.productCredits.available)} Credits`
    : balance;
}



export function publicProgressLabel(label: string): string {
  const normalized = label.toLocaleLowerCase("de-DE");
  if (normalized.includes("speicher")) return "Anfrage wird gespeichert";
  if (normalized.includes("teiltreffer")) {
    return "Teiltreffer und offene Muss-Kriterien werden aufbereitet";
  }
  if (normalized.includes("kein") && normalized.includes("treffer")) {
    return "Interner Profilabgleich abgeschlossen · kein passendes Profil gefunden";
  }
  if (normalized.includes("profil") || normalized.includes("abgleich")) {
    if (normalized.includes("aufbereit") || normalized.includes("vorbereit")) {
      return "Passende Profile werden nach belegter Passung priorisiert";
    }
    return "Profile werden nach belegten Kriterien geprüft";
  }
  if (normalized.includes("struktur") || normalized.includes("analys")) {
    return "Projektanforderungen werden strukturiert";
  }
  return "Anfrage wird verarbeitet";
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

export function ChatWorkspace({
  apiPaths: apiOverrides,
  view: workspaceView = "chat",
  previewData,
}: ChatWorkspaceProps) {
  const preview = Boolean(previewData);
  const apiPaths = useMemo(
    () => ({ ...defaultChatApiPaths, ...apiOverrides }),
    [apiOverrides],
  );
  const [auth, setAuth] = useState<AuthView>(previewData?.auth ?? emptyAuth);
  const [authOpen, setAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<AuthDialogMode>("login");
  const [projects, setProjects] = useState<ProjectListItem[]>(previewData?.projects ?? []);
  const [projectCollections, setProjectCollections] = useState<ProjectCollectionItem[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectListItem | null>(previewData?.projects[0] ?? null);
  const [messages, setMessages] = useState<ConversationMessage[]>(previewData?.messages ?? []);
  const [brief, setBrief] = useState<StructuredBrief | null>(previewData?.brief ?? null);
  const [profiles, setProfiles] = useState<FreelancerProfileResult[]>(previewData?.profiles ?? []);
  const [partialProfiles, setPartialProfiles] = useState<FreelancerProfileResult[]>([]);
  const [matchingStatus, setMatchingStatus] = useState<MatchingStatus | null>(preview ? "ranked" : null);
  const [hasResult, setHasResult] = useState(preview);
  const [analysisMode, setAnalysisMode] = useState<"ai" | "fallback" | null>(preview ? "ai" : null);
  const [analysisTrace, setAnalysisTrace] = useState<AiAnalysisTrace | null>(previewData?.analysis ?? null);
  const [externalSearch, setExternalSearch] = useState<ExternalFreelancerSearchResponse | null>(null);
  const [externalSearchState, setExternalSearchState] = useState<"idle" | "searching" | "error">("idle");
  const [draft, setDraft] = useState("");
  const [pendingAssistant, setPendingAssistant] = useState<PendingAssistant | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [planTeam, setPlanTeam] = useState<PlanTeamSnapshot | null>(null);
  const [planTeamBusy, setPlanTeamBusy] = useState(false);
  const [planTeamNotice, setPlanTeamNotice] = useState<
    { tone: "error" | "success"; message: string } | null
  >(null);
  const [usage, setUsage] = useState<AiUsageSnapshot | null>(previewData?.usage ?? null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [team, setTeam] = useState<SavedFreelancer[]>([]);
  // Starts true: an account always loads its team on mount, and setting the
  // flag inside the effect would be a synchronous state change during render.
  const [teamLoading, setTeamLoading] = useState(!preview);
  // Survives the auth dialog so a guest who clicks "merken" gets the profile
  // saved after logging in rather than having to find it again.
  const [pendingSaveProfileId, setPendingSaveProfileId] = useState<string | null>(null);
  const [pendingBookingProfileId, setPendingBookingProfileId] = useState<string | null>(null);
  /** Welches externe Profil ausgeklappt ist — höchstens eines. */
  const [expandedExternalUrl, setExpandedExternalUrl] = useState<string | null>(null);
  const [manageChat, setManageChat] = useState<ProjectListItem | null>(null);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Closed on arrival: a first-time visitor should meet two columns, not
  // three. It opens itself once there is a result to show, unless the reader
  // has already expressed a preference by using the toggle.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsTouchedRef = useRef(false);
  /**
   * True until the first workspace load resolves.
   *
   * Without it the sidebar rendered "Noch keine freien Chats" while the list
   * was still on its way — a returning user with twenty chats was told they
   * had none. An empty state may only appear once emptiness is a fact.
   */
  const [workspaceLoading, setWorkspaceLoading] = useState(!preview);
  const {
    sidebarWidth,
    startSidebarResize,
    resetSidebarWidth,
    isResizingSidebar,
  } = useSidebarWidth();
  const [selectedAgentId, setSelectedAgentId] = useState(agentCatalog[0]!.id);
  const [selectedAgentTaskId, setSelectedAgentTaskId] = useState(
    agentCatalog[0]!.tasks[0]!.id,
  );
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
  const selectedAgent = agentById(selectedAgentId);
  const selectedAgentTask = agentTaskById(selectedAgent, selectedAgentTaskId);
  const isAgentView = workspaceView === "agents";
  const isTeamView = workspaceView === "team";
  const isAccountUser = auth.authenticated && !auth.anonymous;
  // Nur die Gaststufe hat keinen Agentenzugang; jeder Plan darüber schon.
  const agentsAllowed = creditPlan(usage?.credits.planId, !isAccountUser).agents;
  const freeUsageExhausted = Boolean(
    usage && (usage.credits.exhausted || usage.credits.remaining <= 0),
  );

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

  /**
   * First paint: session, credits, chats and folders in a single request.
   *
   * The guest session still has to be established first — that is what puts
   * the cookie in place — but everything after it now arrives together
   * instead of in three further round trips that each waited for the last.
   */
  const loadWorkspace = useCallback(async () => {
    const claims = await ensureGuestSession();
    let view = authViewFromClaims(claims);

    try {
      const response = await fetch(apiPaths.workspaceBootstrap, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("bootstrap_unavailable");

      const body: unknown = await response.json();
      if (!isRecord(body)) throw new Error("bootstrap_malformed");

      if (isRecord(body.auth)) view = authViewFromClaims(body.auth);
      setAuth(view);

      const snapshot = normalizeUsageSnapshot(body.usage);
      if (snapshot) setUsage(snapshot);

      if (Array.isArray(body.projects)) {
        setProjects(
          body.projects.map((item) =>
            normalizeProject(item, "Gespeichertes Projekt"),
          ),
        );
      }
      if (Array.isArray(body.collections)) {
        setProjectCollections(body.collections.map(normalizeProjectCollection));
      }
      return view;
    } catch {
      // The separate endpoints stay as a fallback so the workspace still opens
      // if the combined route is unavailable — mid-rollout, for instance.
      const fallbackView = await refreshAuth();
      await Promise.all([
        refreshUsage(),
        loadProjects(),
        loadProjectCollections(),
      ]);
      return fallbackView;
    }
  }, [
    apiPaths.workspaceBootstrap,
    loadProjectCollections,
    loadProjects,
    refreshAuth,
    refreshUsage,
  ]);

  const loadProject = useCallback(
    async (project: ProjectListItem | string) => {
      const projectId = typeof project === "string" ? project : project.id;
      setLoadingProjectId(projectId);
      setSidebarOpen(false);
      try {
        const response = await fetch(`${apiPaths.projects}/${encodeURIComponent(projectId)}`, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Projekt konnte nicht geladen werden.");
        const detail = normalizeProjectDetail(await response.json());
        setActiveProject(detail.project);
        setMessages(detail.messages);
        setBrief(detail.brief);
        setProfiles(detail.profiles.slice(0, 3));
        setPartialProfiles(detail.partialProfiles.slice(0, 2));
        setMatchingStatus(detail.matchingStatus ?? null);
        setHasResult(Boolean(detail.brief));
        setAnalysisMode(detail.analysisMode ?? null);
        setAnalysisTrace(null);
        setExternalSearch(detail.externalSearch ?? null);
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
    if (preview) return;
    let alive = true;
    const supabase = getBrowserSupabaseClient();

    void (async () => {
      try {
        const view = await loadWorkspace();
        if (!alive) return;
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
        // Chats and folders already arrived with the bootstrap response.
        const requestedProjectId =
          workspaceView === "chat" ? searchParams.get("project") : null;
        if (requestedProjectId) {
          await loadProject(requestedProjectId);
          searchParams.delete("project");
          const cleanUrl = `${window.location.pathname}${
            searchParams.size ? `?${searchParams.toString()}` : ""
          }${window.location.hash}`;
          window.history.replaceState({}, "", cleanUrl);
        }
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
      } finally {
        // Also on failure: an error state is still a known state, and holding
        // the skeleton forever would be worse than showing what we have.
        if (alive) setWorkspaceLoading(false);
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
    loadWorkspace,
    refreshAuth,
    refreshUsage,
    showToast,
    workspaceView,
    preview,
  ]);

  useEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [draft]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pendingAssistant, profiles, partialProfiles]);

  const startNewProject = () => {
    // Any view that is not the chat lives on its own route, so opening a chat
    // has to navigate rather than only reset state. Testing for "agents" alone
    // left /mein-team with buttons that changed state nobody could see.
    if (workspaceView !== "chat") {
      // This shell is rendered without an App Router context in presentation tests.
      // A hard navigation is intentional when crossing from another view into chat.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/chat");
      return;
    }
    setActiveProject(null);
    setMessages([]);
    setBrief(null);
    setProfiles([]);
    setPartialProfiles([]);
    setMatchingStatus(null);
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
    setPartialProfiles([]);
    setMatchingStatus(null);
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
      setPartialProfiles(result.partialMatches.slice(0, 2));
      setMatchingStatus(result.matchingStatus ?? null);
      setHasResult(true);
      if (!detailsTouchedRef.current) setDetailsOpen(true);
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
        progress: "Projektanforderungen werden strukturiert",
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
      showToast("Für die externe Recherche sind 30 Recherche-Credits erforderlich.", "error");
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

  const loadTeam = useCallback(async () => {
    try {
      const response = await fetch(apiPaths.savedFreelancers, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return;
      const payload: unknown = await response.json();
      if (isRecord(payload) && Array.isArray(payload.team)) {
        setTeam(payload.team as SavedFreelancer[]);
      }
    } catch {
      // A failed team read must not cost the user their chat.
    } finally {
      setTeamLoading(false);
    }
  }, [apiPaths.savedFreelancers]);

  const persistSavedFreelancer = useCallback(
    async (freelancerId: string, method: "POST" | "DELETE") => {
      const response = await fetch(apiPaths.savedFreelancers, {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ freelancerId }),
      });
      if (!response.ok) throw new Error("save_failed");
      const payload: unknown = await response.json();
      if (isRecord(payload) && Array.isArray(payload.team)) {
        setTeam(payload.team as SavedFreelancer[]);
      }
    },
    [apiPaths.savedFreelancers],
  );

  const toggleSavedFreelancer = async (profile: FreelancerProfileResult) => {
    if (!isAccountUser) {
      // Keep the intent across the login, then finish it in handleAuthenticated.
      setPendingSaveProfileId(profile.id);
      sessionStorage.setItem("pending_profile_save", profile.id);
      if (activeProject?.id) sessionStorage.setItem("pending_project_id", activeProject.id);
      setAuthInitialMode("register");
      setAuthOpen(true);
      return;
    }
    const alreadySaved = team.some((member) => member.profile.id === profile.id);
    try {
      await persistSavedFreelancer(profile.id, alreadySaved ? "DELETE" : "POST");
      showToast(
        alreadySaved
          ? `${profile.displayName} wurde aus Ihrer Merkliste entfernt.`
          : `${profile.displayName} wurde zu Ihrer Merkliste hinzugefügt.`,
        "neutral",
      );
    } catch {
      showToast("Das Profil konnte nicht gespeichert werden.", "error");
    }
  };

  // The sidebar shows the team size everywhere, and the team page needs the
  // profiles themselves. Both wait until the session is known to be an account,
  // because the endpoint answers a guest with an empty list.
  useEffect(() => {
    if (preview || !isAccountUser) return;
    let alive = true;
    void (async () => {
      await loadTeam();
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
  }, [isAccountUser, loadTeam, preview]);

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

  /**
   * Records the introduction so a booking that leaves the product is still
   * visible in the funnel. Returns the URL the server approved, `null` when the
   * profile needs manual approval, and `undefined` when nothing could be
   * recorded — the caller then falls back to the URL it already has.
   */
  const recordIntroduction = async (
    profile: FreelancerProfileResult,
  ): Promise<string | null | undefined> => {
    const projectId = activeProject?.id ?? null;
    // A saved profile outside a project has no match to reference, so the
    // introduction cannot be recorded. Booking still has to work.
    if (!projectId) return undefined;
    try {
      const response = await fetch(apiPaths.introductions, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          projectId,
          profileId: profile.id,
          idempotencyKey: `booking:${projectId}:${profile.id}`,
        }),
      });
      if (!response.ok) return undefined;
      const body: unknown = await response.json().catch(() => ({}));
      const introduction =
        body && typeof body === "object" && "introduction" in body
          ? (body as { introduction?: { bookingUrl?: unknown } }).introduction
          : undefined;
      return typeof introduction?.bookingUrl === "string"
        ? introduction.bookingUrl
        : null;
    } catch {
      return undefined;
    }
  };

  const requestBooking = (profile: FreelancerProfileResult) => {
    if (!profile.bookingUrl) return;
    if (!isAccountUser) {
      // Keep the intent across the login, then finish it in handleAuthenticated.
      setPendingBookingProfileId(profile.id);
      sessionStorage.setItem("pending_profile_booking", profile.id);
      if (activeProject?.id) sessionStorage.setItem("pending_project_id", activeProject.id);
      setAuthInitialMode("register");
      setAuthOpen(true);
      return;
    }
    // The link navigates to the redirect route that records the click. This
    // only files the introduction alongside it and must never block it.
    void recordIntroduction(profile);
  };

  const handleAuthenticated = async () => {
    const view = await refreshAuth();
    if (view.anonymous) return;
    const projectIdToReload =
      activeProject?.id ?? sessionStorage.getItem("pending_project_id");
    const profileIdToRestore =
      pendingProfileId ?? sessionStorage.getItem("pending_profile_selection");
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
    const refreshedProject = projectIdToReload
      ? await loadProject(projectIdToReload)
      : null;
    if (
      profileIdToRestore &&
      refreshedProject?.profiles.some((profile) => profile.id === profileIdToRestore)
    ) {
      setSelectedProfileId(profileIdToRestore);
      setContactOpen(true);
    }
    const profileIdToSave =
      pendingSaveProfileId ?? sessionStorage.getItem("pending_profile_save");
    if (profileIdToSave) {
      try {
        await persistSavedFreelancer(profileIdToSave, "POST");
        showToast("Das Profil wurde zu Ihrer Merkliste hinzugefügt.", "neutral");
      } catch {
        showToast("Das Profil konnte nicht gespeichert werden.", "error");
      }
    }
    const profileIdToBook =
      pendingBookingProfileId ?? sessionStorage.getItem("pending_profile_booking");
    if (profileIdToBook) {
      // A popup opened this late is blocked by the browser, so the booking is
      // handed back through the contact dialog instead of a new tab.
      const bookedProfile =
        refreshedProject?.profiles.find((profile) => profile.id === profileIdToBook) ??
        null;
      if (bookedProfile) {
        setSelectedProfileId(bookedProfile.id);
        setContactOpen(true);
        const approved = await recordIntroduction(bookedProfile);
        showToast(
          approved === null
            ? "Ihre Kontaktanfrage ist eingegangen und wird persönlich geprüft."
            : `Weiter mit ${bookedProfile.displayName}: Der Termin lässt sich jetzt buchen.`,
          "neutral",
        );
      }
    }
    setPendingProfileId(null);
    setPendingSaveProfileId(null);
    setPendingBookingProfileId(null);
    sessionStorage.removeItem("pending_profile_selection");
    sessionStorage.removeItem("pending_profile_save");
    sessionStorage.removeItem("pending_profile_booking");
    sessionStorage.removeItem("pending_project_id");
    await Promise.all([loadProjects(), loadProjectCollections(), loadTeam()]);
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

  const deleteData = async (confirmation: string) => {
    setDataAction("delete");
    try {
      const response = await fetch(apiPaths.deleteData, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        // Der Server prüft die Bestätigung erneut; der Dialog allein wäre
        // kein Schutz.
        body: JSON.stringify({ confirm: confirmation }),
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

  const openProjectFromSidebar = (project: ProjectListItem) => {
    if (workspaceView !== "chat") {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/chat?project=${encodeURIComponent(project.id)}`);
      return;
    }
    void loadProject(project);
  };

  /**
   * Team-Aufrufe teilen sich eine Auswertung: die Route antwortet bei jedem
   * Ausgang mit demselben Umschlag, damit die Oberfläche den Grund anzeigen
   * kann statt einer allgemeinen Fehlermeldung.
   */
  const runPlanTeamRequest = useCallback(
    async (init: RequestInit, successMessage: string | null) => {
      setPlanTeamBusy(true);
      try {
        const response = await fetch(apiPaths.teamMembers, {
          credentials: "same-origin",
          ...init,
        });
        const body = (await response.json().catch(() => null)) as
          | { team?: PlanTeamSnapshot; isOwner?: boolean; error?: string }
          | null;

        if (!response.ok) {
          setPlanTeamNotice({
            tone: "error",
            message:
              body?.error ?? "Die Anfrage konnte nicht bearbeitet werden.",
          });
          return;
        }
        if (body?.team) {
          setPlanTeam({ ...body.team, isOwner: body.isOwner !== false });
        }
        setPlanTeamNotice(
          successMessage ? { tone: "success", message: successMessage } : null,
        );
      } catch {
        setPlanTeamNotice({
          tone: "error",
          message: "Die Verbindung ist unterbrochen.",
        });
      } finally {
        setPlanTeamBusy(false);
      }
    },
    [apiPaths.teamMembers],
  );

  const loadPlanTeam = useCallback(async () => {
    await runPlanTeamRequest({ method: "GET" }, null);
  }, [runPlanTeamRequest]);

  const invitePlanTeamMember = useCallback(
    (email: string) =>
      void runPlanTeamRequest(
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        },
        `${email} nutzt jetzt Ihren Plan mit.`,
      ),
    [runPlanTeamRequest],
  );

  const removePlanTeamMember = useCallback(
    (memberUserId: string) =>
      void runPlanTeamRequest(
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberUserId }),
        },
        "Das Mitglied wurde entfernt.",
      ),
    [runPlanTeamRequest],
  );

  const selectAgent = (agent: AgentDefinition) => {
    setSelectedAgentId(agent.id);
    setSelectedAgentTaskId(agent.tasks[0]!.id);
    setDetailsOpen(true);
  };

  const selectAgentTask = (agent: AgentDefinition, task: AgentTask) => {
    setSelectedAgentId(agent.id);
    setSelectedAgentTaskId(task.id);
    setDetailsOpen(true);
  };

  const normalizedChatSearch = chatSearchQuery.trim().toLocaleLowerCase("de-DE");
  const visibleProjects = normalizedChatSearch
    ? projects.filter((project) =>
        project.title.toLocaleLowerCase("de-DE").includes(normalizedChatSearch),
      )
    : projects;
  const unassignedChats = visibleProjects.filter((project) => !project.collectionId);
  const visibleCollections = normalizedChatSearch
    ? projectCollections.filter((collection) =>
        visibleProjects.some((project) => project.collectionId === collection.id),
      )
    : projectCollections;
  const emptyChat = !isTeamView && !isAgentView && messages.length === 0 && !pendingAssistant;

  return (
    <div
      className={`app-shell ${detailsOpen ? "" : "details-hidden"}${isAgentView ? " is-agent-view" : ""}${emptyChat ? " is-empty-chat" : ""}${isResizingSidebar ? " is-resizing-sidebar" : ""}`}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <a className="skip-link" href={isAgentView ? "#agent-directory-title" : "#chat-composer"}>
        {isAgentView ? "Direkt zu den Agenten" : "Direkt zur Nachricht"}
      </a>

      <aside className={`project-sidebar ${sidebarOpen ? "is-open" : ""}`} aria-label="Projekte">
        <div className="sidebar-scroll">
        <div className="sidebar-top">
          <div className="product-mark" aria-label="XPORTAL">
            <BrandMark className="mark-glyph" height={26} />
            <span>PORTAL</span>
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
          <a
            className={`sidebar-primary-button${isTeamView ? " is-active" : ""}`}
            href="/mein-team"
            aria-current={isTeamView ? "page" : undefined}
            onClick={() => setSidebarOpen(false)}
            data-sidebar-primary="team"
          >
            <span className="sidebar-primary-icon" aria-hidden="true"><IconFolder size={18} /></span>
            <span>Merkliste</span>
            {isAccountUser && team.length ? (
              <span className="sidebar-primary-count" aria-hidden="true">{team.length}</span>
            ) : (
              <span className="sidebar-primary-chevron" aria-hidden="true"><IconChevronRight size={16} /></span>
            )}
          </a>
          <a
            className={`sidebar-primary-button${isAgentView ? " is-active" : ""}`}
            href="/agent"
            aria-current={isAgentView ? "page" : undefined}
            onClick={() => setSidebarOpen(false)}
            data-sidebar-primary="agents"
          >
            <span className="agent-glyph" aria-hidden="true">A</span>
            <span>Agenten</span>
            <span className="sidebar-primary-chevron" aria-hidden="true"><IconChevronRight size={16} /></span>
          </a>
        </nav>

        <nav className="project-nav" aria-label="Gespeicherte Chats">
          <p className="nav-label">Chats</p>
          <label className="sidebar-chat-search">
            <span aria-hidden="true"><IconSearch size={14} /></span>
            <input
              type="search"
              value={chatSearchQuery}
              onChange={(event) => setChatSearchQuery(event.target.value)}
              placeholder="Chats durchsuchen"
              aria-label="Gespeicherte Chats durchsuchen"
            />
          </label>
          {workspaceLoading ? (
            <SidebarSkeleton rows={4} />
          ) : unassignedChats.length === 0 ? (
            <div className="empty-projects">
              <span aria-hidden="true"><IconChat size={22} /></span>
              <p>{normalizedChatSearch ? "Keine passenden freien Chats" : "Noch keine freien Chats"}</p>
              <small>{normalizedChatSearch ? "Passen Sie den Suchbegriff an." : "Neue Unterhaltungen erscheinen automatisch hier."}</small>
            </div>
          ) : (
            <SidebarChatList
              chats={unassignedChats}
              activeProjectId={activeProject?.id ?? null}
              loadingProjectId={loadingProjectId}
              onOpen={openProjectFromSidebar}
              onManage={setManageChat}
            />
          )}

          <div className="sidebar-section-heading">
            <p className="nav-label">In Projekten</p>
            <button type="button" onClick={() => setCreateProjectOpen(true)}><IconPlus size={13} /> Projekt</button>
          </div>
          {workspaceLoading ? (
            <SidebarSkeleton rows={2} />
          ) : visibleCollections.length === 0 ? (
            <p className="sidebar-section-empty">{normalizedChatSearch ? "Keine passenden Chats in Projekten." : "Erstellen Sie ein Projekt und speichern Sie mehrere Chats darin."}</p>
          ) : (
            <div className="collection-list">
              {visibleCollections.map((collection) => {
                const chats = visibleProjects.filter((project) => project.collectionId === collection.id);
                return (
                  <section className="collection-group" key={collection.id} aria-label={`Projekt ${collection.name}`}>
                    <div className="collection-title"><span aria-hidden="true"><IconChevronDown size={14} /></span>{collection.name}<small>{chats.length}</small></div>
                    {chats.length ? (
                      <SidebarChatList
                        chats={chats}
                        activeProjectId={activeProject?.id ?? null}
                        loadingProjectId={loadingProjectId}
                        onOpen={openProjectFromSidebar}
                        onManage={setManageChat}
                      />
                    ) : <p className="collection-empty">Noch keine Chats</p>}
                  </section>
                );
              })}
            </div>
          )}
        </nav>

        <div className="sidebar-secondary-nav">
          {/* Freelancers are the other half of the marketplace, but not the
              audience this workspace is built for. A quiet, permanent row keeps
              the entry findable without competing with the search flow. */}
          <a
            className="sidebar-apply-link"
            href="/freelancer/apply"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="sidebar-apply-icon" aria-hidden="true">
              <IconPlus size={15} />
            </span>
            <span className="sidebar-apply-copy">
              <strong>Als Freelancer bewerben</strong>
              <small>Profil einreichen und prüfen lassen</small>
            </span>
            <span className="sidebar-apply-chevron" aria-hidden="true">
              <IconChevronRight size={15} />
            </span>
          </a>
        </div>
        </div>

        <div className="sidebar-footer">
          <div className="account-menu-wrap sidebar-account-menu-wrap">
            {accountMenuOpen ? (
              <div className="account-popover sidebar-account-popover" role="dialog" aria-label="Konto und Einstellungen">
                <AccountSummary
                  usage={usage}
                  displayName={
                    isAccountUser
                      ? auth.user?.displayName ?? auth.user?.email ?? "Ihr Konto"
                      : "Ohne Konto"
                  }
                  email={
                    isAccountUser
                      ? auth.user?.email ?? "Angemeldet"
                      : "Anfrage bleibt in diesem Browser"
                  }
                  isAccountUser={isAccountUser}
                  onMoreCredits={() => {
                    setAccountMenuOpen(false);
                    setPlansOpen(true);
                    void loadPlanTeam();
                  }}
                />
                <p className="account-menu-section-label">Einstellungen</p>
                {/* Derselbe Weg wie in der Seitenleiste. Wer sich gerade
                    anmeldet, hat das Menue offen und die Leiste im Ruecken —
                    dort ist die Bewerbung sonst nicht erreichbar, ohne das
                    Menue wieder zu schliessen. */}
                <a
                  className="account-menu-item"
                  href="/freelancer/apply"
                  onClick={() => { setAccountMenuOpen(false); setSidebarOpen(false); }}
                >
                  Als Freelancer bewerben
                </a>
                {isAccountUser ? (
                  <>
                    {auth.admin && apiPaths.adminUsage ? (
                      <button
                        className="account-menu-item"
                        type="button"
                        onClick={() => window.location.assign(apiPaths.adminUsage!)}
                      >
                        Geschütztes AI-Usage-Dashboard
                      </button>
                    ) : null}
                    {auth.admin && apiPaths.adminFreelancers ? (
                      <button
                        className="account-menu-item"
                        type="button"
                        onClick={() =>
                          window.location.assign(apiPaths.adminFreelancers!)
                        }
                      >
                        Freelancer-Bewerbungen prüfen
                      </button>
                    ) : null}
                    <button className="account-menu-item" type="button" onClick={() => void exportData()} disabled={dataAction === "export"}>Daten exportieren</button>
                    <button className="account-menu-item" type="button" onClick={() => { setAccountMenuOpen(false); openCookieSettings(); }}>Cookie-Einstellungen verwalten</button>
                    <button className="account-menu-item is-danger" type="button" onClick={() => { setAccountMenuOpen(false); setDeleteOpen(true); }}>Daten & Konto löschen</button>
                    <div className="menu-divider" />
                    <button className="account-menu-item" type="button" onClick={() => void signOut()}>Abmelden</button>
                  </>
                ) : (
                  <>
                    <button className="account-menu-item" type="button" onClick={() => { setAccountMenuOpen(false); setSidebarOpen(false); setAuthInitialMode("login"); setAuthOpen(true); }}>Anmelden oder Konto erstellen</button>
                    <button className="account-menu-item" type="button" onClick={() => { setAccountMenuOpen(false); openCookieSettings(); }}>Cookie-Einstellungen verwalten</button>
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
        {/* Separator and control in one: drag to resize, double-click to
            restore the default width. */}
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Breite der Projektleiste ändern"
          onPointerDown={startSidebarResize}
          onDoubleClick={resetSidebarWidth}
        />
      </aside>

      {/*
        Deliberately a child of the shell, not of the topbar.
        `.topbar` sets `backdrop-filter`, and that makes an element the
        containing block for its `position: fixed` descendants — the button
        was anchored to the topbar, which is exactly the box that moves when
        the panel opens. Out here it is anchored to the viewport and keeps one
        screen position, so closing and reopening needs no mouse movement.
      */}
      <button
        className="icon-button details-toggle"
        type="button"
        onClick={() => {
          detailsTouchedRef.current = true;
          setDetailsOpen((current) => !current);
        }}
        aria-label={
          isAgentView
            ? detailsOpen
              ? "Agentendetails ausblenden"
              : "Agentendetails einblenden"
            : detailsOpen
              ? "Projektübersicht ausblenden"
              : "Projektübersicht einblenden"
        }
        aria-pressed={detailsOpen}
      ><IconPanelRight size={18} /></button>

      {sidebarOpen ? <button className="sidebar-scrim" type="button" onClick={() => setSidebarOpen(false)} aria-label="Projektleiste schließen" /> : null}

      <main className={`chat-panel${emptyChat ? " is-empty-chat" : ""}`}>
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" type="button" onClick={() => setSidebarOpen(true)} aria-label="Projekte öffnen"><IconMenu size={18} /></button>
            <div>
              {/* No placeholder title: an untitled conversation shows nothing
                  rather than a label that repeats what the page already is. */}
              {isTeamView || isAgentView || activeProject?.title ? (
                <p className="topbar-title">
                  {isTeamView
                    ? "Merkliste"
                    : isAgentView
                      ? "KI-Agenten"
                      : activeProject?.title}
                </p>
              ) : null}
            </div>
          </div>
        </header>

        {isTeamView ? (
          <div className="agent-scroll">
            <section className="team-page" aria-label="Merkliste">
              <header className="team-page-header">
                <h2>Merkliste</h2>
                <p>
                  Gespeicherte Freelancer-Profile für Ihre spätere Auswahl.
                  Die Merkliste bleibt Ihrem Konto zugeordnet und ist unabhängig
                  vom einzelnen Chat.
                </p>
              </header>
              {!isAccountUser ? (
                <div className="empty-projects">
                  <p>Für die Merkliste ist ein Konto erforderlich</p>
                  <small>
                    Melden Sie sich an, dann bleiben gemerkte Profile dauerhaft
                    erhalten.
                  </small>
                  <button
                    className="primary-action"
                    type="button"
                    onClick={() => {
                      setAuthInitialMode("register");
                      setAuthOpen(true);
                    }}
                  >
                    Konto erstellen
                  </button>
                </div>
              ) : teamLoading ? (
                <SidebarSkeleton rows={3} />
              ) : team.length === 0 ? (
                <div className="empty-projects">
                  <p>Noch keine Profile gemerkt</p>
                  <small>
                    Wählen Sie bei einem Suchergebnis „Zur Merkliste“, dann
                    bleibt das Profil hier dauerhaft verfügbar.
                  </small>
                </div>
              ) : (
                <SavedProfileList
                  team={team}
                  isAccountUser={isAccountUser}
                  onToggleSave={(profile) => void toggleSavedFreelancer(profile)}
                  onContact={(profile) => {
                    setSelectedProfileId(profile.id);
                    setContactOpen(true);
                  }}
                  onRequestBooking={requestBooking}
                />
              )}
            </section>
            <LegalFooter />
          </div>
        ) : isAgentView ? (
          <div className="agent-scroll">
            {/* Die Agenten sind die Stufe hinter der Anmeldung. Ein Gast
                bekommt die Standardanalyse; alles andere braucht ein Konto,
                an dem Verlauf und Guthaben hängen können. */}
            {agentsAllowed ? (
              <AgentDirectory
                selectedAgentId={selectedAgent.id}
                selectedTaskId={selectedAgentTask.id}
                onSelectAgent={selectAgent}
                onSelectTask={selectAgentTask}
              />
            ) : (
              <div className="agent-locked" role="status">
                <p className="eyebrow">KI-Agenten</p>
                <h1>Agenten gibt es mit einem Konto.</h1>
                <p>
                  Als Gast steht Ihnen die Standardanalyse im Chat offen —
                  {" "}{BRIEF_ANALYSIS_CREDITS} Credits pro Suche aus Ihrem
                  Guthaben von{" "}
                  {formatCredits(CREDIT_PLANS.guest.monthlyCredits)}. Die
                  spezialisierten Agenten für Recherche, Planung und Analyse
                  arbeiten mit Verlauf und Merkliste und brauchen deshalb ein
                  dauerhaftes Konto.
                </p>
                <p>
                  Ein Konto bringt{" "}
                  {formatCredits(CREDIT_PLANS.free.monthlyCredits)} Credits im
                  Monat und den vollen Zugang zu den Agenten.
                </p>
                <button
                  type="button"
                  className="composer-signup"
                  onClick={() => {
                    setAuthInitialMode("register");
                    setAuthOpen(true);
                  }}
                >
                  Konto erstellen
                </button>
              </div>
            )}
            <LegalFooter />
          </div>
        ) : (
          <>
          <div className="chat-scroll" aria-live="polite">
          <div className="conversation">
            {messages.length === 0 && !pendingAssistant ? (
              <WelcomeState />
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
                    projectId={activeProject?.id ?? null}
                    profiles={profiles}
                    partialProfiles={partialProfiles}
                    matchingStatus={matchingStatus}
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
                    onOpenDetails={() => setDetailsOpen(true)}
                    savedFreelancerIds={
                      isAccountUser ? team.map((member) => member.profile.id) : []
                    }
                    onToggleSave={(profile) => void toggleSavedFreelancer(profile)}
                    onSelect={requestProfileSelection}
                    onContact={(profile) => {
                      setSelectedProfileId(profile.id);
                      setContactOpen(true);
                    }}
                    onRequestBooking={requestBooking}
                    expandedProfileUrl={expandedExternalUrl}
                    onToggleExpand={(profileUrl) => {
                      // Ein ausgeklapptes Profil braucht die volle Breite, also
                      // weicht die Detailleiste. Beim Einklappen bleibt sie zu:
                      // sie wieder aufzureißen würde den Chat verspringen lassen.
                      if (profileUrl) setDetailsOpen(false);
                      setExpandedExternalUrl(profileUrl);
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
          {emptyChat ? <SuggestionGrid onSuggestion={startGuidedRequest} /> : null}
          {/* Der laufende Zählerstand stand hier früher bei jeder Anfrage und
              lenkte vom Schreiben ab. Gemeldet wird nur noch der Moment, in dem
              das Guthaben aufgebraucht ist — und für einen Gast ist das der
              Zeitpunkt, ein Konto anzulegen, keine Fehlermeldung. */}
          {usage && freeUsageExhausted ? (
            isAccountUser ? (
              <p className="composer-credit-status is-exhausted" role="status">
                Ihr Monatsguthaben ist aufgebraucht. Sie können weiter schreiben;
                XPORTAL speichert und gleicht Ihre Angaben regelbasiert ab. Neues
                Guthaben gibt es ab {formatUsageReset(usage.credits.periodEnd)}.
              </p>
            ) : (
              <div className="composer-credit-status is-exhausted" role="status">
                <p>
                  Ihr kostenloses Guthaben ist aufgebraucht. Mit einem Konto
                  erhalten Sie {formatCredits(ACCOUNT_MONTHLY_CREDITS)} Credits
                  im Monat — bei {BRIEF_ANALYSIS_CREDITS} Credits pro Suche
                  reicht das für{" "}
                  {formatCredits(
                    Math.floor(ACCOUNT_MONTHLY_CREDITS / BRIEF_ANALYSIS_CREDITS),
                  )}{" "}
                  Anfragen.
                </p>
                <button
                  type="button"
                  className="composer-signup"
                  onClick={() => {
                    setAuthInitialMode("register");
                    setAuthOpen(true);
                  }}
                >
                  Konto erstellen
                </button>
              </div>
            )
          ) : null}
          {/* "Sie wählen selbst" left readers guessing what the AI actually
              does. Spelled out: it never picks a person, it only narrows the
              list by fixed rules. */}
          <p className="composer-disclosure">
            Die KI kann Fehler machen. Daten werden nicht zum Trainieren von
            Modellen verwendet.
            <span className="composer-legal">
              <a href="/imprint">Impressum</a>
              <span aria-hidden="true">·</span>
              <a href="/privacy">Datenschutz</a>
              <span aria-hidden="true">·</span>
              <a href="/terms">AGB</a>
              <span aria-hidden="true">·</span>
              <a href="/contact">Kontakt</a>
            </span>
          </p>
        </div>
          </>
        )}
      </main>

      <aside
        className={`details-panel ${detailsOpen ? "is-open" : ""}`}
        aria-label={isAgentView ? "Agentendetails" : "Projektübersicht"}
      >
        {isAgentView ? (
          <AgentDetails agent={selectedAgent} task={selectedAgentTask} />
        ) : (
          <ProjectDetails
            brief={brief}
            selectedProfile={selectedProfile}
            busy={Boolean(pendingAssistant)}
            onContact={() => setContactOpen(true)}
            onUpdateBrief={(message) => void sendMessage(message)}
          />
        )}
      </aside>

      {plansOpen ? (
        <CreditPlansDialog
          usage={usage}
          customerReference={auth.user?.id ?? null}
          team={planTeam}
          teamBusy={planTeamBusy}
          teamNotice={planTeamNotice}
          onInviteTeamMember={invitePlanTeamMember}
          onRemoveTeamMember={removePlanTeamMember}
          onClose={() => {
            setPlansOpen(false);
            setPlanTeamNotice(null);
          }}
        />
      ) : null}

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
          accountEmail={auth.user?.email ?? null}
          onClose={() => setDeleteOpen(false)}
          onConfirm={(confirmation) => void deleteData(confirmation)}
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

      {toast ? <div className={`toast ${toast.tone}`} role="status" key={toast.id}>{toast.message}</div> : null}
    </div>
  );
}


/**
 * Placeholder rows in the shape the real list will take.
 *
 * Aria-hidden and marked busy: a screen reader should hear "wird geladen",
 * not a handful of empty list items.
 */
function SidebarSkeleton({ rows }: { rows: number }) {
  return (
    <div className="sidebar-skeleton" aria-busy="true" aria-label="Wird geladen">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="sidebar-skeleton-row" aria-hidden="true" />
      ))}
    </div>
  );
}

function WelcomeState() {
  return (
    <section className="welcome-state" aria-labelledby="welcome-title">
      <div className="assistant-emblem" aria-hidden="true"><span><IconSpark size={22} /></span></div>
      <h1 id="welcome-title">Welchen Freelancer suchen Sie?</h1>
    </section>
  );
}

function SuggestionGrid({ onSuggestion }: { onSuggestion: (suggestion: Suggestion) => void }) {
  return (
    <div className="suggestion-grid" aria-label="Beispielanfragen">
      {suggestions.map((suggestion) => (
        <button key={suggestion.label} type="button" onClick={() => onSuggestion(suggestion)}>
          <span className="suggestion-label">{suggestion.label}</span>
          <span className="suggestion-description">{suggestion.description}</span>
          <span className="suggestion-arrow" aria-hidden="true"><IconArrowRight size={17} /></span>
        </button>
      ))}
    </div>
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
    const isLongMessage = message.content.length > 700;
    return (
      <article className="message-row user-message" aria-label="Ihre Nachricht">
        <div className="message-content">
          {isLongMessage ? (
            <details className="long-user-message">
              <summary>
                <span>{message.content.slice(0, 240).trim()} …</span>
                <strong>Vollständig anzeigen</strong>
              </summary>
              <p>{message.content}</p>
            </details>
          ) : <p>{message.content}</p>}
        </div>
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
          <details className="work-process" role="status">
            <summary>
              <span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>
              <span>{pending.progress}</span>
              <span className="work-process-toggle" aria-hidden="true"><IconChevronDown size={14} /></span>
            </summary>
            <div className="work-process-details">
              <p>XPORTAL zeigt zusammengefasste Arbeitsschritte, keine internen Gedankengänge.</p>
              <ol>
                <li>Anforderungen aus Ihrer Nachricht strukturieren</li>
                <li>Aktive Profile nach festen Kriterien prüfen</li>
                <li>Belegte Stärken und offene Punkte verständlich aufbereiten</li>
              </ol>
            </div>
          </details>
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

export function projectStatusLabel(status: ProjectListItem["status"]): string | null {
  if (status === "draft") return "Entwurf";
  if (status === "matching") return "Abgleich";
  if (status === "shortlisted") return "Auswahl";
  if (status === "contact") return "Kontakt";
  if (status === "closed") return "Abgeschlossen";
  return null;
}

export function sidebarChatGroups(
  chats: ProjectListItem[],
  now = new Date(),
): { label: string; chats: ProjectListItem[] }[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const groups = new Map<string, ProjectListItem[]>([
    ["Heute", []],
    ["Gestern", []],
    ["Letzte 7 Tage", []],
    ["Früher", []],
  ]);
  for (const chat of chats) {
    const updatedAt = new Date(chat.updatedAt);
    updatedAt.setHours(0, 0, 0, 0);
    const ageInDays = Number.isNaN(updatedAt.getTime())
      ? Number.POSITIVE_INFINITY
      : Math.floor((today.getTime() - updatedAt.getTime()) / 86_400_000);
    const label = ageInDays <= 0
      ? "Heute"
      : ageInDays === 1
        ? "Gestern"
        : ageInDays <= 7
          ? "Letzte 7 Tage"
          : "Früher";
    groups.get(label)!.push(chat);
  }
  return Array.from(groups, ([label, groupedChats]) => ({ label, chats: groupedChats }))
    .filter((group) => group.chats.length > 0);
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
    <div className="sidebar-chat-groups">
      {sidebarChatGroups(chats).map((group) => (
        <section className="sidebar-chat-group" key={group.label}>
          <h3>{group.label}</h3>
          <ul className="project-list">
            {group.chats.map((chat) => {
              const status = projectStatusLabel(chat.status);
              return (
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
                      {status ? <span className={`project-status-badge is-${chat.status}`}>{status}</span> : null}
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
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
