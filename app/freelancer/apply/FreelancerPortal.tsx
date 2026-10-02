"use client";

import { useRef, useState, type FormEvent } from "react";

import { TagInput } from "@/components/TagInput";
import { AuthDialog } from "@/components/chat/dialogs";
import { ShowcaseCard } from "@/components/chat/showcase-card";
import type { AuthDialogMode } from "@/components/chat/shared";
import { exampleApplicationPreview } from "@/lib/freelancer/application-preview";
import { signOut } from "@/lib/auth/browser";
import { appPath } from "@/lib/app-path";
import { placementRequestsEnabled } from "@/lib/placement/config";
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
import { ProjectListEditor, type ProjectEditorClasses } from "@/components/profile/ProjectListEditor";
import { profileStrength } from "@/lib/freelancer/profile-strength";
import type { ProfileProject } from "@/lib/profile/project-limits";

import styles from "./apply.module.css";

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

/**
 * Was vor der Registrierung feststehen sollte (Audit P2, Freelancer-Aufnahme):
 * Kosten, Unterlagen, Prüfumfang und Ablauf. Die Angaben folgen dem
 * Formular: Lebenslauf und Kalenderlink sind optional (ApplyForm.tsx,
 * lib/freelancer/application.ts), geprüft wird jede Angabe einzeln
 * (docs/operator-runbook.md).
 */
export function onboardingFacts(placement: boolean): ReadonlyArray<{ term: string; text: string }> {
  return [
    {
      term: "Kosten",
      text: placement
        ? "Keine. Registrierung, Profil und Vermittlung sind für Sie kostenlos; das Vermittlungshonorar zahlt der Auftraggeber."
        : "Keine. Registrierung und Profil sind für Sie kostenlos.",
    },
    {
      term: "Unterlagen",
      text: "Rolle, Kompetenzen, Sprachen, Verfügbarkeit und Honorar. Ein Lebenslauf als PDF (bis 10 MB) hilft bei der Prüfung, ein Kalenderlink ist optional.",
    },
    {
      term: "Prüfung",
      text: "XPORTAL sichtet Ihre Angaben und gleicht einzelne mit Nachweisen ab, etwa Lebenslauf oder öffentlichem Berufsprofil. Nur diese erscheinen als „Von XPORTAL geprüft“; alles andere bleibt Ihre Angabe.",
    },
    {
      term: "Ablauf",
      text: "Konto anlegen und E-Mail bestätigen, Profil in vier Abschnitten ausfüllen, Prüfung durch XPORTAL mit Rückfragen per E-Mail. Nach der Freigabe ist Ihr Profil im Matching auffindbar.",
    },
  ];
}

/**
 * Die drei Wege, auf denen Menschen zu XPORTAL kommen. Wer über die Agentur
 * für Arbeit oder das Jobcenter kommt, ist oft (noch) nicht selbstständig und
 * soll sich trotzdem angesprochen fühlen. Bewusst ohne
 * „Arbeitnehmerüberlassung“: Die bietet XPORTAL nicht an (AGB § 10).
 */
export const APPLICANT_PATHS: ReadonlyArray<{ title: string; text: string }> = [
  { title: "Projekte als Freelancer", text: "Sie arbeiten selbstständig oder möchten es werden." },
  { title: "Eine feste Stelle", text: "Sie suchen eine Anstellung und zeigen, was Sie können." },
  {
    title: "Auf dem Weg in die Selbstständigkeit",
    text: "Sie müssen noch nicht selbstständig sein, um ein Profil anzulegen.",
  },
];

/**
 * Fragen, die vor allem Menschen ohne Freelance-Erfahrung stellen. Keine
 * Zusage zu Förderung oder Leistungen: nur der Hinweis, wen man fragt.
 */
export const APPLICANT_FAQ: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: "Muss ich schon selbstständig sein?",
    answer:
      "Nein. Sie können ein Profil anlegen, bevor Sie eine selbstständige Tätigkeit anmelden. Wie Sie arbeiten, klären Sie vor dem ersten Auftrag.",
  },
  {
    question: "Ich suche eine feste Stelle. Bin ich hier richtig?",
    answer:
      "Ja. Wählen Sie im Formular „Eine feste Stelle“. Ihr Profil erscheint dann nicht in der öffentlichen Freelancer-Suche; es sieht nur das XPORTAL-Team.",
  },
  {
    question: "Ich beziehe Arbeitslosengeld oder Bürgergeld.",
    answer:
      "Teilen Sie einen Auftrag oder eine neue Stelle wie gewohnt Ihrer Agentur für Arbeit oder Ihrem Jobcenter mit. Wenn Sie sich selbstständig machen möchten, fragen Sie dort nach Förderung, etwa dem Gründungszuschuss (bei Arbeitslosengeld) oder dem Einstiegsgeld (bei Bürgergeld).",
  },
  {
    question: "Ich habe Lücken im Lebenslauf.",
    answer:
      "Kein Problem. Wir schauen auf das, was Sie können. Ein Lebenslauf hilft bei der Sichtung, ist aber freiwillig.",
  },
];

export function FreelancerAuthGate() {
  const [dialogMode, setDialogMode] = useState<AuthDialogMode | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [shownAt] = useState(() => new Date());

  return (
    <>
      <section className={styles.gate}>
        <div className={styles.gateMain}>
          <p className={styles.eyebrow}>Kostenlos für Sie</p>
          <h2>Ein Profil, drei Wege.</h2>
          <ul className={styles.paths}>
            {APPLICANT_PATHS.map((path) => (
              <li key={path.title}>
                <strong>{path.title}</strong>
                <span>{path.text}</span>
              </li>
            ))}
          </ul>
          <dl className={styles.onboardingFacts}>
            {onboardingFacts(placementRequestsEnabled()).map((fact) => (
              <div key={fact.term}><dt>{fact.term}</dt><dd>{fact.text}</dd></div>
            ))}
          </dl>
          {notice ? (
            <p className={notice.tone === "error" ? styles.formError : styles.callout}>
              {notice.message}
            </p>
          ) : null}
          <div className={styles.gateActions}>
            <button className={styles.submit} type="button" onClick={() => setDialogMode("register")}>
              Kostenlos Profil anlegen
            </button>
            <button className={styles.gateLogin} type="button" onClick={() => setDialogMode("login")}>
              Schon registriert? Anmelden
            </button>
          </div>
          <p className={styles.hint}>Ein Konto schützt Ihre Angaben, bis XPORTAL das Profil freigibt.</p>
        </div>
        <aside className={styles.gateExample} aria-labelledby="apply-example-title">
          <p className={styles.eyebrow}>Beispiel</p>
          <h3 id="apply-example-title">So sehen Unternehmen Ihr Profil</h3>
          <ShowcaseCard profile={exampleApplicationPreview(shownAt)} now={shownAt} href={null} />
          <p className={styles.hint}>
            Ein ausgedachtes Profil. Ihres zeigt nur, was Sie angeben und XPORTAL freigibt.
          </p>
        </aside>
      </section>
      <section className={styles.faq} aria-labelledby="apply-faq-title">
        <h2 id="apply-faq-title">Häufige Fragen</h2>
        {APPLICANT_FAQ.map((entry) => (
          <details key={entry.question}>
            <summary>{entry.question}</summary>
            <p>{entry.answer}</p>
          </details>
        ))}
      </section>
      {dialogMode ? (
        <AuthDialog
          initialMode={dialogMode}
          // Nach der Bestätigung per E-Mail zurück zum Formular, nicht in den Chat.
          destination="/freelancer/apply"
          onClose={() => setDialogMode(null)}
          onAuthenticated={() => window.location.reload()}
          showToast={(message, tone) =>
            setNotice({
              message,
              tone: tone === "error" ? "error" : "success",
            })
          }
        />
      ) : null}
    </>
  );
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
    <article className={styles.metricCard}>
      <span>{label}</span>
      <strong>{total.toLocaleString("de-DE")}</strong>
      <small>{recent.toLocaleString("de-DE")} in den letzten 30 Tagen</small>
    </article>
  );
}

const PROJECT_EDITOR_CLASSES: ProjectEditorClasses = {
  field: styles.field,
  input: "",
  textarea: "",
  select: "",
  button: styles.uploadButton,
  buttonPrimary: styles.uploadButton,
  buttonDanger: styles.textButton,
  textLink: styles.textButton,
  note: styles.hint,
};

export function FreelancerDashboard({
  initialProfile,
  metrics,
  preview = false,
  initialProjects = [],
  projectsAvailable = false,
  seeking = "projects",
  availabilityUpdatedAt = null,
}: {
  initialProfile: EditableFreelancerProfile;
  metrics: FreelancerMetrics;
  preview?: boolean;
  initialProjects?: ProfileProject[];
  projectsAvailable?: boolean;
  seeking?: "projects" | "employment" | "both";
  availabilityUpdatedAt?: string | null;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [projects, setProjects] = useState(initialProjects);
  const [projectNotice, setProjectNotice] = useState<Notice>(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const [strengthAt] = useState(() => new Date());
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
      setProjectNotice({ message: "Projekte gespeichert. Kunden sehen sie auf Karte und Profil.", tone: "success" });
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
          hourlyRate: profile.hourlyRate,
          dayRate: profile.dayRate,
          currency: profile.currency,
          availabilityStatus: profile.availabilityStatus,
          availabilityFrom: profile.availabilityFrom,
          bookingUrl: profile.bookingUrl,
          profileStatus: profile.profileStatus,
          version: profile.version,
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

  return (
    <div className={styles.dashboard}>
      <section className={styles.dashboardHead}>
        <div className={styles.profileOverview}>
          <div
            className={styles.avatarPreview}
            style={
              profile.avatarUrl
                ? {
                    backgroundImage: `url(${JSON.stringify(profile.avatarUrl)})`,
                  }
                : undefined
            }
            aria-label={
              profile.avatarUrl
                ? "Aktuelles Profilbild"
                : "Noch kein Profilbild"
            }
          >
            {profile.avatarUrl
              ? null
              : profile.displayName.slice(0, 2).toUpperCase()}
          </div>
          <div className={styles.profileHeading}>
            <p className={styles.eyebrow}>Freelancer-Dashboard</p>
            <h2>{profile.displayName}</h2>
            <p>
              {profile.roleTitle}
              {profile.locationText ? ` · ${profile.locationText}` : ""}
            </p>
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
            <div className={styles.avatarActions}>
              <button
                className={styles.textButton}
                type="button"
                disabled={busy === "avatar"}
                onClick={() => fileInputRef.current?.click()}
              >
                {busy === "avatar" ? "Bitte warten …" : "Profilbild ändern"}
              </button>
              {profile.avatarUrl ? (
                <button
                  className={styles.textButton}
                  type="button"
                  onClick={() => void removeAvatar()}
                >
                  Entfernen
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <div className={styles.dashboardControls}>
          <div
            className={`${styles.statusLine} ${
              profile.profileStatus === "paused" ? styles.isPaused : ""
            }`}
          >
            <span aria-hidden="true" />
            {profile.profileStatus === "active"
              ? "Öffentlich sichtbar"
              : "Profil pausiert"}
          </div>
          <div className={styles.statusSwitch}>
            <button
              type="button"
              className={
                profile.profileStatus === "active" ? styles.isActive : ""
              }
              onClick={() => update("profileStatus", "active")}
            >
              Aktiv
            </button>
            <button
              type="button"
              className={
                profile.profileStatus === "paused" ? styles.isActive : ""
              }
              onClick={() => update("profileStatus", "paused")}
            >
              Pausiert
            </button>
          </div>
          {!preview ? (
            <button
              className={styles.textButton}
              type="button"
              onClick={() =>
                void signOut().then(() => window.location.reload())
              }
            >
              Abmelden
            </button>
          ) : null}
        </div>
      </section>

      <section className={styles.strength} aria-labelledby="profile-strength-title">
        <div>
          <p className={styles.eyebrow}>Profilstärke</p>
          <h2 id="profile-strength-title">
            {strength.done} von {strength.total} · {strength.level}
          </h2>
          <meter min={0} max={strength.total} value={strength.done} aria-label="Profilstärke" />
          <p>
            {strength.next ? (
              <>
                <strong>Nächster Schritt: {strength.next.label}.</strong> {strength.next.hint}
              </>
            ) : (
              "Ihr Profil ist vollständig. Halten Sie Verfügbarkeit und Projekte aktuell."
            )}
          </p>
        </div>
        <a
          className={styles.uploadButton}
          href={appPath(`/profil/${profile.id}?via=share`)}
          target="_blank"
          rel="noopener noreferrer"
        >
          So sehen Kunden Ihr Profil ↗
        </a>
      </section>

      <section className={styles.metrics} aria-label="Profilstatistik">
        <MetricCard
          label="Profilaufrufe"
          total={metrics.profileViewsTotal}
          recent={metrics.profileViews30Days}
        />
        <MetricCard
          label="Klicks auf Buchungslink"
          total={metrics.bookingClicksTotal}
          recent={metrics.bookingClicks30Days}
        />
      </section>

      <form className={styles.form} onSubmit={save}>
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

        <section className={styles.section}>
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

      <section className={styles.section} aria-labelledby="projects-title">
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

      <section className={`${styles.section} ${styles.dangerZone}`}>
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
  );
}
