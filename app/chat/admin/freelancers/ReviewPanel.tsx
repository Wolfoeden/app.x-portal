"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { TagInput } from "@/components/TagInput";
import { appPath } from "@/lib/app-path";
import { projectPeriod, type ProfileProject } from "@/lib/profile/project-limits";
import {
  candidateFacts,
  FACT_CATEGORY_LABELS,
} from "@/lib/freelancer/facts";
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_STATUSES,
  CURRENCIES,
  MAX_FACTS_PER_COLUMN,
  MAX_INDUSTRIES,
  MAX_LANGUAGES,
  MAX_QUALIFICATIONS,
  MAX_SKILLS,
  MAX_SUMMARY_LENGTH,
  WORK_MODE_LABELS,
  WORK_MODES,
  type ApplicationStatus,
  type AvailabilityStatus,
  type WorkMode,
} from "@/lib/freelancer/limits";

import styles from "./freelancers.module.css";

export type ReviewDefaults = {
  displayName: string;
  roleTitle: string;
  experienceSummary: string;
  skills: string[];
  languages: string[];
  qualifications: string[];
  industries: string[];
  locationText: string;
  workModes: WorkMode[];
  monthlySalary: string;
  hourlyRate: string;
  dayRate: string;
  currency: (typeof CURRENCIES)[number];
  availabilityStatus: AvailabilityStatus;
  availabilityFrom: string;
  bookingUrl: string;
  seeking: "projects" | "employment" | "both";
  introPolicy: "free" | "manual_approval";
  verificationStatus:
    | "unverified"
    | "identity_checked"
    | "references_checked"
    | "operator_verified";
  referencesSummary: string;
  cvDownloadable: boolean;
  /** Projekte der Bewerbung, die ins Profil gehen, nach Position. */
  projects: Array<{ index: number; verified: boolean }>;
  usePhoto: boolean;
  verifiedFacts: string[];
  slug: string;
  reviewNotes: string;
};

type Issue = { path: string; message: string };

const VERIFICATION_LABELS: Record<
  ReviewDefaults["verificationStatus"],
  string
> = {
  unverified: "Nicht geprüft",
  identity_checked: "Identität geprüft",
  references_checked: "Referenzen geprüft",
  operator_verified: "Vollständig geprüft",
};

const tagClasses = {
  field: styles.field,
  tagBox: styles.tagBox,
  tag: styles.tag,
  hint: styles.hint,
};

export function ReviewPanel({
  applicationId,
  status,
  hasCv,
  projects = [],
  hasPhoto = false,
  photoUrl = null,
  defaults,
}: {
  applicationId: string;
  status: ApplicationStatus;
  hasCv: boolean;
  /** Referenzprojekte aus der Bewerbung, wie eingereicht. */
  projects?: ProfileProject[];
  hasPhoto?: boolean;
  /** Kurzlebige Adresse des Fotos; `null`, wenn sie nicht erzeugt werden konnte. */
  photoUrl?: string | null;
  defaults: ReviewDefaults;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ReviewDefaults>(defaults);
  const [busy, setBusy] = useState<
    null | "publish" | "reject" | "start_review" | "reopen"
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [published, setPublished] = useState<{
    profileId: string;
    slug: string;
    cvSubmitted: boolean;
    cvTransferred: boolean;
    projectsChosen?: number;
    projectsTransferred?: number;
    photoSubmitted?: boolean;
    photoTransferred?: boolean;
  } | null>(null);

  const facts = useMemo(
    () =>
      candidateFacts({
        skills: form.skills,
        languages: form.languages,
        qualifications: form.qualifications,
        industries: form.industries,
        locationText: form.locationText || null,
        experienceSummary: form.experienceSummary,
      }),
    [form],
  );

  // A fact that was ticked and then edited away must not stay in the payload.
  const verifiedFacts = useMemo(() => {
    const available = new Set(facts.map((entry) => entry.fact));
    return form.verifiedFacts.filter((entry) => available.has(entry));
  }, [facts, form.verifiedFacts]);

  function update<K extends keyof ReviewDefaults>(
    key: K,
    value: ReviewDefaults[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleFact(entry: string) {
    setForm((current) => ({
      ...current,
      verifiedFacts: current.verifiedFacts.includes(entry)
        ? current.verifiedFacts.filter((value) => value !== entry)
        : [...current.verifiedFacts, entry],
    }));
  }

  function chooseProject(index: number, next: { chosen: boolean; verified: boolean }) {
    setForm((current) => ({
      ...current,
      projects: next.chosen
        ? [...current.projects.filter((entry) => entry.index !== index), { index, verified: next.verified }].sort(
            (a, b) => a.index - b.index,
          )
        : current.projects.filter((entry) => entry.index !== index),
    }));
  }

  function toggleWorkMode(mode: WorkMode) {
    setForm((current) => ({
      ...current,
      workModes: current.workModes.includes(mode)
        ? current.workModes.filter((entry) => entry !== mode)
        : [...current.workModes, mode],
    }));
  }

  async function send(
    action: "publish" | "reject" | "start_review" | "reopen",
  ) {
    setError(null);
    setIssues([]);
    setBusy(action);

    try {
      const response = await fetch(
        appPath(
          `/api/admin/freelancer-applications/${encodeURIComponent(applicationId)}`,
        ),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(
            action === "publish"
              ? {
                  action,
                  decision: {
                    displayName: form.displayName,
                    roleTitle: form.roleTitle,
                    experienceSummary: form.experienceSummary,
                    skills: form.skills,
                    languages: form.languages,
                    qualifications: form.qualifications,
                    industries: form.industries,
                    locationText: form.locationText,
                    workModes: form.workModes,
                    hourlyRate: form.hourlyRate,
                    dayRate: form.dayRate,
                    currency: form.currency,
                    availabilityStatus: form.availabilityStatus,
                    availabilityFrom: form.availabilityFrom,
                    bookingUrl: form.bookingUrl,
                    seeking: form.seeking,
                    introPolicy: form.introPolicy,
                    verificationStatus: form.verificationStatus,
                    referencesSummary: form.referencesSummary,
                    cvDownloadable: form.cvDownloadable,
                    projects: form.projects,
                    usePhoto: hasPhoto && form.usePhoto,
                    verifiedFacts,
                    slug: form.slug,
                    reviewNotes: form.reviewNotes,
                  },
                }
              : { action, reviewNotes: form.reviewNotes },
          ),
        },
      );

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        issues?: Issue[];
        profileId?: string;
        slug?: string;
        cvSubmitted?: boolean;
        cvTransferred?: boolean;
      };

      if (!response.ok) {
        setError(payload.error ?? "Die Aktion ist fehlgeschlagen.");
        setIssues(payload.issues ?? []);
        return;
      }

      if (action === "publish" && payload.profileId) {
        setPublished({
          profileId: payload.profileId,
          slug: payload.slug ?? form.slug,
          cvSubmitted: payload.cvSubmitted ?? false,
          cvTransferred: payload.cvTransferred ?? false,
        });
      }
      router.refresh();
    } catch {
      setError("Keine Verbindung zum Server. Bitte erneut versuchen.");
    } finally {
      setBusy(null);
    }
  }

  if (published) {
    return (
      <div className={styles.published} role="status">
        <p className={styles.eyebrow}>Freigegeben</p>
        <h2>Profil ist live.</h2>
        <p>
          {form.displayName} wurde als aktives, echtes Profil in{" "}
          <code>freelancer_profiles</code> angelegt und wird ab sofort im
          Matching berücksichtigt.
        </p>
        <p>
          Profil-ID: <code>{published.profileId}</code>
        </p>
        <p>
          Slug: <code>{published.slug}</code>
        </p>
        {published.cvSubmitted ? (
          <p>
            {published.cvTransferred
              ? `Lebenslauf wurde ins Profil übernommen (${
                  form.cvDownloadable
                    ? "für gematchte Kunden freigegeben"
                    : "noch nicht für Kunden freigegeben"
                }).`
              : "Achtung: Der Lebenslauf konnte nicht ins Profil übernommen werden. Er liegt weiterhin bei der Bewerbung — bitte manuell nach dem Runbook anhängen."}
          </p>
        ) : null}
        {published.projectsChosen ? (
          <p>
            {published.projectsTransferred === published.projectsChosen
              ? `${published.projectsChosen} Referenzprojekt${published.projectsChosen === 1 ? "" : "e"} ins Profil übernommen.`
              : "Achtung: Die Projekte konnten nicht ins Profil übernommen werden. Bitte unter Admin → Profile eintragen."}
          </p>
        ) : null}
        {published.photoSubmitted ? (
          <p>
            {published.photoTransferred
              ? "Foto als Profilbild übernommen."
              : form.usePhoto
                ? "Achtung: Das Foto konnte nicht übernommen werden."
                : "Foto nicht verwendet und gelöscht."}
          </p>
        ) : null}
      </div>
    );
  }

  const decided = status === "approved" || status === "rejected";
  const noRate = !form.hourlyRate && !form.dayRate;

  return (
    <div className={styles.card}>
      <p className={styles.eyebrow}>Prüfung</p>
      <h2>Profil freigeben</h2>
      <p className={styles.hint}>
        Diese Felder werden veröffentlicht. Korrigieren Sie Angaben direkt hier —
        die Bewerbung selbst bleibt als Nachweis unverändert.
      </p>

      <div className={styles.grid} style={{ marginTop: 16 }}>
        <div className={`${styles.full} ${styles.formSectionHeading}`}>
          <strong>Öffentliche Identität</strong>
          <span>Name, Rolle und Profiladresse</span>
        </div>
        <label className={styles.field}>
          <span>Anzeigename</span>
          <input
            value={form.displayName}
            onChange={(event) => update("displayName", event.target.value)}
            maxLength={120}
          />
        </label>
        <label className={styles.field}>
          <span>Rolle</span>
          <input
            value={form.roleTitle}
            onChange={(event) => update("roleTitle", event.target.value)}
            maxLength={160}
          />
        </label>
        <label className={styles.field}>
          <span>Standort</span>
          <input
            value={form.locationText}
            onChange={(event) => update("locationText", event.target.value)}
            maxLength={160}
          />
        </label>
        <label className={styles.field}>
          <span>Profil-Adresse (Slug)</span>
          <input
            value={form.slug}
            onChange={(event) => update("slug", event.target.value)}
            maxLength={60}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
          />
        </label>

        <div className={`${styles.full} ${styles.formSectionHeading}`}>
          <strong>Kompetenzprofil</strong>
          <span>Such- und matchbare Merkmale</span>
        </div>
        <div className={styles.full}>
          <TagInput
            classes={tagClasses}
            label="Skills"
            placeholder="Skill hinzufügen"
            values={form.skills}
            max={MAX_SKILLS}
            required
            onChange={(next) => update("skills", next)}
          />
        </div>
        <div className={styles.full}>
          <TagInput
            classes={tagClasses}
            label="Sprachen"
            placeholder="Sprache hinzufügen"
            values={form.languages}
            max={MAX_LANGUAGES}
            required
            onChange={(next) => update("languages", next)}
          />
        </div>
        <div className={styles.full}>
          <TagInput
            classes={tagClasses}
            label="Qualifikationen"
            placeholder="Qualifikation hinzufügen"
            values={form.qualifications}
            max={MAX_QUALIFICATIONS}
            required
            onChange={(next) => update("qualifications", next)}
          />
        </div>
        <div className={styles.full}>
          <TagInput
            classes={tagClasses}
            label="Branchen"
            placeholder="Branche hinzufügen"
            values={form.industries}
            max={MAX_INDUSTRIES}
            required
            onChange={(next) => update("industries", next)}
          />
        </div>

        <label className={`${styles.field} ${styles.full}`}>
          <span>Kurzprofil</span>
          <textarea
            value={form.experienceSummary}
            onChange={(event) => update("experienceSummary", event.target.value)}
            maxLength={MAX_SUMMARY_LENGTH}
          />
        </label>

        <div className={`${styles.full} ${styles.formSectionHeading}`}>
          <strong>Einsatz &amp; Konditionen</strong>
          <span>Verfügbarkeit, Arbeitsform und Honorar</span>
        </div>
        <div className={`${styles.field} ${styles.full}`}>
          <span>Arbeitsform</span>
          <div className={styles.checks}>
            {WORK_MODES.map((mode) => (
              <label key={mode} className={styles.check}>
                <input
                  type="checkbox"
                  checked={form.workModes.includes(mode)}
                  onChange={() => toggleWorkMode(mode)}
                />
                {WORK_MODE_LABELS[mode]}
              </label>
            ))}
          </div>
        </div>

        <label className={styles.field}>
          <span>Verfügbarkeit</span>
          <select
            value={form.availabilityStatus}
            onChange={(event) =>
              update(
                "availabilityStatus",
                event.target.value as AvailabilityStatus,
              )
            }
          >
            {AVAILABILITY_STATUSES.map((value) => (
              <option key={value} value={value}>
                {AVAILABILITY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Verfügbar ab</span>
          <input
            value={form.availabilityFrom}
            onChange={(event) => update("availabilityFrom", event.target.value)}
            type="date"
          />
        </label>
        <label className={styles.field}>
          <span>Monatsgehalt</span>
          <input
            value={form.monthlySalary}
            onChange={(event) => update("monthlySalary", event.target.value)}
            type="number"
            min={1}
            step="0.01"
          />
        </label>
        <label className={styles.field}>
          <span>Stundensatz</span>
          <input
            value={form.hourlyRate}
            onChange={(event) => update("hourlyRate", event.target.value)}
            type="number"
            min={1}
            step="0.01"
          />
        </label>
        <label className={styles.field}>
          <span>Tagessatz</span>
          <input
            value={form.dayRate}
            onChange={(event) => update("dayRate", event.target.value)}
            type="number"
            min={1}
            step="0.01"
          />
        </label>
        <label className={styles.field}>
          <span>Währung</span>
          <select
            value={form.currency}
            onChange={(event) =>
              update("currency", event.target.value as (typeof CURRENCIES)[number])
            }
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>

        <div className={`${styles.full} ${styles.formSectionHeading}`}>
          <strong>Freigabe &amp; Sichtbarkeit</strong>
          <span>Terminbuchung, Prüfstatus und Kundenzugriff</span>
        </div>
        <label className={`${styles.field} ${styles.full}`}>
          <span>Sucht</span>
          <select
            value={form.seeking}
            onChange={(event) => update("seeking", event.target.value as ReviewDefaults["seeking"])}
          >
            <option value="projects">Freelance-Projekte</option>
            <option value="both">Projekte oder Festanstellung</option>
            <option value="employment">Nur Festanstellung (erscheint nicht in der Freelancer-Suche)</option>
          </select>
        </label>
        <label className={`${styles.field} ${styles.full}`}>
          <span>Terminlink (optional)</span>
          <input
            value={form.bookingUrl}
            onChange={(event) => update("bookingUrl", event.target.value)}
            type="url"
            placeholder="https://calendly.com/…"
            maxLength={1000}
          />
        </label>

        <label className={styles.field}>
          <span>Erstgespräch</span>
          <select
            value={form.introPolicy}
            onChange={(event) =>
              update(
                "introPolicy",
                event.target.value as ReviewDefaults["introPolicy"],
              )
            }
          >
            <option value="free">Direkt buchbar</option>
            <option value="manual_approval">Nur nach manueller Freigabe</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Prüfstatus</span>
          <select
            value={form.verificationStatus}
            onChange={(event) =>
              update(
                "verificationStatus",
                event.target.value as ReviewDefaults["verificationStatus"],
              )
            }
          >
            {(
              Object.keys(VERIFICATION_LABELS) as Array<
                ReviewDefaults["verificationStatus"]
              >
            ).map((value) => (
              <option key={value} value={value}>
                {VERIFICATION_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className={`${styles.field} ${styles.full}`}>
          <span>Referenznotiz (öffentlich sichtbar)</span>
          <textarea
            value={form.referencesSummary}
            onChange={(event) => update("referencesSummary", event.target.value)}
            maxLength={2000}
            style={{ minHeight: 80 }}
          />
        </label>

        {hasCv ? (
          <div className={`${styles.field} ${styles.full}`}>
            <span>Lebenslauf</span>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={form.cvDownloadable}
                onChange={(event) =>
                  update("cvDownloadable", event.target.checked)
                }
              />
              Für gematchte Kunden zum Download freigeben
            </label>
            <span className={styles.hint}>
              Der Lebenslauf wird bei der Freigabe ins Profil übernommen. Ohne
              dieses Häkchen bleibt er intern — die Einwilligung zur Prüfung ist
              nicht automatisch eine Einwilligung zur Weitergabe.
            </span>
          </div>
        ) : null}
      </div>

      {projects.length ? (
        <>
          <h3>Referenzprojekte aus der Bewerbung</h3>
          <p className={styles.hint}>
            Angehakte gehen ins Profil, so wie eingereicht. „Geprüft“ nur mit Nachweis (Lebenslauf,
            Referenz, Gespräch); bearbeiten lassen sie sich danach unter Admin → Profile.
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {projects.map((project, index) => {
              const chosen = form.projects.find((entry) => entry.index === index);
              const meta = [project.role, project.client ?? project.industry, projectPeriod(project)].filter(Boolean).join(" · ");
              return (
                <div key={index} style={{ display: "grid", gap: 4, border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                  <strong>{project.title}</strong>
                  {meta || !project.isPublic ? (
                    <span className={styles.hint}>
                      {meta}
                      {project.isPublic ? "" : `${meta ? " · " : ""}soll nicht im Profil erscheinen`}
                    </span>
                  ) : null}
                  {project.technologies.length ? <span className={styles.hint}>{project.technologies.join(", ")}</span> : null}
                  {project.outcome ? <span>{project.outcome}</span> : null}
                  {project.link ? (
                    <a href={project.link} target="_blank" rel="noopener noreferrer nofollow">
                      {project.link}
                    </a>
                  ) : null}
                  <span style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={Boolean(chosen)}
                        onChange={(event) => chooseProject(index, { chosen: event.target.checked, verified: false })}
                      />
                      übernehmen
                    </label>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        disabled={!chosen}
                        checked={Boolean(chosen?.verified)}
                        onChange={(event) => chooseProject(index, { chosen: true, verified: event.target.checked })}
                      />
                      von XPORTAL geprüft
                    </label>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {hasPhoto ? (
        <>
          <h3>Foto</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
            {photoUrl ? (
              <span
                role="img"
                aria-label="Foto aus der Bewerbung"
                style={{
                  width: 72,
                  height: 72,
                  flex: "none",
                  borderRadius: "50%",
                  background: `center / cover no-repeat url(${JSON.stringify(photoUrl)})`,
                }}
              />
            ) : (
              <span className={styles.hint}>Vorschau nicht verfügbar.</span>
            )}
            <label className={styles.check}>
              <input type="checkbox" checked={form.usePhoto} onChange={(event) => update("usePhoto", event.target.checked)} />
              Als Profilbild verwenden
            </label>
          </div>
          <p className={styles.hint}>Ohne Haken wird das Foto bei der Freigabe gelöscht, ebenso bei einer Ablehnung.</p>
        </>
      ) : null}

      <h3>Was haben Sie selbst geprüft?</h3>
      <p className={styles.hint}>
        Nur angehakte Angaben werden Kundinnen und Kunden als{" "}
        <strong>geprüft</strong> angezeigt. Alles andere bleibt als
        Eigenangabe gekennzeichnet.
      </p>
      <div className={styles.factList}>
        {facts.map((entry) => (
          <label key={entry.fact} className={styles.factRow}>
            <input
              type="checkbox"
              checked={verifiedFacts.includes(entry.fact)}
              onChange={() => toggleFact(entry.fact)}
            />
            <span className={styles.factCategory}>
              {FACT_CATEGORY_LABELS[entry.category]}
            </span>
            <span className={styles.factValue}>
              {entry.value.length > 180
                ? `${entry.value.slice(0, 180)}…`
                : entry.value}
            </span>
          </label>
        ))}
      </div>
      <p className={styles.hint} style={{ marginTop: 6 }}>
        {verifiedFacts.length}/{MAX_FACTS_PER_COLUMN} als geprüft markiert
      </p>

      <label className={styles.field} style={{ marginTop: 18 }}>
        <span>Interne Notiz zur Prüfung</span>
        <textarea
          value={form.reviewNotes}
          onChange={(event) => update("reviewNotes", event.target.value)}
          maxLength={4000}
          style={{ minHeight: 80 }}
        />
      </label>

      {!form.bookingUrl ? (
        <div className={styles.callout}>
          <strong>Ohne Terminlink</strong>
          <span>
            Kunden fragen das Profil über XPORTAL an, und Sie stellen per Mail
            vor. Dafür braucht es eine E-Mail-Adresse des Freelancers; mit
            Terminlink wählt der Kunde danach selbst einen Slot.
          </span>
        </div>
      ) : null}

      {noRate ? (
        <div className={`${styles.callout} ${styles.warning}`}>
          <strong>Kein Honorar hinterlegt</strong>
          <span>Stunden- oder Tagessatz ist für die Freigabe erforderlich.</span>
        </div>
      ) : null}

      {error ? (
        <div className={styles.formError} role="alert">
          {error}
          {issues.length ? (
            <ul>
              {issues.slice(0, 8).map((issue) => (
                <li key={`${issue.path}:${issue.message}`}>
                  {issue.path ? `${issue.path}: ` : ""}
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          onClick={() => void send("publish")}
          disabled={busy !== null || decided}
        >
          {busy === "publish" ? "Wird veröffentlicht …" : "Prüfen & freigeben"}
        </button>
        {status === "submitted" ? (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => void send("start_review")}
            disabled={busy !== null}
          >
            In Prüfung nehmen
          </button>
        ) : null}
        <button
          type="button"
          className={styles.danger}
          onClick={() => void send("reject")}
          disabled={busy !== null || decided}
        >
          {busy === "reject" ? "Wird abgelehnt …" : "Ablehnen"}
        </button>
        {status === "rejected" ? (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => void send("reopen")}
            disabled={busy !== null}
          >
            {busy === "reopen" ? "Wird geöffnet …" : "Wieder öffnen"}
          </button>
        ) : null}
        {decided ? (
          <span className={styles.hint}>
            {status === "approved"
              ? "Diese Bewerbung ist bereits veröffentlicht."
              : "Diese Bewerbung wurde abgelehnt."}
          </span>
        ) : null}
      </div>
    </div>
  );
}
