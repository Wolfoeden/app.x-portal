"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";

import { TagInput } from "@/components/TagInput";
import { actionClass } from "@/components/ui/actions";
import { MatchCard, type MatchCardRow } from "@/components/ui/MatchCard";
import { applicationPreviewProfile } from "@/lib/freelancer/application-preview";
import { mergeDraft, type DraftTarget, type ProfileDraft } from "@/lib/freelancer/import/draft";
import { signOut } from "@/lib/auth/browser";
import { appPath } from "@/lib/app-path";
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_STATUSES,
  CURRENCIES,
  MAX_INDUSTRIES,
  MAX_LANGUAGES,
  MAX_QUALIFICATIONS,
  MAX_SKILLS,
  WORK_MODE_LABELS,
  WORK_MODES,
} from "@/lib/freelancer/limits";
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
} from "@/lib/freelancer/avatar-limits";
import type {
  EditableFreelancerProfile,
  FreelancerMetrics,
} from "@/lib/freelancer/portal";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { ProjectListEditor } from "@/components/profile/ProjectListEditor";
import { profileStrength } from "@/lib/freelancer/profile-strength";
import { freelancerActions, FREELANCER_COMMAND_DONE, type FreelancerProfileCommand } from "@/lib/freelancer/presence";
import type { ProfileProject } from "@/lib/profile/project-limits";
import { personalReferralCode } from "@/lib/freelancer/referrals";
import { SITE_URL } from "@/lib/seo";

import styles from "./apply.module.css";
import { ImportPanel } from "./ImportPanel";
import { PROJECT_EDITOR_CLASSES } from "./project-editor-classes";
import work from "./profile-workspace.module.css";

const tagClasses = {
  field: styles.field,
  tagBox: styles.tagBox,
  tag: styles.tag,
  hint: styles.hint,
  optional: styles.optional,
};

type Notice = { message: string; tone: "success" | "error" } | null;

function apiError(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return fallback;
}


const applicationCopy = {
  submitted: {
    title: "Ihre Bewerbung ist eingegangen.",
    text: "XPORTAL prüft Ihre Angaben und Ihren Lebenslauf. Sie müssen aktuell nichts weiter tun.",
  },
  in_review: {
    title: "Ihre Bewerbung wird geprüft.",
    text: "Das Team sichtet Ihr Profil. Bei Rückfragen melden wir uns über Ihre Konto-E-Mail.",
  },
  approved: {
    title: "Ihre Bewerbung ist freigegeben.",
    text: "Das veröffentlichte Profil wird vorbereitet. Laden Sie die Seite in Kürze erneut, um Ihr Dashboard zu öffnen.",
  },
  rejected: {
    title: "Wir konnten Ihr Profil noch nicht freigeben.",
    text: "Ergänzen Sie Ihre Angaben unten und senden Sie das Profil erneut. Bei Fragen erreichen Sie uns über das Kontaktformular.",
  },
} as const;

export function FreelancerApplicationStatus({
  status,
  updatedAt,
}: {
  status: keyof typeof applicationCopy;
  updatedAt: string;
}) {
  const copy = applicationCopy[status];
  return (
    <section className={styles.portalCard}>
      <p className={styles.eyebrow}>Bewerbungsstatus</p>
      <h2>{copy.title}</h2>
      <p>{copy.text}</p>
      <p className={styles.metaLine}>
        Zuletzt aktualisiert: {new Intl.DateTimeFormat("de-DE", {
          dateStyle: "long",
          timeStyle: "short",
        }).format(new Date(updatedAt))}
      </p>
    </section>
  );
}

function numberValue(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function MetricCard({
  label,
  total,
  recent,
}: {
  label: string;
  total: number;
  recent: number;
}) {
  return (
    <div className={work.metric}>
      <span>{label}</span>
      <strong>{total.toLocaleString("de-DE")}</strong>
      <p>{recent.toLocaleString("de-DE")} in den letzten 30 Tagen</p>
    </div>
  );
}

export function FreelancerDashboard({
  initialProfile,
  metrics,
  preview = false,
  initialProjects = [],
  projectsAvailable = false,
  seeking = "projects",
  availabilityUpdatedAt: initialAvailabilityUpdatedAt = null,
  githubLogin = null,
  linkedinConnected = false,
}: {
  initialProfile: EditableFreelancerProfile;
  metrics: FreelancerMetrics;
  preview?: boolean;
  initialProjects?: ProfileProject[];
  projectsAvailable?: boolean;
  seeking?: "projects" | "employment" | "both";
  availabilityUpdatedAt?: string | null;
  /** Für die GitHub- und LinkedIn-Auswertung (ImportPanel), wie im Bewerbungsformular. */
  githubLogin?: string | null;
  linkedinConnected?: boolean;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [availabilityUpdatedAt, setAvailabilityUpdatedAt] = useState(initialAvailabilityUpdatedAt);
  const [commandBusy, setCommandBusy] = useState<FreelancerProfileCommand | null>(null);
  const [projects, setProjects] = useState(initialProjects);
  const [projectNotice, setProjectNotice] = useState<Notice>(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const [strengthAt] = useState(() => new Date());
  const [previewAt] = useState(() => new Date());
  const [testQuery, setTestQuery] = useState(() => initialProfile.skills.slice(0, 2).join(" "));
  const [referralCopied, setReferralCopied] = useState(false);
  const referralUrl = `${SITE_URL}/bewerber-portal/apply?quelle=${personalReferralCode(initialProfile.id)}`;
  const discoveryProfile = useMemo(() => {
    const queryTerms = testQuery.split(/[^\p{L}\p{N}+#.]+/u).filter(Boolean);
    const base = applicationPreviewProfile({
      fullName: profile.displayName,
      roleTitle: profile.roleTitle,
      skills: profile.skills,
      locationText: profile.locationText ?? "",
      workModes: profile.workModes,
      monthlySalary: profile.monthlySalary?.toString() ?? "",
      hourlyRate: profile.hourlyRate?.toString() ?? "",
      dayRate: profile.dayRate?.toString() ?? "",
      currency: profile.currency,
      availabilityStatus: profile.availabilityStatus,
      availabilityFrom: profile.availabilityFrom ?? "",
      bookingUrl: profile.bookingUrl ?? "",
      seeking,
      experienceSummary: profile.experienceSummary,
      avatarUrl: profile.avatarUrl,
      // Wie ein Kunde es sieht: Projekte in Prüfung zählen noch nicht.
      projects: projects.filter((project) => project.approved !== false),
      queryTerms,
    }, previewAt);
    const normalized = queryTerms.map((term) => term.toLocaleLowerCase("de-DE"));
    return {
      ...base,
      id: profile.id,
      verified: profile.verificationStatus === "operator_verified",
      evidence: base.evidence
        .map((entry) => ({
          ...entry,
          required: normalized.some((term) => entry.skill.toLocaleLowerCase("de-DE").includes(term)),
        }))
        .sort((left, right) => Number(right.required) - Number(left.required)),
    };
  }, [previewAt, profile, projects, seeking, testQuery]);
  // Live aus dem, was gerade im Formular steht: Wer ein Foto oder Projekt
  // ergänzt, sieht die Zahl sofort steigen.
  const strength = profileStrength({
    hasPhoto: Boolean(profile.avatarUrl),
    summaryLength: profile.experienceSummary.trim().length,
    projects: projects.filter((project) => project.isPublic).map((project) => ({ hasOutcome: Boolean(project.outcome) })),
    hasRate: Boolean(profile.dayRate ?? profile.hourlyRate),
    seeking,
    availabilityUpdatedAt,
    skillsCount: profile.skills.length,
    industriesCount: profile.industries.length,
    now: strengthAt,
  });

  async function saveProjects() {
    setProjectNotice(null);
    if (preview) {
      setProjectNotice({ message: "Projekte gespeichert.", tone: "success" });
      return;
    }
    setProjectBusy(true);
    try {
      const response = await fetch(appPath("/api/freelancer/projects"), {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projects }),
      });
      const payload = (await response.json().catch(() => null)) as { projects?: ProfileProject[]; error?: string } | null;
      if (!response.ok || !payload?.projects) {
        setProjectNotice({ message: apiError(payload, "Die Projekte konnten nicht gespeichert werden."), tone: "error" });
        return;
      }
      setProjects(payload.projects);
      setProjectNotice({
        message: payload.projects.some((project) => project.approved === false)
          ? "Projekte gespeichert. Neue oder geänderte Projekte sieht ein Kunde, sobald XPORTAL sie freigegeben hat."
          : "Projekte gespeichert. Kunden sehen sie auf Karte und Profil.",
        tone: "success",
      });
    } catch {
      setProjectNotice({ message: "Keine Verbindung zum Server. Bitte erneut versuchen.", tone: "error" });
    } finally {
      setProjectBusy(false);
    }
  }
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<"save" | "avatar" | "delete" | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleted, setDeleted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof EditableFreelancerProfile>(
    key: K,
    value: EditableFreelancerProfile[K],
  ) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  /**
   * Übernimmt eine GitHub-Auswertung ins Formular, wie im Bewerbungsformular:
   * Was schon dasteht, bleibt. Gespeichert wird erst mit „Änderungen
   * speichern“ und „Projekte speichern“.
   */
  function applyImport(draft: ProfileDraft): number {
    const current: DraftTarget = {
      roleTitle: profile.roleTitle,
      experienceSummary: profile.experienceSummary,
      locationText: profile.locationText ?? "",
      skills: profile.skills,
      languages: profile.languages,
      qualifications: profile.qualifications,
      industries: profile.industries,
      projects,
    };
    const { next, taken } = mergeDraft(current, projectsAvailable || preview ? draft : { ...draft, projects: [] });
    setProfile((existing) => ({
      ...existing,
      roleTitle: next.roleTitle,
      experienceSummary: next.experienceSummary,
      locationText: next.locationText || null,
      skills: next.skills,
      languages: next.languages,
      qualifications: next.qualifications,
      industries: next.industries,
    }));
    setProjects(next.projects);
    return taken.length;
  }

  /** Veröffentlichen, pausieren, pushen: sofort, ohne das Formular zu speichern. */
  async function runCommand(command: FreelancerProfileCommand) {
    setNotice(null);
    if (preview) {
      if (command !== "push") update("profileStatus", command === "publish" ? "active" : "paused");
      setNotice({ message: FREELANCER_COMMAND_DONE[command], tone: "success" });
      return;
    }
    setCommandBusy(command);
    try {
      const response = await fetch(appPath("/api/freelancer/profile/status"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { profileStatus?: "active" | "paused"; version?: number; availabilityUpdatedAt?: string | null; message?: string; error?: string }
        | null;
      if (!response.ok || !payload?.profileStatus || typeof payload.version !== "number") {
        throw new Error(apiError(payload, "Das Profil konnte gerade nicht geändert werden."));
      }
      // Neue Version übernehmen, damit „Änderungen speichern“ danach nicht
      // an einem Konflikt scheitert.
      setProfile((current) => ({ ...current, profileStatus: payload.profileStatus!, version: payload.version! }));
      if (payload.availabilityUpdatedAt) setAvailabilityUpdatedAt(payload.availabilityUpdatedAt);
      setNotice({ message: payload.message ?? FREELANCER_COMMAND_DONE[command], tone: "success" });
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : "Das Profil konnte gerade nicht geändert werden.", tone: "error" });
    } finally {
      setCommandBusy(null);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    if (preview) {
      setNotice({
        message: "Profil gespeichert.",
        tone: "success",
      });
      return;
    }
    setBusy("save");
    try {
      const response = await fetch(appPath("/api/freelancer/profile"), {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: profile.displayName,
          roleTitle: profile.roleTitle,
          experienceSummary: profile.experienceSummary,
          skills: profile.skills,
          languages: profile.languages,
          qualifications: profile.qualifications,
          industries: profile.industries,
          locationText: profile.locationText,
          workModes: profile.workModes,
          monthlySalary: profile.monthlySalary,
          hourlyRate: profile.hourlyRate,
          dayRate: profile.dayRate,
          currency: profile.currency,
          availabilityStatus: profile.availabilityStatus,
          availabilityFrom: profile.availabilityFrom,
          bookingUrl: profile.bookingUrl,
          profileStatus: profile.profileStatus,
          version: profile.version,
          // Nur, wenn das Profil die Felder kennt (Migration 20261007090000).
          ...("capacityDaysPerWeek" in profile ? { capacityDaysPerWeek: profile.capacityDaysPerWeek ?? null } : {}),
          ...("desiredProjects" in profile ? { desiredProjects: profile.desiredProjects ?? "" } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { profile?: EditableFreelancerProfile; error?: string }
        | null;
      if (!response.ok || !payload?.profile) {
        throw new Error(apiError(payload, "Das Profil konnte nicht gespeichert werden."));
      }
      setProfile(payload.profile);
      setNotice({ message: "Profil gespeichert.", tone: "success" });
    } catch (error) {
      setNotice({
        message: error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
        tone: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  async function uploadAvatar(file: File) {
    setNotice(null);
    if (
      file.size > AVATAR_MAX_BYTES ||
      !(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)
    ) {
      setNotice({
        message: "Erlaubt sind JPEG, PNG oder WebP bis 5 MB.",
        tone: "error",
      });
      return;
    }
    if (preview) {
      update("avatarUrl", URL.createObjectURL(file));
      setNotice({ message: "Lokale Bildvorschau geladen.", tone: "success" });
      return;
    }
    setBusy("avatar");
    try {
      const ticketResponse = await fetch(appPath("/api/freelancer/avatar-upload"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profileId: profile.id,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      const ticket = (await ticketResponse.json().catch(() => null)) as
        | {
            bucket?: string;
            path?: string;
            uploadToken?: string;
            pathToken?: string;
            error?: string;
          }
        | null;
      if (
        !ticketResponse.ok ||
        !ticket?.bucket ||
        !ticket.path ||
        !ticket.uploadToken ||
        !ticket.pathToken
      ) {
        throw new Error(apiError(ticket, "Der Upload konnte nicht gestartet werden."));
      }
      const { error: uploadError } = await getBrowserSupabaseClient().storage
        .from(ticket.bucket)
        .uploadToSignedUrl(ticket.path, ticket.uploadToken, file, {
          contentType: file.type,
        });
      if (uploadError) throw uploadError;

      const attachResponse = await fetch(appPath("/api/freelancer/avatar"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profileId: profile.id,
          path: ticket.path,
          token: ticket.pathToken,
        }),
      });
      const attached = (await attachResponse.json().catch(() => null)) as
        | { avatarUrl?: string; error?: string }
        | null;
      if (!attachResponse.ok || !attached?.avatarUrl) {
        throw new Error(apiError(attached, "Das Bild konnte nicht gespeichert werden."));
      }
      update("avatarUrl", attached.avatarUrl);
      setNotice({
        message: "Profilbild gespeichert. Die Profilversion wird neu geladen.",
        tone: "success",
      });
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      setNotice({
        message: error instanceof Error ? error.message : "Bild-Upload fehlgeschlagen.",
        tone: "error",
      });
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeAvatar() {
    if (preview) {
      update("avatarUrl", null);
      setNotice({ message: "Bild aus der lokalen Vorschau entfernt.", tone: "success" });
      return;
    }
    setBusy("avatar");
    setNotice(null);
    try {
      const response = await fetch(appPath("/api/freelancer/avatar"), {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(apiError(payload, "Das Bild konnte nicht entfernt werden."));
      }
      update("avatarUrl", null);
      window.setTimeout(() => window.location.reload(), 300);
    } catch (error) {
      setNotice({
        message: error instanceof Error ? error.message : "Entfernen fehlgeschlagen.",
        tone: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  async function deleteProfile() {
    if (deleteConfirmation !== "PROFIL LÖSCHEN") return;
    if (preview) {
      setDeleted(true);
      return;
    }
    setBusy("delete");
    setNotice(null);
    try {
      const response = await fetch(appPath("/api/freelancer/profile"), {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(apiError(payload, "Das Profil konnte nicht gelöscht werden."));
      }
      setDeleted(true);
    } catch (error) {
      setNotice({
        message: error instanceof Error ? error.message : "Löschen fehlgeschlagen.",
        tone: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  if (deleted) {
    return (
      <section className={styles.success}>
        <p className={styles.eyebrow}>Profil gelöscht</p>
        <h2>Ihr Freelancer-Profil ist nicht mehr sichtbar.</h2>
        <p>
          Profildaten, zugehörige Dateien und die verknüpften Analytics wurden
          entfernt.
        </p>
      </section>
    );
  }

  const visible = profile.profileStatus === "active";
  const openSteps = strength.steps.filter((step) => !step.done).slice(0, 3);
  // Die Testansicht als Karte wie im Talent Index: je Suchbegriff eine Zeile,
  // erfüllt mit Kompetenz aus dem Profil oder offen fürs Gespräch.
  const knownTerms = [...profile.skills, ...profile.industries, profile.roleTitle].map((entry) => entry.toLocaleLowerCase("de-DE"));
  const testTerms = [...new Set(testQuery.split(/[^\p{L}\p{N}+#.]+/u).filter((term) => term.length > 1))].slice(0, 6);
  const openTerms = testTerms.filter((term) => !knownTerms.some((known) => known.includes(term.toLocaleLowerCase("de-DE"))));
  const matchedEvidence = discoveryProfile.evidence.filter((entry) => entry.required).slice(0, 5);
  const testRows: MatchCardRow[] = [
    ...(matchedEvidence.length ? matchedEvidence : discoveryProfile.evidence.slice(0, 4)).map((entry) => ({ label: entry.skill, detail: entry.verified ? "belegt" : "angegeben" })),
    ...openTerms.map((term) => ({ label: term, detail: "im Gespräch klären", open: true })),
  ];
  const metTerms = testTerms.length - openTerms.length;
  const availabilityText = `${AVAILABILITY_LABELS[profile.availabilityStatus]}${profile.availabilityFrom ? ` ab ${new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(profile.availabilityFrom))}` : ""}`;
  const initialsText = profile.displayName.slice(0, 2).toUpperCase();

  return (
    <div className={work.workspace}>
      <nav className={work.nav} aria-label="Profilbereich">
        <a href="#uebersicht" aria-current="location">Übersicht</a>
        <a href="#profil-bearbeiten">Profil bearbeiten</a>
        <a href="#projekte">Projekte</a>
        <a href="#einsatz">Verfügbarkeit &amp; Honorar</a>
        <a href="#verbinden">GitHub &amp; LinkedIn</a>
        <a href="#anfragen">Anfragen</a>
        <p>Konto</p>
        <a href="#profil-loeschen">Profil löschen</a>
        {!preview ? (
          <button type="button" onClick={() => void signOut().then(() => window.location.reload())}>Abmelden</button>
        ) : null}
      </nav>

      <div className={work.main}>
        <header id="uebersicht" className={work.bar}>
          <h1>Ihr Profil</h1>
          <span className={visible ? work.status : `${work.status} ${work.isPaused}`}>
            <span aria-hidden="true" />
            {visible ? "Öffentlich sichtbar" : "Profil pausiert"}
          </span>
          {/* Je nach Stand: ansehen, bearbeiten, pushen — oder veröffentlichen. */}
          <div className={work.barActions}>
            {freelancerActions({ kind: "profile", profileId: profile.id, visible }).map((action) =>
              "href" in action ? (
                <a
                  key={action.key}
                  className={actionClass("secondary", { compact: true })}
                  href={action.key === "edit" ? "#profil-bearbeiten" : appPath(action.href)}
                  target={action.external ? "_blank" : undefined}
                  rel={action.external ? "noopener noreferrer" : undefined}
                  title={action.hint}
                >
                  {action.label}
                </a>
              ) : (
                <button
                  key={action.key}
                  type="button"
                  className={actionClass(action.key === "publish" || action.key === "push" ? "primary" : "secondary", { compact: true })}
                  title={action.hint}
                  disabled={commandBusy !== null}
                  onClick={() => void runCommand(action.command)}
                >
                  {commandBusy === action.command ? "Bitte warten …" : action.label}
                </button>
              ),
            )}
            {visible ? (
              <button type="button" className={work.textButton} disabled={commandBusy !== null} onClick={() => void runCommand("pause")}>
                Pausieren
              </button>
            ) : null}
          </div>
        </header>

        {notice ? (
          <p className={notice.tone === "error" ? styles.formError : styles.callout} role="status">
            {notice.message}
          </p>
        ) : null}

        <section className={work.metrics} aria-label="Profilstatistik">
          <div className={work.metric}>
            <span>Profilstärke</span>
            <strong>{strength.done} von {strength.total} · {strength.level}</strong>
            <meter min={0} max={strength.total} value={strength.done} aria-label="Profilstärke" />
            <p>
              {strength.next ? (
                <><b>Nächster Schritt:</b> {strength.next.label}.</>
              ) : (
                "Ihr Profil ist vollständig. Halten Sie Verfügbarkeit und Projekte aktuell."
              )}
            </p>
          </div>
          <MetricCard label="Profilaufrufe" total={metrics.profileViewsTotal} recent={metrics.profileViews30Days} />
          <MetricCard label="Klicks auf Buchungslink" total={metrics.bookingClicksTotal} recent={metrics.bookingClicks30Days} />
          <div className={work.metric}>
            <span>Verfügbarkeit</span>
            <strong className={work.available}>{AVAILABILITY_LABELS[profile.availabilityStatus]}</strong>
            <p>
              {availabilityUpdatedAt
                ? `bestätigt am ${new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(availabilityUpdatedAt))}. Pushen hält sie aktuell.`
                : "Noch nicht bestätigt. Pushen hält sie aktuell."}
            </p>
          </div>
        </section>

        <section className={work.test} aria-labelledby="discovery-preview-title">
          <div>
            <h2 id="discovery-preview-title">Testansicht: So wird Ihr Profil für eine Anfrage eingeordnet.</h2>
            <p>
              Beispielanfrage: <strong>{testQuery.trim() || "noch keine"}</strong> · keine echte Kundenanfrage
            </p>
          </div>
          <div className={work.cards}>
            <div className={work.cardSlot}>
              <p className={work.cardLabel}>So sieht das Unternehmen Sie</p>
              <MatchCard
                avatar={{ src: profile.avatarUrl, initials: initialsText }}
                name={profile.displayName}
                role={[profile.roleTitle, profile.workModes.map((mode) => WORK_MODE_LABELS[mode]).join(", ")].filter(Boolean).join(" · ")}
                score={testTerms.length ? { text: `${metTerms} von ${testTerms.length}`, partial: metTerms < testTerms.length } : null}
                rows={testRows}
                facts={[
                  { label: "Honorar", value: discoveryProfile.rate ?? "nicht angegeben" },
                  { label: "Verfügbar", value: availabilityText },
                ]}
              />
            </div>
            <div className={work.cardSlot}>
              <p className={work.cardLabel}>Passendstes Referenzprojekt</p>
              <article className={work.card}>
                {discoveryProfile.highlight ? (
                  <>
                    <strong>{discoveryProfile.highlight.title}</strong>
                    {discoveryProfile.highlight.meta ? <span className={work.muted}>{discoveryProfile.highlight.meta}</span> : null}
                    {discoveryProfile.highlight.technologies.length ? (
                      <span className={work.chips}>
                        {discoveryProfile.highlight.technologies.slice(0, 5).map((technology) => <span key={technology}>{technology}</span>)}
                      </span>
                    ) : null}
                    <p>Zu jeder Anfrage zeigt XPORTAL das Projekt mit den meisten Überschneidungen.</p>
                  </>
                ) : (
                  <p>Noch kein öffentliches Referenzprojekt. Ein Projekt mit Titel, Branche und Technologien zeigt, was Sie gemacht haben.</p>
                )}
                <a className={actionClass("secondary", { compact: true })} href="#projekte">Projekt hinzufügen</a>
              </article>
            </div>
            <div className={work.cardSlot}>
              <p className={work.cardLabel}>So passen Sie besser</p>
              <article className={work.card}>
                {openSteps.length ? (
                  <ul className={work.steps}>
                    {openSteps.map((step) => (
                      <li key={step.key}><strong>{step.label}</strong><span>{step.hint}</span></li>
                    ))}
                  </ul>
                ) : (
                  <p>Ihr Profil ist vollständig. Halten Sie Verfügbarkeit und Projekte aktuell.</p>
                )}
                <button
                  type="button"
                  className={actionClass("primary", { compact: true })}
                  disabled={commandBusy !== null}
                  onClick={() => void runCommand(visible ? "push" : "publish")}
                >
                  {visible ? "Profil pushen" : "Profil veröffentlichen"}
                </button>
              </article>
            </div>
          </div>
          <div className={work.testBar}>
            {profile.skills.length ? (
              <div className={work.testChips}>
                <span>Andere Anfrage testen:</span>
                {profile.skills.slice(0, 3).map((skill) => (
                  <button key={skill} type="button" onClick={() => setTestQuery(skill)}>{skill}</button>
                ))}
              </div>
            ) : null}
            <label className={work.testInput}>
              <span className="sr-only">Beispielanfrage</span>
              <input value={testQuery} onChange={(event) => setTestQuery(event.target.value)} placeholder="Rolle, Branche oder Technologie eingeben, z. B. React für Versicherungsportal" />
            </label>
          </div>
        </section>

      <section id="verbinden" className={styles.section} aria-labelledby="connect-title">
        <p className={styles.eyebrow}>Profile verbinden</p>
        <h2 id="connect-title">GitHub und LinkedIn auswerten</h2>
        <p className={styles.sectionHint}>
          GitHub übernimmt öffentliche Projekte und Technologien in Ihr Profil, LinkedIn verbinden Sie hier ebenfalls. Was schon dasteht, bleibt. Danach unten speichern.
        </p>
        <ImportPanel githubLogin={githubLogin} linkedinConnected={linkedinConnected} onDraft={applyImport} />
      </section>

      <form id="profil-bearbeiten" className={styles.form} onSubmit={save}>
        <section className={styles.section}>
          <p className={styles.eyebrow}>Stammdaten</p>
          <h2>Öffentliches Profil</h2>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Name</span>
              <input value={profile.displayName} onChange={(event) => update("displayName", event.target.value)} minLength={2} maxLength={120} required />
            </label>
            <label className={styles.field}>
              <span>Rolle</span>
              <input value={profile.roleTitle} onChange={(event) => update("roleTitle", event.target.value)} minLength={2} maxLength={160} required />
            </label>
            <label className={styles.field}>
              <span>Standort <span className={styles.optional}>· optional</span></span>
              <input value={profile.locationText ?? ""} onChange={(event) => update("locationText", event.target.value || null)} maxLength={160} />
            </label>
            <label className={styles.field}>
              <span>Buchungslink</span>
              <input type="url" value={profile.bookingUrl} onChange={(event) => update("bookingUrl", event.target.value)} pattern="https://.*" placeholder="optional, z. B. https://calendly.com/ihr-name/30min" />
            </label>
            <label className={`${styles.field} ${styles.full}`}>
              <span>Über mich</span>
              <textarea value={profile.experienceSummary} onChange={(event) => update("experienceSummary", event.target.value)} minLength={40} maxLength={2000} required />
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <p className={styles.eyebrow}>Expertise</p>
          <h2>Skills und Erfahrung</h2>
          <div className={styles.grid}>
            <TagInput label="Skills" placeholder="z. B. SAP FI" values={profile.skills} max={MAX_SKILLS} required onChange={(value) => update("skills", value)} classes={tagClasses} />
            <TagInput label="Sprachen" placeholder="z. B. Deutsch C2" values={profile.languages} max={MAX_LANGUAGES} required onChange={(value) => update("languages", value)} classes={tagClasses} />
            <TagInput label="Qualifikationen" placeholder="z. B. PMP" values={profile.qualifications} max={MAX_QUALIFICATIONS} onChange={(value) => update("qualifications", value)} classes={tagClasses} />
            <TagInput label="Branchen" placeholder="z. B. Automotive" values={profile.industries} max={MAX_INDUSTRIES} onChange={(value) => update("industries", value)} classes={tagClasses} />
          </div>
        </section>

        <section id="einsatz" className={styles.section}>
          <p className={styles.eyebrow}>Einsatz</p>
          <h2>Verfügbarkeit und Konditionen</h2>
          <div className={styles.grid}>
            <div className={`${styles.field} ${styles.full}`}>
              <span>Arbeitsmodell</span>
              <div className={styles.checks}>
                {WORK_MODES.map((mode) => (
                  <label className={styles.check} key={mode}>
                    <input
                      type="checkbox"
                      checked={profile.workModes.includes(mode)}
                      onChange={() =>
                        update(
                          "workModes",
                          profile.workModes.includes(mode)
                            ? profile.workModes.filter((entry) => entry !== mode)
                            : [...profile.workModes, mode],
                        )
                      }
                    />
                    {WORK_MODE_LABELS[mode]}
                  </label>
                ))}
              </div>
            </div>
            <label className={styles.field}>
              <span>Monatsgehalt <span className={styles.optional}>· optional</span></span>
              <input type="number" min="1" step="0.01" value={profile.monthlySalary ?? ""} onChange={(event) => update("monthlySalary", numberValue(event.target.value))} />
            </label>
            <label className={styles.field}>
              <span>Stundensatz <span className={styles.optional}>· optional</span></span>
              <input type="number" min="1" step="0.01" value={profile.hourlyRate ?? ""} onChange={(event) => update("hourlyRate", numberValue(event.target.value))} />
            </label>
            <label className={styles.field}>
              <span>Tagessatz <span className={styles.optional}>· optional</span></span>
              <input type="number" min="1" step="0.01" value={profile.dayRate ?? ""} onChange={(event) => update("dayRate", numberValue(event.target.value))} />
            </label>
            <label className={styles.field}>
              <span>Währung</span>
              <select value={profile.currency} onChange={(event) => update("currency", event.target.value as EditableFreelancerProfile["currency"])}>
                {CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>Verfügbarkeit</span>
              <select value={profile.availabilityStatus} onChange={(event) => update("availabilityStatus", event.target.value as EditableFreelancerProfile["availabilityStatus"])}>
                {AVAILABILITY_STATUSES.map((status) => <option key={status} value={status}>{AVAILABILITY_LABELS[status]}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>Verfügbar ab <span className={styles.optional}>· optional</span></span>
              <input type="date" value={profile.availabilityFrom ?? ""} onChange={(event) => update("availabilityFrom", event.target.value || null)} />
            </label>
            {"capacityDaysPerWeek" in profile ? (
              <label className={styles.field}>
                <span>Kapazität <span className={styles.optional}>· optional</span></span>
                <select value={profile.capacityDaysPerWeek ?? ""} onChange={(event) => update("capacityDaysPerWeek", event.target.value ? Number(event.target.value) : null)}>
                  <option value="">Keine Angabe</option>
                  {[1, 2, 3, 4, 5].map((days) => <option key={days} value={days}>{days} {days === 1 ? "Tag" : "Tage"} pro Woche</option>)}
                </select>
              </label>
            ) : null}
            {"desiredProjects" in profile ? (
              <label className={`${styles.field} ${styles.full}`}>
                <span>Gewünschte Projekte <span className={styles.optional}>· optional</span></span>
                <textarea value={profile.desiredProjects ?? ""} maxLength={500} onChange={(event) => update("desiredProjects", event.target.value || null)} placeholder="z. B. KI-Agenten im Kundenservice, remote, ab sechs Monaten Laufzeit" style={{ minHeight: 72 }} />
              </label>
            ) : null}
          </div>
        </section>

        {notice ? (
          <p className={notice.tone === "error" ? styles.formError : styles.callout} role="status">
            {notice.message}
          </p>
        ) : null}
        <div className={styles.actions}>
          <button className={styles.submit} type="submit" disabled={busy !== null}>
            {busy === "save" ? "Wird gespeichert …" : "Änderungen speichern"}
          </button>
          <span className={styles.actionsHint}>
            Status der Prüfung: {profile.verificationStatus}
          </span>
        </div>
      </form>

      <section id="projekte" className={styles.section} aria-labelledby="projects-title">
        <p className={styles.eyebrow}>Referenzprojekte</p>
        <h2 id="projects-title">Woran Sie gearbeitet haben</h2>
        <p className={styles.sectionHint}>
          Bis zu acht Projekte. Ein von XPORTAL geprüftes oder sonst das erste steht auf Ihrer Karte; alle
          zusammen im Profil.
        </p>
        {projectsAvailable || preview ? (
          <>
            <ProjectListEditor projects={projects} onChange={setProjects} mode="owner" classes={PROJECT_EDITOR_CLASSES} />
            {projectNotice ? (
              <p className={projectNotice.tone === "error" ? styles.formError : styles.callout} role={projectNotice.tone === "error" ? "alert" : "status"}>
                {projectNotice.message}
              </p>
            ) : null}
            <div className={styles.actions} style={{ marginTop: 14 }}>
              <button className={styles.submit} type="button" disabled={projectBusy} onClick={() => void saveProjects()}>
                {projectBusy ? "Wird gespeichert …" : "Projekte speichern"}
              </button>
            </div>
          </>
        ) : (
          <p className={styles.callout}>Projekte lassen sich in Kürze hier eintragen.</p>
        )}
      </section>

      <section id="profil-loeschen" className={`${styles.section} ${styles.dangerZone}`}>
        <p className={styles.eyebrow}>Gefahrenbereich</p>
        <h2>Profil dauerhaft löschen</h2>
        <p className={styles.sectionHint}>
          Das öffentliche Profil, Profilbild, Lebenslauf und zugehörige Analytics werden dauerhaft entfernt. Gib zur Bestätigung <strong>PROFIL LÖSCHEN</strong> ein.
        </p>
        <div className={styles.deleteRow}>
          <input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} aria-label="Löschung bestätigen" />
          <button className={styles.deleteButton} type="button" disabled={busy !== null || deleteConfirmation !== "PROFIL LÖSCHEN"} onClick={() => void deleteProfile()}>
            {busy === "delete" ? "Wird gelöscht …" : "Profil dauerhaft löschen"}
          </button>
        </div>
      </section>
      </div>

      <aside className={work.aside} aria-labelledby="public-profile-title">
        <div className={work.asideHead}>
          <h2 id="public-profile-title">Öffentliches Profil</h2>
          <a href="#profil-bearbeiten">Bearbeiten</a>
        </div>
        <div className={work.person}>
          <div
            className={work.avatar}
            style={profile.avatarUrl ? { backgroundImage: `url(${JSON.stringify(profile.avatarUrl)})` } : undefined}
            aria-label={profile.avatarUrl ? "Aktuelles Profilbild" : "Noch kein Profilbild"}
            role="img"
          >
            {profile.avatarUrl ? null : initialsText}
          </div>
          <div>
            <strong>{profile.displayName}</strong>
            <span>{profile.roleTitle}</span>
            <span>{[profile.locationText, profile.workModes.map((mode) => WORK_MODE_LABELS[mode]).join(", ")].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
        <input
          ref={fileInputRef}
          className={styles.hiddenFile}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadAvatar(file);
          }}
        />
        <div className={work.avatarActions}>
          <button className={work.textButton} type="button" disabled={busy === "avatar"} onClick={() => fileInputRef.current?.click()}>
            {busy === "avatar" ? "Bitte warten …" : "Profilbild ändern"}
          </button>
          {profile.avatarUrl ? (
            <button className={work.textButton} type="button" onClick={() => void removeAvatar()}>Entfernen</button>
          ) : null}
        </div>
        {profile.skills.length ? (
          <div className={work.skillGroups}>
            <p>Kernkompetenzen</p>
            <span className={work.chipsStrong}>{profile.skills.slice(0, 4).map((skill) => <span key={skill}>{skill}</span>)}</span>
            {profile.skills.length > 4 ? (
              <>
                <p>Weitere</p>
                <span className={work.chips}>{profile.skills.slice(4, 12).map((skill) => <span key={skill}>{skill}</span>)}</span>
              </>
            ) : null}
          </div>
        ) : null}
        <dl className={work.facts}>
          <dt>Honorar</dt><dd>{discoveryProfile.rate ?? "nicht angegeben"}</dd>
          <dt>Verfügbar</dt><dd>{availabilityText}</dd>
          {profile.languages.length ? <><dt>Sprachen</dt><dd>{profile.languages.join(", ")}</dd></> : null}
          <dt>Prüfung</dt>
          <dd className={profile.verificationStatus === "unverified" ? undefined : work.verified}>
            {profile.verificationStatus === "operator_verified"
              ? "Von XPORTAL geprüft"
              : profile.verificationStatus === "references_checked"
                ? "Referenzen geprüft"
                : profile.verificationStatus === "identity_checked"
                  ? "Identität geprüft"
                  : "Noch nicht geprüft"}
          </dd>
        </dl>
        <div id="anfragen" className={work.inquiries}>
          <strong>Anfragen</strong>
          <p>Noch keine Anfrage hier. Passt eine, meldet sich XPORTAL per E-Mail und stellt Sie vor.</p>
        </div>
        <div id="einladen" className={work.inquiries}>
          <strong>Kolleginnen und Kollegen einladen</strong>
          <p>Mehr KI-Profile ziehen mehr Projektanfragen an, auch für Sie. Teilen Sie Ihren Link:</p>
          <code className={styles.referralLink}>{referralUrl}</code>
          <button
            type="button"
            className={work.textButton}
            onClick={() => {
              void navigator.clipboard?.writeText(referralUrl).then(() => setReferralCopied(true), () => setReferralCopied(false));
            }}
          >
            {referralCopied ? "Kopiert" : "Link kopieren"}
          </button>
        </div>
      </aside>
    </div>
  );
}
