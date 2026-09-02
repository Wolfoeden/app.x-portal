"use client";

/**
 * Everything that renders a matching result: the shortlist section, the
 * structured brief, profile cards and the project detail panel.
 *
 * Moved out of ChatWorkspace unchanged. This is the surface a customer
 * actually reads a recommendation from, and it had no boundary of its own.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { appPath } from "@/lib/app-path";
import { MINIMUM_CORE_COVERAGE_BASIS_POINTS } from "@/lib/domain/matching";

import {
  BRIEF_FIELDS,
  briefToDraft,
  composeBriefUpdateMessage,
  draftChanges,
  MODE_OPTIONS,
  type BriefDraft,
} from "./brief-editor";
import { factPreview } from "./fact-preview";
import { shouldHighlightProfile } from "./profile-fit";

import type {
  AiAnalysisTrace,
  AvailabilityStatus,
  CvAccess,
  ExternalFreelancerSearchResponse,
  FreelancerProfileResult,
  MatchingStatus,
  ProjectMode,
  SavedFreelancer,
  StructuredBrief,
  StructuredRequirementGroup,
} from "../chat-contract";
import {
  IconAlertCircle,
  IconArrowRight,
  IconArrowUpRight,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconDocument,
  IconInfo,
  IconMaximize,
  IconMinimize,
  IconSearch,
  IconSpark,
} from "../icons";

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
import { EXTERNAL_SEARCH_CREDITS } from "@/lib/ai/credit-policy";

import { AgentLaunchPanel, agentLaunchState } from "./agent-launch";
import { initials, isRecord, nullableString } from "./shared";

const observedProfileCards = new Set<string>();

function avatarStyle(avatarUrl?: string | null) {
  return avatarUrl
    ? { backgroundImage: `url(${JSON.stringify(avatarUrl)})` }
    : undefined;
}

function useProfileImpression(
  profile: FreelancerProfileResult,
  projectId: string | null,
) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || profile.demoStatus !== "real") return;
    const observationKey = `${projectId ?? "saved"}:${profile.id}`;
    if (observedProfileCards.has(observationKey)) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)) {
          if (timer) return;
          timer = setTimeout(() => {
            observedProfileCards.add(observationKey);
            observer.disconnect();
            void fetch(appPath("/api/freelancer-events"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              keepalive: true,
              body: JSON.stringify({
                eventKey: crypto.randomUUID(),
                profileId: profile.id,
                eventType: "profile_view",
                source: "profile_card",
              }),
            }).catch(() => undefined);
          }, 1_000);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: [0.5] },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [profile.demoStatus, profile.id, projectId]);
  return ref;
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

function modeLabel(mode: ProjectMode) {
  if (mode === "remote") return "Remote";
  if (mode === "on-site") return "Vor Ort";
  if (mode === "hybrid") return "Hybrid";
  return "Nicht angegeben";
}

function availabilityLabel(status: AvailabilityStatus) {
  if (status === "available") return "Verfügbarkeit bestätigt";
  if (status === "limited") return "Begrenzt verfügbar";
  if (status === "unavailable") return "Nicht verfügbar";
  return "Verfügbarkeit offen";
}

function presentUnknownFields(fields: string[]) {
  return fields.map((field) => unknownFieldLabels[field] ?? field);
}

/**
 * Mehrere Treffer als Stapel statt untereinander.
 *
 * Drei volle Profilkarten hintereinander sind laenger als der Bildschirm hoch
 * ist: wer den zweiten mit dem ersten vergleichen will, muss scrollen und aus
 * dem Gedaechtnis vergleichen. Der Stapel zeigt einen und laesst durchblaettern,
 * der vergroesserte Zustand klappt beide Leisten ein und stellt sie
 * nebeneinander — dann liegt der Vergleich nebeneinander statt untereinander.
 */
function ProfileStack({
  profiles,
  renderCard,
  focused,
  onToggleFocus,
}: {
  profiles: FreelancerProfileResult[];
  renderCard: (profile: FreelancerProfileResult, index: number) => ReactNode;
  focused: boolean;
  onToggleFocus: () => void;
}) {
  const [active, setActive] = useState(0);
  // Kommt ein neues Ergebnis mit weniger Treffern, zeigt der Zeiger sonst ins
  // Leere und der Stapel bliebe blank.
  const current = Math.min(active, Math.max(0, profiles.length - 1));

  useEffect(() => {
    if (!focused) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onToggleFocus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focused, onToggleFocus]);

  if (profiles.length === 1) {
    return <div className="profile-list">{renderCard(profiles[0], 0)}</div>;
  }

  if (focused) {
    return (
      <div className="profile-compare">
        {/* Die Leiste bleibt beim Scrollen stehen: der Weg zurueck darf nicht
            davon abhaengen, wie weit jemand in die Karten hineingescrollt ist.
            Escape tut dasselbe — im vergroesserten Zustand sind beide
            Seitenleisten weg, und das erwartet man dann zurueckdrehen zu
            koennen, ohne den Knopf zu suchen. */}
        <div className="profile-compare-bar">
          <p>{profiles.length} Profile nebeneinander</p>
          <button className="primary-action profile-compare-close" type="button" onClick={onToggleFocus}>
            <IconMinimize size={13} /> Ansicht verkleinern
          </button>
        </div>
        <div className="profile-compare-grid" data-count={profiles.length}>
          {profiles.map((profile, index) => (
            <div className="profile-compare-cell" key={profile.id}>
              {renderCard(profile, index)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="profile-stack">
      <div className="profile-stack-bar">
        <div className="profile-stack-nav">
          <button
            type="button"
            aria-label="Vorheriges Profil"
            disabled={current === 0}
            onClick={() => setActive(current - 1)}
          >
            <IconChevronLeft size={15} />
          </button>
          <span aria-live="polite">
            {current + 1} von {profiles.length}
          </span>
          <button
            type="button"
            aria-label="Nächstes Profil"
            disabled={current === profiles.length - 1}
            onClick={() => setActive(current + 1)}
          >
            <IconChevronRight size={15} />
          </button>
        </div>
        <button className="text-button" type="button" onClick={onToggleFocus}>
          <IconMaximize size={13} /> Nebeneinander vergleichen
        </button>
      </div>

      {/* Die verdeckten Karten bleiben im Baum, damit ein Wechsel nicht jedes
          Mal Zustand und Sichtbarkeitsmeldung der Karte neu aufbaut. */}
      <div className="profile-stack-deck">
        {profiles.map((profile, index) => (
          <div
            className={`profile-stack-item${index === current ? " is-active" : ""}`}
            key={profile.id}
            aria-hidden={index === current ? undefined : true}
            inert={index !== current}
          >
            {renderCard(profile, index)}
          </div>
        ))}
        <div className="profile-stack-shadow" aria-hidden="true" data-remaining={profiles.length - current - 1} />
      </div>
    </div>
  );
}

export function ResultSection({
  brief,
  projectId,
  profiles,
  partialProfiles,
  matchingStatus,
  analysis,
  analysisMode,
  externalSearch,
  externalSearchState,
  onExternalSearch,
  isAccountUser,
  creditsRemaining,
  onRequireLogin,
  onNeedCredits,
  selectedProfileId,
  onSelect,
  onContact,
  onRequestBooking,
  expandedProfileUrl,
  onToggleExpand,
  savedFreelancerIds,
  onToggleSave,
  onOpenDetails,
  profileFocus,
  onToggleProfileFocus,
  detailsOpen,
}: {
  brief: StructuredBrief | null;
  projectId: string | null;
  profiles: FreelancerProfileResult[];
  partialProfiles: FreelancerProfileResult[];
  matchingStatus: MatchingStatus | null;
  analysis: AiAnalysisTrace | null;
  analysisMode: "ai" | "fallback" | null;
  externalSearch: ExternalFreelancerSearchResponse | null;
  externalSearchState: "idle" | "searching" | "error";
  onExternalSearch: () => void;
  isAccountUser: boolean;
  /** Der eine Kontostand. Null, solange er noch geladen wird. */
  creditsRemaining: number | null;
  onRequireLogin: () => void;
  onNeedCredits: () => void;
  selectedProfileId: string | null;
  onSelect: (profile: FreelancerProfileResult) => void;
  onContact: (profile: FreelancerProfileResult) => void;
  onRequestBooking: (profile: FreelancerProfileResult) => void;
  expandedProfileUrl: string | null;
  onToggleExpand: (profileUrl: string | null) => void;
  savedFreelancerIds: readonly string[];
  onToggleSave: (profile: FreelancerProfileResult) => void;
  onOpenDetails?: () => void;
  /** Beide Leisten eingeklappt, Profile nebeneinander. */
  profileFocus: boolean;
  onToggleProfileFocus: () => void;
  /** Steht die Projektuebersicht offen, bleibt fuer die Karten wenig Breite. */
  detailsOpen: boolean;
}) {
  const launchState = agentLaunchState(isAccountUser, creditsRemaining);
  /**
   * Die Karte erscheint nur, wenn sie etwas sagt, das nicht schon oben steht.
   *
   * Im Normalfall stand dort „Kein aktives und direkt buchbares Profil
   * erreicht derzeit die Empfehlungsschwelle“ — direkt unter der Überschrift
   * „Kein ausreichend passendes internes Profil“. Dieselbe Aussage zweimal
   * hintereinander, dazu die Erklaerung der Schwelle, die in der
   * Ergebnisoffenlegung ohnehin steht. Uebrig bleiben die Faelle mit eigenem
   * Inhalt: eine unklare Anfrage, vorhandene Teiltreffer, die Basisanalyse und
   * ein Altergebnis ohne Einstufung.
   */
  const showNoMatchCard =
    matchingStatus === "needs_clarification" ||
    partialProfiles.length > 0 ||
    analysisMode === "fallback" ||
    matchingStatus !== "no_reliable_match";
  /**
   * Bei offener Projektuebersicht zeigen die Karten nur noch Kopf und
   * Aktionen. Aufgeklappt ist immer hoechstens eine: zwei ausgeklappte Karten
   * nebeneinander in der schmalen Spalte waeren genau der Zustand, den das
   * Einklappen vermeiden soll.
   */
  const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null);
  // Im Vergleich sind beide Leisten eingeklappt und der Platz ist gerade der
  // Zweck — dort waere ein zusaetzlich zusammengefaltetes Profil widersinnig.
  const cardsCollapsible = detailsOpen && !profileFocus;
  const resultHeading =
    matchingStatus === "needs_clarification"
      ? "Bitte konkretisieren Sie die Anforderung"
      : matchingStatus === "no_reliable_match"
        ? partialProfiles.length
          ? `${partialProfiles.length} ${partialProfiles.length === 1 ? "nicht empfohlener Teiltreffer" : "nicht empfohlene Teiltreffer"}`
          : "Kein ausreichend passendes internes Profil"
        : profiles.length
          ? `${profiles.length} ${profiles.length === 1 ? "passendes internes Profil" : "passende interne Profile"}`
          : "Kein gespeichertes internes Ergebnis";
  return (
    <section className="result-section" aria-label="Suchergebnis">
      <div className="shortlist-heading">
        <div>
          <p className="eyebrow">Interner Profilabgleich</p>
          <h2>{resultHeading}</h2>
        </div>
        {profiles.length ? (
          <span className="result-count">Maximal 3 Ergebnisse</span>
        ) : partialProfiles.length ? (
          <span className="result-count is-warning">Keine Empfehlung</span>
        ) : null}
      </div>
      {brief ? <BriefSummaryLine brief={brief} onOpenDetails={onOpenDetails} /> : null}
      {profiles.length ? (
        <>
          <p className="matching-disclosure">Die Reihenfolge folgt dokumentierten Kriterien wie Pflichtkompetenzen, Sprache, Arbeitsmodus und Verfügbarkeit. Die KI trifft keine Einstellungsentscheidung.</p>
          <ProfileStack
            profiles={profiles.slice(0, 3)}
            focused={profileFocus}
            onToggleFocus={onToggleProfileFocus}
            renderCard={(profile, index) => (
              <ProfileCard
                profile={profile}
                position={index + 1}
                isAccountUser={isAccountUser}
                projectId={projectId}
                selected={selectedProfileId === profile.id}
                onSelect={() => onSelect(profile)}
                onContact={() => onContact(profile)}
                onRequestBooking={() => onRequestBooking(profile)}
                saved={savedFreelancerIds.includes(profile.id)}
                onToggleSave={() => onToggleSave(profile)}
                collapsed={cardsCollapsible && expandedProfileId !== profile.id}
                onToggleCollapsed={
                  cardsCollapsible
                    ? () =>
                        setExpandedProfileId((current) =>
                          current === profile.id ? null : profile.id,
                        )
                    : undefined
                }
              />
            )}
          />
        </>
      ) : (
        <>
          {partialProfiles.length ? (
            <>
              <p className="matching-disclosure is-warning">
                Diese Profile haben belegte Überschneidungen, erfüllen aber nicht alle Muss-Kriterien oder bleiben unter 70 % Kernabdeckung. Sie sind ausdrücklich keine Empfehlung und können aus diesem Ergebnis nicht direkt gebucht werden.
              </p>
              <div className="profile-list partial-profile-list">
                {partialProfiles.slice(0, 2).map((profile, index) => (
                  <ProfileCard
                    key={profile.id}
                    profile={profile}
                    position={index + 1}
                    isAccountUser={isAccountUser}
                    projectId={projectId}
                    selected={false}
                    onSelect={() => undefined}
                    onContact={() => undefined}
                    onRequestBooking={() => onRequestBooking(profile)}
                    saved={savedFreelancerIds.includes(profile.id)}
                    onToggleSave={() => onToggleSave(profile)}
                  />
                ))}
              </div>
            </>
          ) : null}
          {showNoMatchCard ? (
            <div className="no-match-card">
              <div className="no-match-icon" aria-hidden="true"><IconSearch size={19} /></div>
              <div>
                <strong>
                  {matchingStatus === "needs_clarification"
                    ? "Nennen Sie bitte mindestens die gewünschte Rolle oder eine benötigte Kernkompetenz."
                    : partialProfiles.length
                      ? "Keiner der internen Teiltreffer erreicht die Empfehlungsschwelle."
                      : analysisMode === "fallback"
                        ? "Strukturiert wurde mit der sicheren Basisanalyse, nicht mit der KI."
                        : "Für dieses historische Ergebnis ist keine Qualitätsklassifikation gespeichert."}
                </strong>
                <p>
                  {matchingStatus === "needs_clarification"
                    ? "Ohne prüfbare Kompetenzanforderung wird kein Profil geraten und keine kostenpflichtige Recherche angeboten."
                    : partialProfiles.length
                      ? "Prüfen Sie die offengelegten Lücken oder lockern Sie ein Kriterium im Chat."
                      : analysisMode === "fallback"
                        ? "Die Anforderungen können dadurch gröber gefasst sein als beschrieben."
                        : "Ältere Ergebnisse führen die Einstufung nicht mit."}
                </p>
              </div>
            </div>
          ) : null}
          {/* Der Agent steht bewusst neben der Absage und nicht darin: er ist
              nicht die Fußnote eines leeren Ergebnisses, sondern der nächste
              Schritt. */}
          {matchingStatus === "no_reliable_match" &&
          (analysis?.externalSearchAvailable ?? true) &&
          externalSearch?.mode !== "openai" ? (
            <AgentLaunchPanel
              state={launchState}
              searching={externalSearchState === "searching"}
              failed={externalSearchState === "error"}
              onStart={onExternalSearch}
              onRequireLogin={onRequireLogin}
              onNeedCredits={onNeedCredits}
            />
          ) : null}
          {externalSearch ? (
            <ExternalSearchResults
              result={externalSearch}
              expandedProfileUrl={expandedProfileUrl}
              onToggleExpand={onToggleExpand}
            />
          ) : null}
        </>
      )}
      {/* Der Arbeitsprozess stand hier als aufklappbarer Block unter jedem
          Ergebnis und war fuer die meisten nur eine Zeile, die man wegliest.
          Er steht jetzt in der Projektuebersicht, wo die uebrigen Angaben zur
          Arbeitsweise schon stehen — samt der Offenlegung, ob die Anfrage mit
          einer bestaetigten KI-Antwort oder mit der Basisanalyse strukturiert
          wurde. Die darf nicht verschwinden, sie sagt je nach Lauf etwas
          anderes. */}
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
    return "Die Anforderungen wurden mit einer bestätigten KI-Antwort strukturiert. XPORTAL unterstützt die Vorauswahl, trifft aber keine Einstellungsentscheidung und ergänzt keine fehlenden Profildaten.";
  }
  if (trace.provider.succeeded) {
    return "Die KI-Antwort wurde nicht für die Strukturierung oder Profilauswahl verwendet. Eine konservative Basisanalyse hat die Angaben strukturiert; die Profilauswahl bleibt regelbasiert.";
  }
  return "Die Anfrage wurde ohne bestätigte KI-Antwort verarbeitet. Eine konservative Basisanalyse hat die Angaben strukturiert; die Profilauswahl bleibt regelbasiert.";
}

export function visibleAnalysisSteps(
  trace: AiAnalysisTrace,
  profileCount: number,
  partialProfileCount = 0,
): AiAnalysisTrace["steps"] {
  const providerConfirmed = trace.provider.succeeded && !trace.provider.fallback;
  return [
    {
      label: "Projektanforderungen strukturiert",
      detail: providerConfirmed
        ? "Rolle, Kompetenzen und Rahmenbedingungen wurden getrennt; fehlende Angaben bleiben ausdrücklich offen."
        : "Die gespeicherten Angaben wurden konservativ in Projektfelder übertragen; fehlende Angaben bleiben ausdrücklich offen.",
      status: providerConfirmed ? "completed" : "warning",
    },
    {
      label: "Profile nach festen Kriterien geprüft",
      detail: "Aktive und buchbare Profile wurden anhand der dokumentierten Muss- und Kernanforderungen geprüft.",
      status: "completed",
    },
    {
      label: "Ergebnis nach belegter Passung priorisiert",
      detail: profileCount > 0
        ? `${Math.min(profileCount, 3)} von maximal drei Profilen werden mit Belegen und offenen Punkten angezeigt.`
        : partialProfileCount > 0
          ? `${Math.min(partialProfileCount, 2)} nicht empfohlene Teiltreffer werden mit ihren belegten Überschneidungen und ausschlaggebenden Lücken angezeigt.`
        : "Es wurde kein ausreichend relevantes internes Profil gefunden; es wird kein Kandidat erfunden.",
      status: "completed",
    },
  ];
}

export function AnalysisTrace({
  trace,
  profileCount,
  partialProfileCount,
}: {
  trace: AiAnalysisTrace;
  profileCount: number;
  partialProfileCount: number;
}) {
  const modelLabel = providerModelLabel(trace);
  const steps = visibleAnalysisSteps(trace, profileCount, partialProfileCount);
  return (
    <details className="analysis-trace">
      <summary>
        <span className="analysis-trace-icon" aria-hidden="true"><IconSpark size={15} /></span>
        <span>
          <strong>Arbeitsprozess</strong>
          <small>Anfrage strukturiert · Profile geprüft · Ergebnis priorisiert</small>
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
      <p className="analysis-runtime-note">
        Technischer Status: {providerStatusLabel(trace)}{modelLabel ? ` · ${modelLabel}` : ""}
      </p>
      <p className="analysis-trace-disclosure">{analysisDisclosure(trace)}</p>
    </details>
  );
}

/** Eingeklappt zeigt die Karte nur, was zum Wiedererkennen nötig ist. */
export const COLLAPSED_SKILL_COUNT = 5;

function ExternalSearchResults({
  result,
  expandedProfileUrl,
  onToggleExpand,
}: {
  result: ExternalFreelancerSearchResponse;
  expandedProfileUrl: string | null;
  onToggleExpand: (profileUrl: string | null) => void;
}) {
  return (
    <section className="external-results" aria-label="Externe, nicht verifizierte Suchergebnisse">
      <div className="external-results-heading">
        <div><p className="eyebrow">Recherche-Agent · {EXTERNAL_SEARCH_CREDITS} Credits</p><h3>Öffentlich gefundene Profile</h3></div>
        <span>Nicht verifiziert</span>
      </div>
      {result.completedAt ? (
        <p className="external-history-meta">Gespeicherte Recherche vom {formatDateTime(result.completedAt)}</p>
      ) : null}
      <p className="external-disclosure">{result.disclosure}</p>
      {result.candidates.length ? (
        <div className="external-profile-list">
          {result.candidates.map((candidate) => {
            const expanded = expandedProfileUrl === candidate.profileUrl;
            const collapsedSkills = candidate.skills.slice(0, COLLAPSED_SKILL_COUNT);
            const hiddenSkillCount = Math.max(
              candidate.skills.length - COLLAPSED_SKILL_COUNT,
              0,
            );
            return (
            <article
              className={`external-profile-card${expanded ? " is-expanded" : ""}`}
              key={candidate.profileUrl}
            >
              <div className="external-profile-topline">
                <span>Extern</span>
                <button
                  type="button"
                  className="external-expand-toggle"
                  aria-expanded={expanded}
                  onClick={() => onToggleExpand(expanded ? null : candidate.profileUrl)}
                >
                  {expanded ? "Einklappen" : "Alle Angaben"}
                  <IconChevronDown size={12} />
                </button>
              </div>
              <h3>{candidate.displayName}</h3>
              <p className="external-role">{candidate.role}</p>

              {expanded ? null : (
                <>
                  {collapsedSkills.length ? (
                    <ul className="external-skill-chips">
                      {collapsedSkills.map((skill) => (
                        <li key={skill}>{skill}</li>
                      ))}
                      {hiddenSkillCount ? (
                        <li className="is-more">+{hiddenSkillCount}</li>
                      ) : null}
                    </ul>
                  ) : null}
                  <div className="external-links is-compact">
                    <a href={candidate.profileUrl} target="_blank" rel="noopener noreferrer">
                      Profil öffnen
                    </a>
                  </div>
                </>
              )}

              {expanded ? (
                <>
                <p className="external-verify-note">Angaben vor Kontakt prüfen</p>
              {candidate.nameVerified ? null : (
                <p className="external-fact is-gap">
                  <strong>Name nicht aus der Adresse belegt</strong>
                  <span>
                    Die Profilseite nennt diesen Namen, die Adresse selbst
                    enthält ihn nicht. Vor einer Kontaktaufnahme auf der
                    verlinkten Quelle prüfen.
                  </span>
                </p>
              )}
              <p>{candidate.summary}</p>
              {candidate.skills.length ? (
                <div className="external-fact"><strong>Kenntnisse</strong><p>{candidate.skills.join(" · ")}</p></div>
              ) : null}
              {candidate.activities.length ? (
                <div className="external-fact"><strong>Tätigkeiten</strong><p>{candidate.activities.join(" · ")}</p></div>
              ) : null}
              {candidate.projects.length ? (
                <div className="external-fact"><strong>Projekte</strong><p>{candidate.projects.join(" · ")}</p></div>
              ) : null}
              {candidate.matchedRequirements.length ? (
                <div className="external-fact"><strong>Gefundene Übereinstimmungen</strong><p>{candidate.matchedRequirements.join(" · ")}</p></div>
              ) : null}
              {candidate.knownGaps.length ? (
                <div className="external-fact is-gap"><strong>Offen / ungeprüft</strong><p>{candidate.knownGaps.join(" · ")}</p></div>
              ) : null}
              <div className="external-links">
                <a href={candidate.profileUrl} target="_blank" rel="noopener noreferrer">Profilquelle öffnen</a>
                {candidate.linkedinUrl ? (
                  <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer">LinkedIn</a>
                ) : null}
                {candidate.websiteUrl ? (
                  <a href={candidate.websiteUrl} target="_blank" rel="noopener noreferrer">Website</a>
                ) : null}
                {candidate.portfolioUrl ? (
                  <a href={candidate.portfolioUrl} target="_blank" rel="noopener noreferrer">Portfolio</a>
                ) : null}
                {candidate.bookingUrl ? (
                  <a className="external-booking-link" href={candidate.bookingUrl} target="_blank" rel="noopener noreferrer">Terminseite öffnen <IconArrowUpRight size={12} /></a>
                ) : null}
              </div>
              {candidate.sourceUrls.length ? (
                <p className="external-sources">Quellen: {candidate.sourceUrls.map((url, index) => (
                  <span key={url}>{index ? " · " : ""}<a href={url} target="_blank" rel="noopener noreferrer">{new URL(url).hostname}</a></span>
                ))}</p>
              ) : null}
                </>
              ) : null}
            </article>
            );
          })}
        </div>
      ) : (
        <p className="external-empty">Auch in der Websuche wurde kein Profil gefunden, dessen öffentliche Quellen sich belegen ließen.</p>
      )}
      <details className="external-trace">
        <summary>Rechercheprozess anzeigen</summary>
        <p>{result.searchTrace.consultedSourceCount} öffentlich zugängliche Quellen wurden berücksichtigt; {result.searchTrace.returnedCandidateCount} Ergebnis(se) erfüllten die Ausgaberegeln.</p>
        {result.searchTrace.toolCallCount ? (
          <p>
            {result.searchTrace.toolCallCount} Suchanfrage(n) ausgeführt ·{" "}
            {EXTERNAL_SEARCH_CREDITS} Credits belastet
          </p>
        ) : null}
        {result.searchTrace.queries.length ? <ul>{result.searchTrace.queries.map((query) => <li key={query}>{query}</li>)}</ul> : null}
      </details>
    </section>
  );
}

/** Basis points are the matcher's unit; the reader wants a percentage. */
const RECOMMENDATION_THRESHOLD_PERCENT = MINIMUM_CORE_COVERAGE_BASIS_POINTS / 100;

function requirementCount(
  brief: StructuredBrief,
  priority: StructuredRequirementGroup["priority"],
): number {
  return brief.requirementGroups.filter((group) => group.priority === priority)
    .length;
}

/**
 * Was aus der Anfrage verstanden wurde — in einer Zeile ueber dem Ergebnis.
 *
 * Das war eine Karte mit Ueberschrift, Zusammenfassung und eigenem Knopf, und
 * sie stand unter den Profilen. Beides war verkehrt herum: der Steckbrief ist
 * die Voraussetzung des Ergebnisses, nicht sein Anhang, und alles darin steht
 * ohnehin ausfuehrlich in der rechten Leiste. Bleibt der Titel, die Zaehlung
 * und der Weg dorthin.
 */
export function BriefSummaryLine({
  brief,
  onOpenDetails,
}: {
  brief: StructuredBrief;
  onOpenDetails?: () => void;
}) {
  const openFields = presentUnknownFields(brief.unknownFields);
  const counts = [
    requirementCount(brief, "hard") ? `${requirementCount(brief, "hard")} Muss` : null,
    requirementCount(brief, "core") ? `${requirementCount(brief, "core")} Kern` : null,
    requirementCount(brief, "optional")
      ? `${requirementCount(brief, "optional")} optional`
      : null,
    openFields.length ? `${openFields.length} offen` : null,
  ].filter(Boolean);

  return (
    <div className="brief-line">
      <span className="brief-line-mark" aria-hidden="true"><IconCheck size={12} /></span>
      <p className="brief-line-text">
        <strong>{brief.projectTitle}</strong>
        {counts.length ? <span>{counts.join(" · ")}</span> : null}
      </p>
      {onOpenDetails ? (
        <button className="brief-line-action" type="button" onClick={onOpenDetails}>
          Anforderungen <IconArrowRight size={12} />
        </button>
      ) : null}
    </div>
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

export type CvActionState = {
  kind: CvAccess;
  label: string;
  disabled: boolean;
};

export function cvActionState(
  profile: Pick<FreelancerProfileResult, "cvAccess">,
  isAccountUser: boolean,
): CvActionState {
  // Authentication wins over response data so a stale or malformed guest
  // payload cannot disclose whether a CV exists.
  if (!isAccountUser) {
    return { kind: "login_required", label: "Lebenslauf nur mit Konto", disabled: true };
  }

  const access = profile.cvAccess ?? "forbidden";
  if (access === "available") {
    return { kind: access, label: "Lebenslauf herunterladen", disabled: false };
  }
  if (access === "missing") {
    return {
      kind: access,
      label: "Kein Lebenslauf hinterlegt",
      disabled: true,
    };
  }
  return { kind: access, label: "Lebenslauf nicht verfügbar", disabled: true };
}

function cvDownloadErrorMessage(status: number): string {
  if (status === 401) return "Bitte melden Sie sich erneut an, um den CV herunterzuladen.";
  if (status === 403) return "Für diesen CV-Download fehlt die Berechtigung.";
  if (status === 404) return "Der CV ist nicht verfügbar.";
  return "Der CV konnte nicht heruntergeladen werden. Bitte versuchen Sie es erneut.";
}

function secureDownloadUrl(value: unknown): string | null {
  const candidate = nullableString(value);
  if (!candidate) return null;
  try {
    return new URL(candidate).protocol === "https:" ? candidate : null;
  } catch {
    return null;
  }
}

export async function requestFreelancerCvDownload(
  profileId: string,
  projectId: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (!profileId || !projectId) {
    throw new Error("Der CV-Download ist keinem gültigen Projekt zugeordnet.");
  }
  const response = await fetcher(
    appPath(`/api/freelancers/${encodeURIComponent(profileId)}/cv`),
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ projectId }),
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error(cvDownloadErrorMessage(response.status));

  const body: unknown = await response.json().catch(() => null);
  const source = isRecord(body) && isRecord(body.data) ? body.data : body;
  const downloadUrl = isRecord(source)
    ? secureDownloadUrl(source.downloadUrl ?? source.download_url)
    : null;
  if (!downloadUrl) {
    throw new Error("Der Server hat keinen sicheren CV-Download bereitgestellt.");
  }
  return downloadUrl;
}

export function navigateToCvDownload(
  downloadUrl: string,
  navigator: { assign: (url: string) => void } = window.location,
): void {
  navigator.assign(downloadUrl);
}

export type BookingActionState = {
  kind: "login_required" | "bookable" | "unavailable";
  label: string;
  hint: string;
  disabled: boolean;
};

/**
 * Booking used to be a bare link straight to the freelancer's calendar, so a
 * guest left the product without the selection ever being recorded. A guest is
 * now taken through the sign-in first and returns to this exact profile.
 */
export function bookingActionState(
  profile: Pick<FreelancerProfileResult, "bookingUrl">,
  isAccountUser: boolean,
): BookingActionState {
  if (!profile.bookingUrl) {
    return {
      kind: "unavailable",
      label: "Aktuell nicht buchbar",
      hint: "Dieses Profil ist aktuell nicht direkt buchbar.",
      disabled: true,
    };
  }
  if (!isAccountUser) {
    return {
      kind: "login_required",
      label: "Anmelden & Terminseite öffnen",
      hint: "Nach der Anmeldung geht es direkt mit diesem Profil weiter.",
      disabled: false,
    };
  }
  return {
    kind: "bookable",
    label: "Terminseite öffnen",
    hint: "Die Terminseite des Freelancers öffnet sich in einem neuen Tab.",
    disabled: false,
  };
}

export function ProfileCard({
  profile,
  position,
  isAccountUser,
  projectId,
  selected,
  onSelect,
  onContact,
  onRequestBooking,
  saved,
  onToggleSave,
  collapsed = false,
  onToggleCollapsed,
}: {
  profile: FreelancerProfileResult;
  position: number;
  isAccountUser: boolean;
  projectId: string | null;
  selected: boolean;
  onSelect: () => void;
  onContact: () => void;
  onRequestBooking: () => void;
  saved: boolean;
  onToggleSave: () => void;
  /** Nur Kopf und Aktionen zeigen — der Text bleibt zu. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const verifiedFacts = profile.facts.filter((fact) => fact.verification === "verified");
  const selfReportedFacts = profile.facts.filter((fact) => fact.verification === "self-reported");
  const isPartial = profile.recommendationRole === "partial";
  const cvAction = cvActionState(profile, isAccountUser);
  const bookingAction = bookingActionState(profile, isAccountUser);
  const [cvDownloadState, setCvDownloadState] = useState<"idle" | "loading" | "error">("idle");
  const [cvDownloadError, setCvDownloadError] = useState<string | null>(null);
  const cardRef = useProfileImpression(profile, projectId);
  // Einmal, nicht dauernd: eine Karte, die weiterpulsiert, liest sich als
  // Aufforderung statt als Hinweis und zieht den Blick von den Karten daneben
  // ab, die man gerade vergleichen will.
  const [pulseDone, setPulseDone] = useState(false);
  const highlight =
    !pulseDone && shouldHighlightProfile(profile, RECOMMENDATION_THRESHOLD_PERCENT);

  const downloadCv = async () => {
    if (cvAction.disabled || !projectId || cvDownloadState === "loading") return;
    setCvDownloadState("loading");
    setCvDownloadError(null);
    try {
      const downloadUrl = await requestFreelancerCvDownload(profile.id, projectId);
      navigateToCvDownload(downloadUrl);
      setCvDownloadState("idle");
    } catch (error) {
      setCvDownloadError(
        error instanceof Error
          ? error.message
          : "Der CV konnte nicht heruntergeladen werden. Bitte versuchen Sie es erneut.",
      );
      setCvDownloadState("error");
    }
  };
  return (
    <article
      ref={cardRef}
      className={`profile-card ${profile.recommendationRole === "primary" ? "is-primary" : ""} ${isPartial ? "is-partial" : ""} ${selected ? "is-selected" : ""}${highlight ? " is-highlight" : ""}`}
      // Nur die Animation der Karte selbst beendet den Puls — `animationend`
      // steigt aus dem ganzen Teilbaum auf.
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setPulseDone(true);
      }}
    >
      <div className="profile-rank" aria-label={`${isPartial ? "Teiltreffer" : "Ergebnis"} ${position}`}>{position.toString().padStart(2, "0")}</div>
      <div className="profile-main">
        <header className="profile-header">
          <div className="profile-identity">
            <div className={`profile-avatar ${profile.avatarUrl ? "has-image" : ""}`} style={avatarStyle(profile.avatarUrl)} aria-hidden="true">{profile.avatarUrl ? null : initials(profile.displayName)}</div>
            <div>
              <h3>{profile.displayName}</h3>
              <p>{profile.role}</p>
            </div>
          </div>
          <div className="profile-badges">
            {profile.recommendationRole ? (
              <span className={`match-role ${isPartial ? "is-warning" : ""}`}>
                {profile.recommendationRole === "primary"
                  ? "Hauptvorschlag"
                  : profile.recommendationRole === "partial"
                    ? "Nicht empfohlen"
                    : "Alternative"}
              </span>
            ) : null}
            <span className={`availability ${profile.availabilityStatus}`}>{availabilityLabel(profile.availabilityStatus)}</span>
          </div>
        </header>

        {/* Eingeklappt bleiben Kopf, Schlagworte und Aktionen stehen — genug,
            um die Karte wiederzuerkennen und zu handeln. Alles, was gelesen
            werden will, kommt erst beim Ausklappen. */}
        <div className="profile-tags">
          {profile.skillTags.slice(0, 5).map((skill) => <span key={skill}>{skill}</span>)}
          {profile.skillTags.length > 5 ? <span className="profile-tags-more">+{profile.skillTags.length - 5}</span> : null}
        </div>

        {onToggleCollapsed ? (
          <button
            className="profile-collapse-toggle"
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
          >
            <span aria-hidden="true"><IconChevronDown size={14} /></span>
            {collapsed ? "Profil ausklappen" : "Profil einklappen"}
          </button>
        ) : null}

        {collapsed ? null : (
        <>
        {profile.experienceSummary ? <p className="experience-summary">{profile.experienceSummary}</p> : null}

        <div className="match-columns">
          <div className="match-column reasons">
            <h4><span aria-hidden="true"><IconCheck size={13} /></span> Das ist belegt</h4>
            {profile.matchReasons.length ? (
              <>
                <ul>{profile.matchReasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}</ul>
                {profile.matchReasons.length > 3 ? (
                  <details className="profile-more"><summary>{profile.matchReasons.length - 3} weitere Belege</summary><ul>{profile.matchReasons.slice(3).map((reason) => <li key={reason}>{reason}</li>)}</ul></details>
                ) : null}
              </>
            ) : <p className="unknown-text">Keine Begründung übermittelt</p>}
          </div>
          <div className="match-column gaps">
            <h4>
              <span aria-hidden="true"><IconAlertCircle size={13} /></span>
              {isPartial ? "Das fehlt für eine Empfehlung" : "Das ist noch offen"}
            </h4>
            {profile.knownGaps.length ? (
              <>
                <ul>{profile.knownGaps.slice(0, 3).map((gap) => <li key={gap}>{gap}</li>)}</ul>
                {profile.knownGaps.length > 3 ? (
                  <details className="profile-more"><summary>{profile.knownGaps.length - 3} weitere offene Punkte</summary><ul>{profile.knownGaps.slice(3).map((gap) => <li key={gap}>{gap}</li>)}</ul></details>
                ) : null}
              </>
            ) : (
              <p>{isPartial ? "Die Muss-Kriterien sind nicht vollständig belegt." : "Nichts offen im Abgleich"}</p>
            )}
          </div>
        </div>

        <div className="fact-row">
          {verifiedFacts.length ? (
            <FactGroup label="Von XPORTAL geprüft" facts={verifiedFacts.map((fact) => fact.value)} verified />
          ) : null}
          <FactGroup label="Vom Freelancer angegeben" facts={selfReportedFacts.map((fact) => fact.value)} />
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
        </>
        )}

        {/* Bei einem Teiltreffer bleibt der Hinweis stehen: dass hier auf eigene
            Entscheidung gehandelt wird, muss neben den Knoepfen stehen und
            nicht nur weiter oben in der Begruendung. Der Gegenpart fuer einen
            empfohlenen Treffer ist entfallen — "Bereit fuer den naechsten
            Schritt" ueber einem Knopf, der genau das sagt, war eine Zeile, die
            nur den Knopf wiederholte. */}
        <footer className="profile-footer">
          {isPartial ? (
            <p className="profile-footer-caution">
              <span aria-hidden="true"><IconAlertCircle size={13} /></span>
              Nicht empfohlen — Kontakt auf eigene Entscheidung. Offene Muss-Kriterien bleiben sichtbar.
            </p>
          ) : null}
          <div className="profile-actions">
              <div className="cv-action-group">
                {cvAction.kind === "available" ? (
                  <button
                    className="secondary-action cv-action"
                    type="button"
                    disabled={!projectId || cvDownloadState === "loading"}
                    aria-busy={cvDownloadState === "loading"}
                    aria-describedby={cvDownloadError ? `cv-error-${profile.id}` : undefined}
                    onClick={downloadCv}
                  >
                    <IconDocument size={13} />
                    {cvDownloadState === "loading" ? "Lebenslauf wird vorbereitet …" : cvAction.label}
                  </button>
                ) : (
                  <span className="profile-action-status"><IconDocument size={13} /> {cvAction.label}</span>
                )}
                {cvDownloadError ? (
                  <p className="cv-download-status is-error" id={`cv-error-${profile.id}`} role="alert">
                    {cvDownloadError}
                  </p>
                ) : null}
              </div>
              {/* Marking and contacting used to be the same button, which is
                  why "Profil merken" opened the contact dialog and saved
                  nothing. They are now separate actions. */}
              <button
                className={`secondary-action${saved ? " is-saved" : ""}`}
                type="button"
                onClick={onToggleSave}
                aria-pressed={saved}
                title={saved ? "Aus der Merkliste entfernen" : "Zur Merkliste hinzufügen"}
              >
                {saved ? <><IconCheck size={13} /> Gemerkt</> : "Zur Merkliste"}
              </button>
              <button className="secondary-action" type="button" onClick={selected ? onContact : onSelect}>
                Kontaktwege anzeigen
              </button>
              {bookingAction.kind === "bookable" ? (
                // The redirect route records the click and then forwards to the
                // freelancer's calendar. onClick only files the introduction
                // alongside it and must not prevent the navigation.
                <a
                  className="primary-action"
                  href={appPath(`/api/freelancers/${profile.id}/book`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onRequestBooking}
                  aria-label={`Meeting mit ${profile.displayName} buchen`}
                >
                  {bookingAction.label} <IconArrowRight size={13} />
                </a>
              ) : (
                <button
                  className="primary-action"
                  type="button"
                  disabled={bookingAction.disabled}
                  onClick={onRequestBooking}
                  aria-label={
                    bookingAction.kind === "login_required"
                      ? `Anmelden und Meeting mit ${profile.displayName} buchen`
                      : undefined
                  }
                >
                  {bookingAction.label}
                  {bookingAction.disabled ? null : <IconArrowRight size={13} />}
                </button>
              )}
          </div>
        </footer>
      </div>
    </article>
  );
}


function FactGroup({ label, facts, verified = false }: { label: string; facts: string[]; verified?: boolean }) {
  const [open, setOpen] = useState(false);
  const { preview, full, truncated } = factPreview(facts);

  return (
    <div className="fact-group">
      <span className={verified ? "verified-label" : "reported-label"}>{verified ? <IconCheck size={12} /> : <IconInfo size={12} />} {label}</span>
      <p>
        {full ? (open || !truncated ? full : preview) : "Keine Angaben"}
        {truncated ? (
          <button className="fact-more" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? "weniger anzeigen" : "mehr anzeigen"}
          </button>
        ) : null}
      </p>
    </div>
  );
}

/**
 * The requirements as a state, not as a second copy of the brief: what has to
 * be met, what only orders the results, what is optional and what is still
 * missing. The priorities come straight from the matcher, so the panel shows
 * the same distinction the ranking actually uses.
 */
/**
 * Die Projektdaten als Formular.
 *
 * Gespeichert wird beim Verlassen eines Feldes — die Eingabe geht also nicht
 * verloren, wenn jemand zurueck in den Chat klickt. Gesucht wird dagegen erst
 * auf ausdrueckliche Anweisung: Enter, Strg+S oder der Knopf unten. Eine Suche
 * kostet Guthaben, sie darf nicht als Nebenwirkung eines Klicks entstehen.
 */
function BriefEditor({
  brief,
  busy,
  onUpdate,
}: {
  brief: StructuredBrief;
  busy: boolean;
  onUpdate: (message: string) => void;
}) {
  const base = useMemo(() => briefToDraft(brief), [brief]);
  const [draft, setDraft] = useState<BriefDraft>(base);
  const [seededFrom, setSeededFrom] = useState<BriefDraft>(base);

  // Kommt ein neuer Steckbrief aus einer Suche, gilt er. Die eigenen Eingaben
  // sind zu diesem Zeitpunkt bereits in die Suche eingeflossen. Der Abgleich
  // steht im Rendern und nicht in einem Effekt, sonst zeigt die Leiste fuer
  // einen Durchgang noch den alten Stand.
  if (seededFrom !== base) {
    setSeededFrom(base);
    setDraft(base);
  }

  const changes = draftChanges(base, draft);
  const dirty = changes.length > 0;

  const apply = () => {
    if (!dirty || busy) return;
    onUpdate(composeBriefUpdateMessage(changes));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const isSaveChord = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s";
    // Enter in einem mehrzeiligen Feld gehoert dem Zeilenumbruch.
    const isPlainEnter =
      event.key === "Enter" && !event.shiftKey && event.target instanceof HTMLInputElement;
    if (!isSaveChord && !isPlainEnter) return;
    event.preventDefault();
    apply();
  };

  return (
    <div className="brief-editor" onKeyDown={onKeyDown}>
      <div className="brief-editor-fields">
        {BRIEF_FIELDS.map(({ field, label, hint, multiline, placeholder }) => {
          const id = `brief-field-${field}`;
          const changed = changes.some((change) => change.field === field);
          return (
            <div className={`brief-field${changed ? " is-changed" : ""}`} key={field}>
              <label htmlFor={id}>
                {label}
                {changed ? <span className="brief-field-flag">geändert</span> : null}
              </label>
              {field === "mode" ? (
                <select
                  id={id}
                  value={draft.mode}
                  onChange={(event) => setDraft({ ...draft, mode: event.target.value })}
                >
                  {MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              ) : multiline ? (
                <textarea
                  id={id}
                  rows={2}
                  value={draft[field]}
                  placeholder={placeholder}
                  onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                />
              ) : (
                <input
                  id={id}
                  type="text"
                  value={draft[field]}
                  placeholder={placeholder}
                  onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                />
              )}
              {hint ? <small>{hint}</small> : null}
            </div>
          );
        })}
      </div>

      <div className={`brief-editor-actions${dirty ? " is-dirty" : ""}`}>
        {dirty ? (
          <>
            <p role="status">
              {changes.length === 1 ? "1 Feld geändert" : `${changes.length} Felder geändert`} ·
              noch nicht gesucht
            </p>
            <button className="primary-action" type="button" onClick={apply} disabled={busy}>
              {busy ? "Suche läuft …" : "Übernehmen und neu suchen"}
            </button>
            <small>Auch mit Enter im Feld oder Strg + S</small>
          </>
        ) : (
          <p className="brief-editor-rest">
            Änderungen an diesen Feldern starten eine neue Suche.
          </p>
        )}
      </div>
    </div>
  );
}

export function ProjectDetails({
  brief,
  selectedProfile,
  busy,
  analysis,
  profileCount,
  partialProfileCount,
  onContact,
  onUpdateBrief,
}: {
  brief: StructuredBrief | null;
  selectedProfile: FreelancerProfileResult | null;
  /** Waehrend eine Antwort laeuft, darf keine zweite Suche daneben starten. */
  busy: boolean;
  analysis: AiAnalysisTrace | null;
  profileCount: number;
  partialProfileCount: number;
  onContact: () => void;
  onUpdateBrief: (message: string) => void;
}) {
  const openFields = brief ? presentUnknownFields(brief.unknownFields) : [];

  return (
    <div className="details-inner">
      <div className="details-heading">
        <p className="eyebrow">Projekt</p>
        <h2>Übersicht</h2>
      </div>
      {brief ? (
        <>
          <BriefEditor brief={brief} busy={busy} onUpdate={onUpdateBrief} />

          {openFields.length ? (
            <div className="details-open-fields">
              <p className="details-section-label">Noch offen</p>
              <p>{openFields.join(" · ")}</p>
              <small>Tragen Sie diese Punkte oben ein oder ergänzen Sie sie im Chat.</small>
            </div>
          ) : null}
        </>
      ) : (
        <div className="details-empty">
          <span aria-hidden="true"><IconDocument size={22} /></span>
          <strong>Noch keine Projektdaten</strong>
          <p>Schreiben Sie frei in den Chat. Die Übersicht entsteht aus Ihren Angaben und lässt sich hier danach Feld für Feld nachschärfen.</p>
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

      {analysis ? (
        <AnalysisTrace
          trace={analysis}
          profileCount={profileCount}
          partialProfileCount={partialProfileCount}
        />
      ) : null}

      <div className="ai-note"><span aria-hidden="true"><IconInfo size={11} /></span><p><strong>Transparente Unterstützung</strong>Die KI strukturiert Ihre Anfrage. Profile werden nach festen, überprüfbaren Regeln gefiltert.</p></div>
    </div>
  );
}

/**
 * The saved-profile list renders the same card the chat result list uses, so a saved
 * profile looks exactly as it did when the user marked it. The match block of
 * the card stays empty because a saved profile carries no evaluation: it was
 * never scored against a brief.
 */
export function SavedProfileList({
  team,
  isAccountUser,
  onToggleSave,
  onContact,
  onRequestBooking,
}: {
  team: readonly SavedFreelancer[];
  isAccountUser: boolean;
  onToggleSave: (profile: FreelancerProfileResult) => void;
  onContact: (profile: FreelancerProfileResult) => void;
  onRequestBooking: (profile: FreelancerProfileResult) => void;
}) {
  return (
    <div className="profile-list">
      {team.map((entry, index) => (
        <ProfileCard
          key={entry.profile.id}
          profile={entry.profile}
          position={index + 1}
          isAccountUser={isAccountUser}
          projectId={null}
          selected={false}
          onSelect={() => onContact(entry.profile)}
          onContact={() => onContact(entry.profile)}
          onRequestBooking={() => onRequestBooking(entry.profile)}
          saved
          onToggleSave={() => onToggleSave(entry.profile)}
        />
      ))}
    </div>
  );
}
