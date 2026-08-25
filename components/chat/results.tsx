"use client";

/**
 * Everything that renders a matching result: the shortlist section, the
 * structured brief, profile cards and the project detail panel.
 *
 * Moved out of ChatWorkspace unchanged. This is the surface a customer
 * actually reads a recommendation from, and it had no boundary of its own.
 */

import { useEffect, useRef, useState } from "react";

import { appPath } from "@/lib/app-path";
import { MINIMUM_CORE_COVERAGE_BASIS_POINTS } from "@/lib/domain/matching";

import type {
  AiAnalysisTrace,
  AvailabilityStatus,
  CvAccess,
  ExternalFreelancerSearchResponse,
  FreelancerProfileResult,
  MatchingStatus,
  ProductCreditSnapshot,
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
  IconDocument,
  IconInfo,
  IconSearch,
  IconSpark,
} from "../icons";

export type ExternalSearchCtaState = {
  kind: "login" | "loading" | "insufficient" | "ready";
  label: string;
  disabled: boolean;
};

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
import {
  formatCredits,
  initials,
  isRecord,
  nullableString,
} from "./shared";

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
  if (status === "available") return "Projektverfügbarkeit bestätigt";
  if (status === "limited") return "Projektverfügbarkeit begrenzt";
  if (status === "unavailable") return "Nicht verfügbar";
  return "Projektverfügbarkeit nicht bestätigt";
}

function presentUnknownFields(fields: string[]) {
  return fields.map((field) => unknownFieldLabels[field] ?? field);
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
  productCredits,
  onRequireLogin,
  selectedProfileId,
  onSelect,
  onContact,
  onRequestBooking,
  savedFreelancerIds,
  onToggleSave,
  onOpenDetails,
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
  productCredits: ProductCreditSnapshot | null;
  onRequireLogin: () => void;
  selectedProfileId: string | null;
  onSelect: (profile: FreelancerProfileResult) => void;
  onContact: (profile: FreelancerProfileResult) => void;
  onRequestBooking: (profile: FreelancerProfileResult) => void;
  savedFreelancerIds: readonly string[];
  onToggleSave: (profile: FreelancerProfileResult) => void;
  onOpenDetails?: () => void;
}) {
  const searchCta = externalSearchCtaState(isAccountUser, productCredits);
  const resultHeading =
    matchingStatus === "needs_clarification"
      ? "Anforderung noch nicht ausreichend konkret"
      : matchingStatus === "no_reliable_match"
        ? partialProfiles.length
          ? `${partialProfiles.length} ${partialProfiles.length === 1 ? "nicht empfohlener Teiltreffer" : "nicht empfohlene Teiltreffer"}`
          : "Kein zuverlässiger interner Match"
        : profiles.length
          ? `${profiles.length} ${profiles.length === 1 ? "verlässlicher interner Match" : "verlässliche interne Matches"}`
          : "Kein gespeicherter interner Match";
  return (
    <section className="result-section" aria-label="Suchergebnis">
      {brief ? <BriefCard brief={brief} onOpenDetails={onOpenDetails} /> : null}
      {analysis ? (
        <AnalysisTrace
          trace={analysis}
          profileCount={profiles.length}
          partialProfileCount={partialProfiles.length}
        />
      ) : null}
      <div className="shortlist-heading">
        <div>
          <p className="eyebrow">Regelbasierter Abgleich</p>
          <h2>{resultHeading}</h2>
        </div>
        {profiles.length ? (
          <span className="result-count">Maximal 3 Ergebnisse</span>
        ) : partialProfiles.length ? (
          <span className="result-count is-warning">Keine Empfehlung</span>
        ) : null}
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
                isAccountUser={isAccountUser}
                projectId={projectId}
                selected={selectedProfileId === profile.id}
                onSelect={() => onSelect(profile)}
                onContact={() => onContact(profile)}
                onRequestBooking={() => onRequestBooking(profile)}
                saved={savedFreelancerIds.includes(profile.id)}
                onToggleSave={() => onToggleSave(profile)}
              />
            ))}
          </div>
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
          <div className="no-match-card">
            <div className="no-match-icon" aria-hidden="true"><IconSearch size={19} /></div>
            <div>
              <strong>
                {matchingStatus === "needs_clarification"
                  ? "Nennen Sie bitte mindestens die gewünschte Rolle oder eine benötigte Kernkompetenz."
                  : partialProfiles.length
                    ? "Keiner der internen Teiltreffer erreicht die Empfehlungsschwelle."
                  : analysisMode === "fallback"
                    ? "Die sichere Basisanalyse hat keinen zuverlässigen internen Match gefunden."
                    : "Kein aktives, reales und direkt buchbares Profil erreicht derzeit die Empfehlungsschwelle."}
              </strong>
              <p>
                {matchingStatus === "needs_clarification"
                  ? "Ohne prüfbare Kompetenzanforderung wird kein Profil geraten und keine kostenpflichtige Websuche angeboten."
                  : matchingStatus === "no_reliable_match"
                    ? partialProfiles.length
                      ? "Prüfen Sie zuerst die offengelegten Lücken oder präzisieren Sie ein Kriterium im Chat. Reicht das interne Ergebnis nicht aus, steht darunter als letzte Option die getrennte Internetsuche bereit."
                      : "Wir empfehlen nur Profile, die alle Muss-Kriterien und mindestens 70 % der Kernkompetenzgruppen erfüllen. Sie können ein Kriterium im Chat präzisieren oder lockern."
                    : "Für dieses historische Ergebnis ist keine Qualitätsklassifikation gespeichert."}
              </p>
              {matchingStatus === "no_reliable_match" &&
              (analysis?.externalSearchAvailable ?? true) &&
              externalSearch?.mode !== "openai" ? (
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
  partialProfileCount = 0,
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
        : partialProfileCount > 0
          ? `${Math.min(partialProfileCount, 2)} nicht empfohlene Teiltreffer werden mit ihren belegten Überschneidungen und ausschlaggebenden Lücken angezeigt.`
        : "Es wurde kein ausreichend relevantes internes Profil gefunden; es wird kein Kandidat erfunden.",
      status: "completed",
    },
  ];
}

function AnalysisTrace({
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
            <article className="external-profile-card" key={candidate.profileUrl}>
              <div className="external-profile-topline"><span>Extern</span><span>Angaben vor Kontakt prüfen</span></div>
              <h3>{candidate.displayName}</h3>
              <p className="external-role">{candidate.role}</p>
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
                <a href={candidate.profileUrl} target="_blank" rel="noopener noreferrer">Öffentliches Profil prüfen</a>
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
                  <a className="external-booking-link" href={candidate.bookingUrl} target="_blank" rel="noopener noreferrer">Buchungslink öffnen <IconArrowUpRight size={12} /></a>
                ) : null}
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
        <p className="external-empty">Auch in der Websuche wurde kein Profil gefunden, dessen öffentliche Quellen sich belegen ließen.</p>
      )}
      <details className="external-trace">
        <summary>Suchschritte ansehen</summary>
        <p>{result.searchTrace.consultedSourceCount} öffentlich zugängliche Quellen wurden berücksichtigt; {result.searchTrace.returnedCandidateCount} Ergebnis(se) erfüllten die Ausgaberegeln.</p>
        {result.searchTrace.queries.length ? <ul>{result.searchTrace.queries.map((query) => <li key={query}>{query}</li>)}</ul> : null}
      </details>
    </section>
  );
}

/** Basis points are the matcher's unit; the reader wants a percentage. */
const RECOMMENDATION_THRESHOLD_PERCENT = MINIMUM_CORE_COVERAGE_BASIS_POINTS / 100;

function groupedRequirements(
  brief: StructuredBrief,
  priority: StructuredRequirementGroup["priority"],
): string | null {
  const groups = brief.requirementGroups.filter(
    (group) => group.priority === priority,
  );
  if (!groups.length) return null;
  return groups
    .map((group) =>
      group.values.join(group.operator === "any_of" ? " oder " : " und "),
    )
    .join(" · ");
}

function requirementCount(
  brief: StructuredBrief,
  priority: StructuredRequirementGroup["priority"],
): number {
  return brief.requirementGroups.filter((group) => group.priority === priority)
    .length;
}

/**
 * The chat carries the narrative, the detail panel carries the state. This card
 * used to repeat all ten fields the panel already showed, so the same brief was
 * rendered twice on one screen. It now says what was understood and hands off.
 */
export function BriefCard({
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
    <article className="brief-card">
      <div className="brief-header">
        <div>
          <p className="eyebrow">Strukturierte Projektanalyse</p>
          <h2>{brief.projectTitle}</h2>
        </div>
        <span className="brief-status"><span aria-hidden="true"><IconCheck size={12} /></span> Strukturiert</span>
      </div>
      {brief.summary ? <p className="brief-summary">{brief.summary}</p> : null}
      {counts.length ? <p className="brief-counts">{counts.join(" · ")}</p> : null}
      {onOpenDetails ? (
        <button className="brief-open-details" type="button" onClick={onOpenDetails}>
          Anforderungen ansehen <IconArrowRight size={13} />
        </button>
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
    return { kind: "login_required", label: "Download CV", disabled: true };
  }

  const access = profile.cvAccess ?? "forbidden";
  if (access === "available") {
    return { kind: access, label: "Download CV", disabled: false };
  }
  if (access === "missing") {
    return {
      kind: access,
      label: "Freelancer hat noch kein CV hochgeladen",
      disabled: true,
    };
  }
  return { kind: access, label: "Download CV", disabled: true };
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
      label: "Nicht mehr buchbar",
      hint: "Dieses Profil ist aktuell nicht direkt buchbar.",
      disabled: true,
    };
  }
  if (!isAccountUser) {
    return {
      kind: "login_required",
      label: "Anmelden & Meeting buchen",
      hint: "Nach der Anmeldung geht es direkt mit diesem Profil weiter.",
      disabled: false,
    };
  }
  return {
    kind: "bookable",
    label: "Meeting buchen",
    hint: "Der Booking-Link des Freelancers öffnet sich in einem neuen Tab.",
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
}) {
  const verifiedFacts = profile.facts.filter((fact) => fact.verification === "verified");
  const selfReportedFacts = profile.facts.filter((fact) => fact.verification === "self-reported");
  const isPartial = profile.recommendationRole === "partial";
  const cvAction = cvActionState(profile, isAccountUser);
  const bookingAction = bookingActionState(profile, isAccountUser);
  const [cvDownloadState, setCvDownloadState] = useState<"idle" | "loading" | "error">("idle");
  const [cvDownloadError, setCvDownloadError] = useState<string | null>(null);
  const cardRef = useProfileImpression(profile, projectId);

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
    <article ref={cardRef} className={`profile-card ${isPartial ? "is-partial" : ""} ${selected ? "is-selected" : ""}`}>
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
            {profile.fitScore !== null ? (
              <span className="match-score">{isPartial ? "Kriterienpassung" : "Passung"} {profile.fitScore} %</span>
            ) : null}
            <span className={`availability ${profile.availabilityStatus}`}>{availabilityLabel(profile.availabilityStatus)}</span>
          </div>
        </header>

        {profile.experienceSummary ? <p className="experience-summary">{profile.experienceSummary}</p> : null}

        {isPartial ? (
          <div className="partial-reason">
            <p className="partial-reason-headline">
              <span aria-hidden="true"><IconAlertCircle size={13} /></span>
              Was für eine Empfehlung fehlt
            </p>
            {profile.coreCoverage !== null ? (
              <p className="partial-reason-coverage">
                Kernabdeckung {profile.coreCoverage} % · empfohlen ab{" "}
                {RECOMMENDATION_THRESHOLD_PERCENT} %
              </p>
            ) : null}
            {profile.knownGaps.length ? (
              <ul>{profile.knownGaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
            ) : (
              <p className="unknown-text">
                Die Muss-Kriterien der Anfrage sind nicht vollständig belegt.
              </p>
            )}
          </div>
        ) : profile.coreCoverage !== null ? (
          <p className="matching-score-note">
            Kernabdeckung: {profile.coreCoverage} % · regelbasierter Kriterienwert, keine Erfolgswahrscheinlichkeit
          </p>
        ) : null}

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
          {isPartial ? null : (
            <div className="match-column gaps">
              <h4><span aria-hidden="true"><IconAlertCircle size={13} /></span> Bekannte Lücken</h4>
              {profile.knownGaps.length ? (
                <ul>{profile.knownGaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
              ) : <p>Keine bekannten Lücken im Abgleich</p>}
            </div>
          )}
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
            <strong>{isPartial ? "Nicht empfohlen – Kontakt dennoch möglich" : profile.bookingUrl ? "Direktes Erstgespräch" : "Historisches Match"}</strong>
            <span>{isPartial ? "Die offenen Muss-Kriterien bleiben offen. Sie entscheiden, ob Sie trotzdem Kontakt aufnehmen." : bookingAction.hint}</span>
          </div>
          <div className="profile-actions">
              <div className="cv-action-group">
                <button
                  className="secondary-action cv-action"
                  type="button"
                  disabled={cvAction.disabled || !projectId || cvDownloadState === "loading"}
                  aria-busy={cvDownloadState === "loading"}
                  aria-describedby={cvDownloadError ? `cv-error-${profile.id}` : undefined}
                  title={cvAction.kind === "login_required" ? "Bitte anmelden, um CVs herunterzuladen." : undefined}
                  onClick={downloadCv}
                >
                  <IconDocument size={13} />
                  {cvDownloadState === "loading" ? "CV wird vorbereitet …" : cvAction.label}
                </button>
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
                title={saved ? "Aus „Mein Team“ entfernen" : "Zu „Mein Team“ hinzufügen"}
              >
                {saved ? <><IconCheck size={13} /> Im Team</> : "Profil merken"}
              </button>
              <button className="secondary-action" type="button" onClick={selected ? onContact : onSelect}>
                Kontaktoptionen
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

/**
 * The requirements as a state, not as a second copy of the brief: what has to
 * be met, what only orders the results, what is optional and what is still
 * missing. The priorities come straight from the matcher, so the panel shows
 * the same distinction the ranking actually uses.
 */
export function ProjectDetails({
  brief,
  selectedProfile,
  onContact,
}: {
  brief: StructuredBrief | null;
  selectedProfile: FreelancerProfileResult | null;
  onContact: () => void;
}) {
  const openFields = brief ? presentUnknownFields(brief.unknownFields) : [];
  const frame = brief
    ? [
        {
          label: "Modus / Ort",
          value:
            [brief.mode === "unknown" ? null : modeLabel(brief.mode), brief.location]
              .filter(Boolean)
              .join(" · ") || null,
        },
        {
          label: "Start & Dauer",
          value: [brief.startWindow, brief.duration].filter(Boolean).join(" · ") || null,
        },
        { label: "Budget / Satz", value: brief.budgetOrRate },
        { label: "Verfügbarkeit", value: brief.availabilityRequirement },
        {
          label: "Sprache",
          value: brief.languages.length ? brief.languages.join(", ") : null,
          hint: languageHint(brief),
        },
        {
          label: "Vertrag",
          value: brief.contractualRequirements.length
            ? brief.contractualRequirements.join(", ")
            : null,
        },
      ]
    : [];

  return (
    <div className="details-inner">
      <div className="details-heading">
        <p className="eyebrow">Projekt</p>
        <h2>Übersicht</h2>
      </div>
      {brief ? (
        <>
          <div className="project-status-line"><span aria-hidden="true"><IconCheck size={11} /></span><div><strong>{brief.projectTitle || "Anfrage strukturiert"}</strong><small>Angaben können jederzeit ergänzt werden</small></div></div>

          <p className="details-section-label">Anforderungen</p>
          <dl className="side-details">
            <DetailTerm
              label="Muss"
              value={groupedRequirements(brief, "hard")}
              hint="blockiert ohne Beleg"
            />
            <DetailTerm
              label="Kern"
              value={groupedRequirements(brief, "core")}
              hint="bestimmt die Reihenfolge"
            />
            <DetailTerm label="Optional" value={groupedRequirements(brief, "optional")} />
          </dl>

          <p className="details-section-label">Rahmen</p>
          <dl className="side-details">
            {frame.map((entry) => (
              <DetailTerm
                key={entry.label}
                label={entry.label}
                value={entry.value}
                hint={entry.hint}
              />
            ))}
          </dl>

          {openFields.length ? (
            <div className="details-open-fields">
              <p className="details-section-label">Noch offen</p>
              <p>{openFields.join(" · ")}</p>
              <small>Ergänzen Sie diese Punkte im Chat, um die Auswahl zu schärfen.</small>
            </div>
          ) : null}
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

/**
 * "Mein Team" renders the same card the chat result list uses, so a saved
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
