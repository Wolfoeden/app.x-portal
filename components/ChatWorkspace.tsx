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

const CONTACT_PHONE = process.env.NEXT_PUBLIC_CONTACT_PHONE ?? "+491758934338";
const CONTACT_PHONE_LABEL = "+49 175 8934338";

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
  if (Number.isNaN(date.getTime())) return "Kürzlich";
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
    if (!cleaned || cleaned === "[DONE]") return;
    try {
      const event = JSON.parse(cleaned) as ChatStreamEvent;
      if (event.type === "text_delta") {
        textContent += event.delta;
        onDelta(textContent);
      } else if (event.type === "progress") {
        onDelta(textContent, event.label);
      } else if (event.type === "result") {
        result = normalizeChatResponse(event.data, fallbackTitle);
      } else if (event.type === "error") {
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

  if (result) return result;
  if (textContent) {
    throw new Error("Die Antwort war unvollständig. Ihre Anfrage bleibt erhalten.");
  }
  throw new Error("Die Serverantwort war unvollständig.");
}

export function ChatWorkspace({ apiPaths: apiOverrides }: ChatWorkspaceProps) {
  const apiPaths = useMemo(
    () => ({ ...defaultChatApiPaths, ...apiOverrides }),
    [apiOverrides],
  );
  const [auth, setAuth] = useState<AuthView>(emptyAuth);
  const [authReady, setAuthReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<"login" | "register" | "set-password">("login");
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectListItem | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [brief, setBrief] = useState<StructuredBrief | null>(null);
  const [profiles, setProfiles] = useState<FreelancerProfileResult[]>([]);
  const [hasResult, setHasResult] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingAssistant, setPendingAssistant] = useState<PendingAssistant | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [dataAction, setDataAction] = useState<"export" | "delete" | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const isAccountUser = auth.authenticated && !auth.anonymous;

  const showToast = useCallback((message: string, tone: ToastState["tone"] = "neutral") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), message, tone });
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const refreshAuth = useCallback(async () => {
    const claims = await ensureGuestSession();
    const view = authViewFromClaims(claims);
    setAuth(view);
    return view;
  }, []);

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
        const searchParams = new URLSearchParams(window.location.search);
        if (searchParams.get("set-password") === "1") {
          setAuthInitialMode("set-password");
          setAuthOpen(true);
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
        await loadProjects();
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
        if (alive) showToast("Der Gastmodus konnte nicht gestartet werden. Bitte neu laden.", "error");
      } finally {
        if (alive) setAuthReady(true);
      }
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void refreshAuth().catch(() => undefined);
    });
    return () => {
      alive = false;
      subscription.subscription.unsubscribe();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [loadProject, loadProjects, refreshAuth, showToast]);

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
    setDraft("");
    setPendingAssistant(null);
    setSelectedProfileId(null);
    setContactOpen(false);
    setSidebarOpen(false);
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const startGuidedRequest = (suggestion: Suggestion) => {
    setActiveProject(null);
    setBrief(null);
    setProfiles([]);
    setHasResult(false);
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
      setSelectedProfileId((current) =>
        result.matches.some((profile) => profile.id === current) ? current : null,
      );
      setActiveProject(result.project);
      setProjects((current) => {
        const withoutCurrent = current.filter((project) => project.id !== result.project.id);
        return [result.project, ...withoutCurrent];
      });
      if (result.notice) showToast(result.notice);
    },
    [showToast],
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
        progress: "Anfrage wird verstanden …",
        retryText: null,
      });

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
            throw new Error(
              retryAfter
                ? `Das Nutzungslimit ist erreicht. Erneut möglich in ${retryAfter} Sekunden.`
                : "Das Nutzungslimit ist erreicht. Bitte versuchen Sie es später erneut.",
            );
          }
          let message = "Die Anfrage konnte gerade nicht verarbeitet werden.";
          try {
            const body: unknown = await response.json();
            if (isRecord(body)) message = stringValue(body.error ?? body.message, message);
          } catch {
            // Keep the safe generic error message.
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

        finishChatResponse(result);
        setPendingAssistant(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Die Anfrage konnte nicht verarbeitet werden.";
        setPendingAssistant({
          id: makeId("assistant-error"),
          clientMessageId: optimistic.id,
          content: `${message} Ihre Eingabe bleibt im Chat erhalten.`,
          progress: "",
          retryText: text,
        });
      }
    },
    [activeProject, apiPaths.chat, finishChatResponse, pendingAssistant, refreshAuth],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(draft);
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
    if (pendingProfileId) {
      setSelectedProfileId(pendingProfileId);
      setPendingProfileId(null);
      sessionStorage.removeItem("pending_profile_selection");
      setContactOpen(true);
    }
    await loadProjects();
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
    await refreshAuth();
    showToast("Sie wurden abgemeldet. Ein neuer Gastzugang ist aktiv.");
  };

  return (
    <div className={`app-shell ${detailsOpen ? "" : "details-hidden"}`}>
      <a className="skip-link" href="#chat-composer">Direkt zur Nachricht</a>

      <aside className={`project-sidebar ${sidebarOpen ? "is-open" : ""}`} aria-label="Projekte">
        <div className="sidebar-top">
          <div className="product-mark" aria-label="Freelancer-Suche">
            <span className="mark-glyph" aria-hidden="true">F</span>
            <span>Freelancer</span>
          </div>
          <button className="icon-button sidebar-close" type="button" onClick={() => setSidebarOpen(false)} aria-label="Projektleiste schließen">×</button>
        </div>

        <button className="new-chat-button" type="button" onClick={startNewProject}>
          <span aria-hidden="true">＋</span>
          Neues Projekt
          <span className="new-chat-key" aria-hidden="true">⌘ K</span>
        </button>

        <nav className="project-nav" aria-label="Gespeicherte Projekte">
          <p className="nav-label">Ihre Projekte</p>
          {projects.length === 0 ? (
            <div className="empty-projects">
              <span aria-hidden="true">○</span>
              <p>Noch keine gespeicherten Projekte</p>
              <small>Die erste Anfrage erscheint automatisch hier.</small>
            </div>
          ) : (
            <ul className="project-list">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className={activeProject?.id === project.id ? "active" : ""}
                    onClick={() => void loadProject(project)}
                    aria-current={activeProject?.id === project.id ? "page" : undefined}
                  >
                    <span className="project-title">{project.title}</span>
                    <span className="project-meta">
                      {loadingProjectId === project.id ? "Wird geladen …" : formatRelativeDate(project.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="privacy-note">
            <span className="privacy-icon" aria-hidden="true">✓</span>
            <div>
              <strong>Privater Arbeitsbereich</strong>
              <span>Ihre Projekte bleiben Ihrem Zugang zugeordnet.</span>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen ? <button className="sidebar-scrim" type="button" onClick={() => setSidebarOpen(false)} aria-label="Projektleiste schließen" /> : null}

      <main className="chat-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" type="button" onClick={() => setSidebarOpen(true)} aria-label="Projekte öffnen">☰</button>
            <div>
              <p className="topbar-title">{activeProject?.title ?? "Freelancer finden"}</p>
              <p className="topbar-subtitle">KI-gestützte Anfrage · Sie treffen jede Entscheidung</p>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="guest-state" aria-label={isAccountUser ? "Angemeldetes Konto" : "Gastmodus aktiv"}>
              <span className={`status-dot ${authReady && auth.authenticated ? "is-ready" : ""}`} aria-hidden="true" />
              <span>{isAccountUser ? "Gespeichert" : "Gastmodus"}</span>
            </div>
            {!isAccountUser ? (
              <button className="login-button" type="button" onClick={() => { setAuthInitialMode("login"); setAuthOpen(true); }}>Anmelden</button>
            ) : null}
            <div className="account-menu-wrap">
              <button
                className="account-button"
                type="button"
                aria-label="Kontomenü öffnen"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                onClick={() => setAccountMenuOpen((current) => !current)}
              >
                {isAccountUser ? initials(auth.user?.displayName ?? auth.user?.email ?? "Konto") : "G"}
              </button>
              {accountMenuOpen ? (
                <div className="account-popover" role="menu">
                  <div className="account-identity">
                    <strong>{isAccountUser ? auth.user?.displayName ?? "Ihr Konto" : "Gastzugang"}</strong>
                    <span>{isAccountUser ? auth.user?.email ?? "Angemeldet" : "Ohne Registrierung nutzbar"}</span>
                  </div>
                  {isAccountUser ? (
                    <>
                      <button role="menuitem" type="button" onClick={() => void exportData()} disabled={dataAction === "export"}>Daten exportieren</button>
                      <button role="menuitem" type="button" onClick={() => { setAccountMenuOpen(false); setDeleteOpen(true); }}>Daten & Konto löschen</button>
                      <div className="menu-divider" />
                      <button role="menuitem" type="button" onClick={() => void signOut()}>Abmelden</button>
                    </>
                  ) : (
                    <button role="menuitem" type="button" onClick={() => { setAccountMenuOpen(false); setAuthInitialMode("login"); setAuthOpen(true); }}>Anmelden und fortfahren</button>
                  )}
                </div>
              ) : null}
            </div>
            <button className="icon-button details-toggle" type="button" onClick={() => setDetailsOpen((current) => !current)} aria-label={detailsOpen ? "Projektübersicht ausblenden" : "Projektübersicht einblenden"} aria-pressed={detailsOpen}>▥</button>
          </div>
        </header>

        <div className="chat-scroll" aria-live="polite">
          <div className="conversation">
            {messages.length === 0 && !pendingAssistant ? (
              <WelcomeState onSuggestion={startGuidedRequest} />
            ) : (
              <div className="message-list">
                {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
                {pendingAssistant ? (
                  <PendingMessage
                    pending={pendingAssistant}
                    onRetry={() => {
                      const text = pendingAssistant.retryText;
                      const clientMessageId = pendingAssistant.clientMessageId;
                      setPendingAssistant(null);
                      if (text) void sendMessage(text, false, clientMessageId);
                    }}
                  />
                ) : null}
                {hasResult && !pendingAssistant ? (
                  <ResultSection
                    brief={brief}
                    profiles={profiles}
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
                <span className="selection-check" aria-hidden="true">✓</span>
                <span><strong>{selectedProfile.displayName}</strong> ausgewählt</span>
              </div>
              <button type="button" onClick={() => setContactOpen(true)}>Termin oder Kontakt</button>
            </div>
          ) : null}
          <form className="composer" onSubmit={handleSubmit}>
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
              <div className="composer-hint"><span aria-hidden="true">＋</span> Details jederzeit frei ergänzen</div>
              <button className="send-button" type="submit" disabled={!draft.trim() || Boolean(pendingAssistant)} aria-label="Nachricht senden">↑</button>
            </div>
          </form>
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

      {toast ? <div className={`toast ${toast.tone}`} role="status" key={toast.id}>{toast.message}</div> : null}
    </div>
  );
}

function WelcomeState({ onSuggestion }: { onSuggestion: (suggestion: Suggestion) => void }) {
  return (
    <section className="welcome-state" aria-labelledby="welcome-title">
      <div className="assistant-emblem" aria-hidden="true"><span>✦</span></div>
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
            <span className="suggestion-arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </div>
      <p className="no-form-note"><span aria-hidden="true">⌁</span> Kein Fragebogen – fehlende Angaben bleiben sichtbar als „nicht angegeben“.</p>
    </section>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  if (message.role === "user") {
    return (
      <article className="message-row user-message" aria-label="Ihre Nachricht">
        <div className="message-content"><p>{message.content}</p></div>
      </article>
    );
  }
  return (
    <article className="message-row assistant-message" aria-label="Antwort der KI">
      <div className="message-avatar" aria-hidden="true">✦</div>
      <div className="message-content">
        <div className="message-author">Assistent <span>KI</span></div>
        <p>{message.content}</p>
      </div>
    </article>
  );
}

function PendingMessage({ pending, onRetry }: { pending: PendingAssistant; onRetry: () => void }) {
  const failed = Boolean(pending.retryText);
  return (
    <article className={`message-row assistant-message ${failed ? "has-error" : ""}`} aria-label={failed ? "Fehler" : "Antwort wird erstellt"}>
      <div className="message-avatar" aria-hidden="true">{failed ? "!" : "✦"}</div>
      <div className="message-content">
        <div className="message-author">Assistent <span>KI</span></div>
        {pending.content ? <p>{pending.content}</p> : null}
        {!failed ? (
          <div className="thinking-line"><span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>{pending.progress}</div>
        ) : (
          <button className="text-button" type="button" onClick={onRetry}>Erneut versuchen</button>
        )}
      </div>
    </article>
  );
}

function ResultSection({
  brief,
  profiles,
  selectedProfileId,
  onSelect,
  onContact,
}: {
  brief: StructuredBrief | null;
  profiles: FreelancerProfileResult[];
  selectedProfileId: string | null;
  onSelect: (profile: FreelancerProfileResult) => void;
  onContact: (profile: FreelancerProfileResult) => void;
}) {
  return (
    <section className="result-section" aria-label="Suchergebnis">
      {brief ? <BriefCard brief={brief} /> : null}
      <div className="shortlist-heading">
        <div>
          <p className="eyebrow">Regelbasierter Abgleich</p>
          <h2>{profiles.length ? `${profiles.length} passende ${profiles.length === 1 ? "Person" : "Profile"}` : "Keine passende Person gefunden"}</h2>
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
        <div className="no-match-card">
          <div className="no-match-icon" aria-hidden="true">⌕</div>
          <div>
            <strong>Aktuell gibt es keinen ausreichend passenden Treffer.</strong>
            <p>Wir zeigen kein Ersatzprofil, wenn Pflichtkriterien nicht erfüllt sind. Ergänzen oder ändern Sie Ihre Angaben einfach im Chat.</p>
            <a href={`tel:${CONTACT_PHONE}`}>Roman Dering direkt kontaktieren · {CONTACT_PHONE_LABEL}</a>
          </div>
        </div>
      )}
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
        <span className="brief-status"><span aria-hidden="true">✓</span> Strukturiert</span>
      </div>
      {brief.summary ? <p className="brief-summary">{brief.summary}</p> : null}
      <dl className="brief-grid brief-grid-detailed">
        <DetailTerm label="Pflichtkompetenzen" value={brief.requiredSkills.length ? brief.requiredSkills.join(", ") : null} />
        <DetailTerm label="Optionale Kompetenzen" value={brief.optionalSkills.length ? brief.optionalSkills.join(", ") : null} />
        <DetailTerm label="Sprache" value={brief.languages.length ? brief.languages.join(", ") : null} />
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

function DetailTerm({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={!value ? "is-unknown" : ""}>{value ?? "Nicht angegeben"}</dd>
    </div>
  );
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
            <h4><span aria-hidden="true">✓</span> Warum passend</h4>
            {profile.matchReasons.length ? (
              <ul>{profile.matchReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            ) : <p className="unknown-text">Keine Begründung übermittelt</p>}
          </div>
          <div className="match-column gaps">
            <h4><span aria-hidden="true">○</span> Bekannte Lücken</h4>
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
            <span aria-hidden="true">{profile.referenceStatus === "Verifiziert" ? "✓" : "i"}</span> Referenzstatus: {profile.referenceStatus}
          </p>
        ) : null}

        <footer className="profile-footer">
          <div>
            <strong>{profile.bookingUrl ? "Direktes Erstgespräch" : "Historisches Match"}</strong>
            <span>{profile.bookingUrl ? "Der Booking-Link des Freelancers öffnet sich in einem neuen Tab." : "Dieses Profil ist aktuell nicht direkt buchbar."}</span>
          </div>
          <div className="profile-actions">
            {selected ? (
              <button className="secondary-action" type="button" onClick={onContact}><span aria-hidden="true">✓</span> Kontaktoptionen</button>
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
                Meeting buchen <span aria-hidden="true">→</span>
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
      <span className={verified ? "verified-label" : "reported-label"}>{verified ? "✓" : "i"} {label}</span>
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
          <div className="project-status-line"><span aria-hidden="true">✓</span><div><strong>Anfrage strukturiert</strong><small>Angaben können jederzeit ergänzt werden</small></div></div>
          <dl className="side-details">
            <DetailTerm label="Projekt" value={brief.projectTitle || null} />
            <DetailTerm label="Pflichtkompetenzen" value={brief.requiredSkills.length ? brief.requiredSkills.join(", ") : null} />
            <DetailTerm label="Optionale Kompetenzen" value={brief.optionalSkills.length ? brief.optionalSkills.join(", ") : null} />
            <DetailTerm label="Sprache" value={brief.languages.length ? brief.languages.join(", ") : null} />
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
          <span aria-hidden="true">⌁</span>
          <strong>Noch keine Projektdaten</strong>
          <p>Schreiben Sie frei in den Chat. Die Übersicht entsteht aus Ihren Angaben.</p>
        </div>
      )}

      {selectedProfile ? (
        <div className="selected-side-card">
          <span className="side-card-label">Ausgewählt</span>
          <div className="selected-person"><span>{initials(selectedProfile.displayName)}</span><div><strong>{selectedProfile.displayName}</strong><small>{selectedProfile.role}</small></div></div>
          <button type="button" onClick={onContact}>Termin oder Kontakt <span aria-hidden="true">→</span></button>
          <small>Sie können vorher weiter im Chat ergänzen.</small>
        </div>
      ) : null}

      <div className="human-contact-card">
        <div className="live-row"><span className="live-dot" aria-hidden="true" /> Live erreichbar</div>
        <h3>Roman Dering</h3>
        <p>Persönlicher Ansprechpartner für Profilfragen und die Einführung.</p>
        <a href={`tel:${CONTACT_PHONE}`}>{CONTACT_PHONE_LABEL}</a>
      </div>

      <div className="ai-note"><span aria-hidden="true">i</span><p><strong>Transparente Unterstützung</strong>Die KI strukturiert Ihre Anfrage. Profile werden nach festen, überprüfbaren Regeln gefiltert.</p></div>
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
        <button ref={closeRef} className="modal-close" type="button" onClick={onClose} aria-label="Dialog schließen">×</button>
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
  initialMode: "login" | "register" | "set-password";
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
    if (mode === "set-password" && password !== passwordRepeat) {
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
        await beginEmailUpgrade(email);
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
      setError(
        emailError instanceof Error
          ? emailError.message
          : mode === "login"
            ? "E-Mail oder Passwort ist nicht korrekt."
            : "Das Konto konnte gerade nicht eingerichtet werden.",
      );
      setBusy(null);
    }
  };

  return (
    <Modal titleId="auth-title" onClose={onClose}>
      <div className="auth-dialog">
        <span className="dialog-eyebrow">Auswahl sichern</span>
        <h2 id="auth-title">
          {mode === "set-password" ? "Konto fertig einrichten" : "Anmelden und direkt fortfahren"}
        </h2>
        <p>
          {mode === "set-password"
            ? "Ihre E-Mail wurde bestätigt. Legen Sie jetzt Ihr Passwort fest."
            : "Ihre Anfrage bleibt erhalten. Nach der Anmeldung kehren Sie genau zu Ihrem ausgewählten Profil zurück."}
        </p>

        {mode !== "set-password" ? (
          <>
            <div className="provider-buttons">
              <button type="button" onClick={() => void connectProvider("google")} disabled={Boolean(busy)}><span className="provider-letter" aria-hidden="true">G</span>{busy === "google" ? "Google wird geöffnet …" : "Mit Google fortfahren"}</button>
              <button type="button" onClick={() => void connectProvider("microsoft")} disabled={Boolean(busy)}><span className="provider-letter microsoft" aria-hidden="true">M</span>{busy === "microsoft" ? "Microsoft wird geöffnet …" : "Mit Microsoft fortfahren"}</button>
            </div>
            <div className="or-divider"><span>oder</span></div>
            <div className="auth-mode-tabs" role="tablist" aria-label="E-Mail-Zugang">
              <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(null); }}>Bestehendes Konto</button>
              <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(null); }}>Neues Konto</button>
            </div>
          </>
        ) : null}

        {confirmationSent ? (
          <div className="confirmation-state" role="status">
            <span aria-hidden="true">✓</span>
            <h3>Bestätigungslink versendet</h3>
            <p>Öffnen Sie den Link in der E-Mail an <strong>{email}</strong>. Anschließend legen Sie hier Ihr Passwort fest und fahren mit Ihrer Auswahl fort.</p>
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
            {mode !== "register" ? (
              <>
                <label htmlFor="login-password">{mode === "set-password" ? "Neues Passwort" : "Passwort"}</label>
                <input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "set-password" ? "new-password" : "current-password"} minLength={8} required />
              </>
            ) : null}
            {mode === "set-password" ? (
              <>
                <label htmlFor="login-password-repeat">Passwort wiederholen</label>
                <input id="login-password-repeat" type="password" value={passwordRepeat} onChange={(event) => setPasswordRepeat(event.target.value)} autoComplete="new-password" minLength={8} required />
              </>
            ) : null}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="auth-submit" type="submit" disabled={Boolean(busy)}>
              {busy === "email"
                ? "Bitte warten …"
                : mode === "login"
                  ? "Mit E-Mail anmelden"
                  : mode === "register"
                    ? "Bestätigungslink senden"
                    : "Passwort speichern & fortfahren"}
            </button>
          </form>
        )}
        <p className="auth-privacy">Die Anmeldung dient dazu, Projekte geräteübergreifend zuzuordnen und eine Profilwahl sicher fortzusetzen.</p>
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
            <div className="roman-card">
              <div className="live-row"><span className="live-dot" aria-hidden="true" /> Live erreichbar</div>
              <h3>Roman Dering begleitet den Kontakt</h3>
              <p>{profile.bookingUrl ? "Buchen Sie direkt einen freien Termin beim Freelancer. Bei Rückfragen ist Roman Dering zusätzlich erreichbar." : "Dieses historische Match ist derzeit nicht direkt buchbar. Roman Dering hilft bei Rückfragen oder Alternativen."}</p>
              <a className="phone-action" href={`tel:${CONTACT_PHONE}`}><span aria-hidden="true">☎</span><span><small>Direkt anrufen</small>{CONTACT_PHONE_LABEL}</span></a>
            </div>
            <div className="continue-note"><span aria-hidden="true">＋</span><p><strong>Noch etwas ergänzen?</strong>Schließen Sie dieses Fenster und schreiben Sie frei im Chat weiter. Die Terminoption bleibt sichtbar.</p></div>
          </div>
          <div className="calendar-area">
            <div className="calendar-consent">
              <div className="calendar-symbol" aria-hidden="true"><span>↗</span><small>BOOKING</small></div>
              <h3>{profile.bookingUrl ? "Direkt Termin wählen" : "Aktuell nicht buchbar"}</h3>
              <p>{profile.bookingUrl ? `Die Buchungsseite von ${profile.displayName} wird erst nach Ihrem Klick in einem neuen Tab geöffnet.` : "Der frühere Treffer bleibt zur Nachvollziehbarkeit sichtbar, aber es ist kein aktueller Booking-Link freigegeben."}</p>
              {profile.bookingUrl ? (
                <a
                  className="booking-link-action"
                  href={profile.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Meeting buchen <span aria-hidden="true">→</span>
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
        <span className="danger-symbol" aria-hidden="true">!</span>
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
