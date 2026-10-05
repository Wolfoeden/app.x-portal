"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { TagInput } from "@/components/TagInput";
import { ShowcaseCard } from "@/components/chat/showcase-card";
import { ProjectListEditor } from "@/components/profile/ProjectListEditor";
import { appPath } from "@/lib/app-path";
import { applicationPreviewProfile } from "@/lib/freelancer/application-preview";
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES, type AvatarMimeType } from "@/lib/freelancer/avatar-limits";
import { profileStrength } from "@/lib/freelancer/profile-strength";
import type { ProfileProject } from "@/lib/profile/project-limits";
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_STATUSES,
  CURRENCIES,
  CV_MAX_BYTES,
  CV_MIME_TYPES,
  MAX_INDUSTRIES,
  MAX_LANGUAGES,
  MAX_QUALIFICATIONS,
  MAX_SKILLS,
  MAX_SUMMARY_LENGTH,
  WORK_MODE_LABELS,
  WORK_MODES,
  type AvailabilityStatus,
  type CvMimeType,
  type WorkMode,
  REFERRAL_PATTERN,
  SEEKING_LABELS,
  SEEKING_OPTIONS,
  type Seeking,
} from "@/lib/freelancer/limits";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

import styles from "./apply.module.css";
import { PROJECT_EDITOR_CLASSES } from "./project-editor-classes";

type UploadedCv = {
  storagePath: string;
  token: string;
  originalFilename: string;
  mimeType: CvMimeType;
  sizeBytes: number;
};

type UploadedPhoto = { storagePath: string; token: string; previewUrl: string };

type SubmitIssue = { path: string; message: string };

function isAvatarMimeType(value: string): value is AvatarMimeType {
  return (AVATAR_MIME_TYPES as readonly string[]).includes(value);
}

/** Für die Vorschau: Die CSP erlaubt `data:`-Bilder, aber keine `blob:`-Adressen. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const CV_ACCEPT = "application/pdf,.pdf";

function isCvMimeType(value: string): value is CvMimeType {
  return (CV_MIME_TYPES as readonly string[]).includes(value);
}

function formatFileSize(bytes: number): string {
  const megabytes = bytes / 1_048_576;
  return megabytes >= 0.1
    ? `${megabytes.toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Mirrors the server rule: a parseable HTTPS URL with a real hostname. */
function isUsableBookingUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && url.hostname.includes(".");
  } catch {
    return false;
  }
}

const tagClasses = {
  field: styles.field,
  tagBox: styles.tagBox,
  tag: styles.tag,
  hint: styles.hint,
  optional: styles.optional,
};

/** Wo die Herkunft den Umweg über die Anmeldung überdauert. */
export const REFERRAL_STORAGE_KEY = "xportal.apply-referral.v1";
const REFERRAL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function rememberedReferral(): string | null {
  try {
    const raw = window.localStorage.getItem(REFERRAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { referral?: unknown; at?: unknown };
    return typeof parsed.referral === "string" &&
      REFERRAL_PATTERN.test(parsed.referral) &&
      typeof parsed.at === "number" &&
      Date.now() - parsed.at < REFERRAL_MAX_AGE_MS
      ? parsed.referral
      : null;
  } catch {
    return null;
  }
}

const SEEKING_HINTS: Readonly<Record<Seeking, string>> = {
  projects: "Sie arbeiten selbstständig oder möchten es werden.",
  employment: "Sie suchen eine Anstellung.",
  both: "Sie entscheiden, wenn es konkret wird.",
};

export function ApplyForm({
  accountEmail = "",
  accountName = null,
  inviteToken = null,
  referral = null,
  extrasAvailable = false,
}: {
  accountEmail?: string;
  /** Der Name aus der Registrierung, damit niemand ihn zweimal tippt. */
  accountName?: string | null;
  /** Projekte und Foto lassen sich speichern (Migration 20261006100000). */
  extrasAvailable?: boolean;
  /** `?quelle=` der Seite, etwa `arbeitsagentur`; sonst die gemerkte. */
  referral?: string | null;
  /**
   * Das Kennzeichen aus der Einladung. Es reist mit dem Formular mit, damit
   * die Anmeldung dem recherchierten Kandidaten zugeordnet werden kann —
   * sonst steht sie als zweite Zeile daneben und seine verfaellt.
   */
  inviteToken?: string | null;
}) {
  const [seeking, setSeeking] = useState<Seeking>("projects");
  // Nach einer Anmeldung per E-Mail-Link fehlt `?quelle=` in der Adresse;
  // dann gilt, was die Seite beim ersten Besuch gemerkt hat. Die Herkunft
  // wird nicht angezeigt, der Unterschied zwischen Server und Browser ist
  // also unsichtbar.
  const [source] = useState<string | null>(() =>
    referral ?? (typeof window === "undefined" ? null : rememberedReferral()),
  );
  const [fullName, setFullName] = useState(accountName ?? "");
  const [contactEmail, setContactEmail] = useState(accountEmail);
  const [contactPhone, setContactPhone] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [experienceSummary, setExperienceSummary] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [locationText, setLocationText] = useState("");
  const [workModes, setWorkModes] = useState<WorkMode[]>(["remote"]);
  const [hourlyRate, setHourlyRate] = useState("");
  const [dayRate, setDayRate] = useState("");
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>("EUR");
  const [availabilityStatus, setAvailabilityStatus] =
    useState<AvailabilityStatus>("available");
  const [availabilityFrom, setAvailabilityFrom] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");
  const [bookingUrlTouched, setBookingUrlTouched] = useState(false);
  const [applicantNote, setApplicantNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [previewAt] = useState(() => new Date());
  const employment = seeking === "employment";

  const [projects, setProjects] = useState<ProfileProject[]>([]);
  const [photo, setPhoto] = useState<UploadedPhoto | null>(null);
  const [photoStatus, setPhotoStatus] = useState<"idle" | "uploading">("idle");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [cv, setCv] = useState<UploadedCv | null>(null);
  const [cvStatus, setCvStatus] = useState<"idle" | "uploading">("idle");
  const [cvError, setCvError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitState, setSubmitState] = useState<
    "editing" | "submitting" | "done"
  >("editing");
  const [formError, setFormError] = useState<string | null>(null);
  const [issues, setIssues] = useState<SubmitIssue[]>([]);

  // Dieselbe Zählung wie im Dashboard; die Verfügbarkeit gilt mit dem
  // Absenden als frisch angegeben.
  const strength = profileStrength({
    hasPhoto: Boolean(photo),
    summaryLength: experienceSummary.trim().length,
    projects: projects
      .filter((project) => project.isPublic && project.title.trim())
      .map((project) => ({ hasOutcome: Boolean(project.outcome) })),
    hasRate: Boolean(hourlyRate || dayRate),
    seeking,
    availabilityUpdatedAt: previewAt.toISOString(),
    skillsCount: skills.length,
    industriesCount: industries.length,
    now: previewAt,
  });

  const bookingUrlInvalid =
    bookingUrlTouched && Boolean(bookingUrl.trim()) && !isUsableBookingUrl(bookingUrl);

  function toggleWorkMode(mode: WorkMode) {
    setWorkModes((current) =>
      current.includes(mode)
        ? current.filter((entry) => entry !== mode)
        : [...current, mode],
    );
  }

  async function uploadCv(file: File) {
    setCvError(null);

    if (file.size > CV_MAX_BYTES) {
      setCvError("Die Datei ist größer als 10 MB.");
      return;
    }
    if (!isCvMimeType(file.type) || !/\.pdf$/iu.test(file.name)) {
      setCvError("Bitte eine PDF-Datei auswählen.");
      return;
    }

    setCvStatus("uploading");
    try {
      const ticketResponse = await fetch(
        appPath("/api/freelancer-applications/cv-upload"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
        },
      );
      const ticket = (await ticketResponse.json()) as {
        bucket?: string;
        path?: string;
        uploadToken?: string;
        pathToken?: string;
        error?: string;
      };
      if (!ticketResponse.ok || !ticket.path || !ticket.uploadToken) {
        setCvError(ticket.error ?? "Der Upload konnte nicht gestartet werden.");
        return;
      }

      // The file goes directly to Supabase Storage with a one-object token, so
      // it never passes through the application server.
      const supabase = getBrowserSupabaseClient();
      const { error } = await supabase.storage
        .from(ticket.bucket ?? "freelancer-cvs")
        .uploadToSignedUrl(ticket.path, ticket.uploadToken, file, {
          contentType: file.type,
        });
      if (error) {
        setCvError("Der Upload ist fehlgeschlagen. Bitte erneut versuchen.");
        return;
      }

      setCv({
        storagePath: ticket.path,
        token: ticket.pathToken ?? "",
        originalFilename: file.name.slice(0, 255),
        mimeType: file.type,
        sizeBytes: file.size,
      });
    } catch {
      setCvError("Der Upload ist fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setCvStatus("idle");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function uploadPhoto(file: File) {
    setPhotoError(null);
    if (file.size > AVATAR_MAX_BYTES || !isAvatarMimeType(file.type)) {
      setPhotoError("Erlaubt sind JPEG, PNG oder WebP bis 5 MB.");
      return;
    }
    setPhotoStatus("uploading");
    try {
      const ticketResponse = await fetch(appPath("/api/freelancer-applications/photo-upload"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
      });
      const ticket = (await ticketResponse.json()) as {
        bucket?: string;
        path?: string;
        uploadToken?: string;
        pathToken?: string;
        error?: string;
      };
      if (!ticketResponse.ok || !ticket.path || !ticket.uploadToken || !ticket.pathToken) {
        setPhotoError(ticket.error ?? "Der Upload konnte nicht gestartet werden.");
        return;
      }
      const { error } = await getBrowserSupabaseClient()
        .storage.from(ticket.bucket ?? "freelancer-avatars")
        .uploadToSignedUrl(ticket.path, ticket.uploadToken, file, { contentType: file.type });
      if (error) {
        setPhotoError("Der Upload ist fehlgeschlagen. Bitte erneut versuchen.");
        return;
      }
      setPhoto({ storagePath: ticket.path, token: ticket.pathToken, previewUrl: await readAsDataUrl(file) });
    } catch {
      setPhotoError("Der Upload ist fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setPhotoStatus("idle");
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setIssues([]);

    if (!skills.length) {
      setFormError("Bitte mindestens einen Skill angeben.");
      return;
    }
    if (!languages.length) {
      setFormError("Bitte mindestens eine Sprache angeben.");
      return;
    }
    if (!workModes.length) {
      setFormError("Bitte mindestens eine Arbeitsform auswählen.");
      return;
    }
    if (!employment && !hourlyRate && !dayRate) {
      setFormError("Bitte Stundensatz oder Tagessatz angeben.");
      return;
    }
    // Leere Projekte fallen weg; ein angefangener Titel wird gemeldet, bevor
    // der Server das ganze Formular zurückweist.
    const filledProjects = extrasAvailable ? projects.filter((project) => project.title.trim()) : [];
    const shortTitle = filledProjects.findIndex((project) => project.title.trim().length < 3);
    if (shortTitle >= 0) {
      setFormError(`Projekt ${shortTitle + 1}: Bitte einen Titel mit mindestens drei Zeichen angeben.`);
      return;
    }
    if (bookingUrl.trim() && !isUsableBookingUrl(bookingUrl)) {
      setBookingUrlTouched(true);
      setFormError(
        "Der Terminlink ist unvollständig. Bitte eine vollständige HTTPS-Adresse angeben, zum Beispiel https://calendly.com/ihr-name/30min, oder das Feld leer lassen.",
      );
      return;
    }

    setSubmitState("submitting");
    try {
      const response = await fetch(appPath("/api/freelancer-applications"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          fullName,
          contactEmail,
          contactPhone,
          websiteUrl,
          roleTitle,
          experienceSummary,
          skills,
          languages,
          qualifications,
          industries,
          locationText,
          workModes,
          // Für eine feste Stelle sind die Felder ausgeblendet; was vorher
          // darin stand, soll nicht unsichtbar mitreisen.
          hourlyRate: employment ? "" : hourlyRate,
          dayRate: employment ? "" : dayRate,
          currency,
          availabilityStatus,
          availabilityFrom,
          bookingUrl: bookingUrl.trim(),
          seeking,
          referral: source,
          applicantNote,
          cv,
          projects: filledProjects,
          photo: extrasAvailable && photo ? { storagePath: photo.storagePath, token: photo.token } : null,
          consent,
          inviteToken,
          website: honeypot,
        }),
      });

      if (response.ok) {
        setSubmitState("done");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        issues?: SubmitIssue[];
      };
      setFormError(
        payload.error ?? "Die Bewerbung konnte nicht gespeichert werden.",
      );
      setIssues(payload.issues ?? []);
      setSubmitState("editing");
    } catch {
      setFormError("Keine Verbindung zum Server. Bitte erneut versuchen.");
      setSubmitState("editing");
    }
  }

  if (submitState === "done") {
    return (
      <div className={styles.success} role="status">
        <p className={styles.eyebrow}>Eingegangen</p>
        <h2>Danke — wir prüfen Ihr Profil.</h2>
        <p>
          Ihre Angaben liegen jetzt zur Prüfung vor. Erst nach der Freigabe
          durch unser Team wird Ihr Profil im Portal sichtbar und kann für
          Projekte vorgeschlagen werden.
        </p>
        <ol>
          <li>Wir sehen uns Ihre Angaben und Ihren Lebenslauf an.</li>
          <li>Bei Rückfragen melden wir uns unter {contactEmail}.</li>
          <li>Nach der Freigabe melden wir uns, wenn eine Anfrage zu Ihnen passt.</li>
        </ol>
      </div>
    );
  }

  const disabled = submitState === "submitting";

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <section className={styles.section}>
        <p className={styles.eyebrow}>01 · Kontakt</p>
        <h2>Wer sind Sie?</h2>
        <p className={styles.sectionHint}>
          Diese Angaben sehen nur wir. Öffentlich sichtbar wird später nur Ihr
          freigegebenes Profil.
        </p>

        <fieldset className={styles.seeking}>
          <legend>Was suchen Sie?</legend>
          {SEEKING_OPTIONS.map((option) => (
            <label key={option} className={styles.seekingOption} data-checked={seeking === option}>
              <input
                type="radio"
                name="seeking"
                value={option}
                checked={seeking === option}
                onChange={() => setSeeking(option)}
              />
              <span>
                <strong>{SEEKING_LABELS[option]}</strong>
                <small>{SEEKING_HINTS[option]}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <div className={styles.grid}>
          <label className={styles.field}>
            <span>Vor- und Nachname</span>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              minLength={2}
              maxLength={120}
              required
            />
          </label>
          <label className={styles.field}>
            <span>E-Mail-Adresse</span>
            <input
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              type="email"
              autoComplete="email"
              maxLength={160}
              readOnly={Boolean(accountEmail)}
              required
            />
            {accountEmail ? (
              <span className={styles.hint}>Mit Ihrem Konto verknüpft</span>
            ) : null}
          </label>
          <label className={styles.field}>
            <span>
              Telefon<span className={styles.optional}> · optional</span>
            </span>
            <input
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              type="tel"
              autoComplete="tel"
              maxLength={40}
            />
          </label>
          <label className={styles.field}>
            <span>
              Website oder LinkedIn
              <span className={styles.optional}> · optional</span>
            </span>
            <input
              value={websiteUrl}
              onChange={(event) => setWebsiteUrl(event.target.value)}
              type="url"
              inputMode="url"
              placeholder="https://"
              maxLength={1000}
            />
          </label>
          <label className={styles.field}>
            <span>
              Standort<span className={styles.optional}> · optional</span>
            </span>
            <input
              value={locationText}
              onChange={(event) => setLocationText(event.target.value)}
              placeholder="Berlin, Deutschland"
              maxLength={160}
            />
          </label>
        </div>
      </section>

      <section className={styles.section}>
        <p className={styles.eyebrow}>02 · Profil</p>
        <h2>Was machen Sie?</h2>
        <p className={styles.sectionHint}>
          Skills und Sprachen entscheiden darüber, für welche Projekte Sie
          vorgeschlagen werden. Nennen Sie lieber konkrete Werkzeuge als allgemeine
          Schlagworte.
        </p>

        <div className={styles.grid}>
          {extrasAvailable ? (
            <div className={`${styles.field} ${styles.full}`}>
              <span>
                Foto<span className={styles.optional}> · optional</span>
              </span>
              <div className={styles.upload}>
                <input
                  ref={photoInputRef}
                  className={styles.hiddenFile}
                  type="file"
                  accept={AVATAR_MIME_TYPES.join(",")}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadPhoto(file);
                  }}
                />
                <button
                  type="button"
                  className={styles.uploadButton}
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoStatus === "uploading"}
                >
                  {photoStatus === "uploading" ? "Wird hochgeladen …" : photo ? "Anderes Foto wählen" : "Foto auswählen"}
                </button>
                <span className={styles.uploadState}>
                  {photo ? (
                    <>
                      Foto gewählt ·{" "}
                      <button type="button" onClick={() => setPhoto(null)}>
                        entfernen
                      </button>
                    </>
                  ) : (
                    "Ohne Foto zeigt die Karte Ihre Initialen."
                  )}
                </span>
              </div>
              <span className={styles.hint}>
                JPEG, PNG oder WebP bis 5 MB. Freiwillig: Das Foto erscheint erst nach der Freigabe auf
                Ihrer Profilkarte; im Dashboard können Sie es jederzeit ändern oder entfernen.
              </span>
              {photoError ? (
                <span className={styles.error} role="alert">
                  {photoError}
                </span>
              ) : null}
            </div>
          ) : null}

          <label className={`${styles.field} ${styles.full}`}>
            <span>Rolle / Titel</span>
            <input
              value={roleTitle}
              onChange={(event) => setRoleTitle(event.target.value)}
              placeholder="Senior Frontend-Entwicklerin"
              minLength={2}
              maxLength={160}
              required
            />
          </label>

          <div className={styles.full}>
            <TagInput
              classes={tagClasses}
              label="Skills"
              placeholder="React, TypeScript, …"
              values={skills}
              max={MAX_SKILLS}
              required
              onChange={setSkills}
            />
          </div>

          <div className={styles.full}>
            <TagInput
              classes={tagClasses}
              label="Sprachen"
              placeholder="Deutsch, Englisch, …"
              values={languages}
              max={MAX_LANGUAGES}
              required
              onChange={setLanguages}
            />
          </div>

          <div className={styles.full}>
            <TagInput
              classes={tagClasses}
              label="Qualifikationen und Zertifikate"
              hint="z. B. Abschlüsse, Zertifizierungen"
              placeholder="AWS Solutions Architect, …"
              values={qualifications}
              max={MAX_QUALIFICATIONS}
              onChange={setQualifications}
            />
          </div>

          <div className={styles.full}>
            <TagInput
              classes={tagClasses}
              label="Branchenerfahrung"
              placeholder="Fintech, Industrie, …"
              values={industries}
              max={MAX_INDUSTRIES}
              onChange={setIndustries}
            />
          </div>

          <label className={`${styles.field} ${styles.full}`}>
            <span>Kurzprofil</span>
            <textarea
              value={experienceSummary}
              onChange={(event) => setExperienceSummary(event.target.value)}
              placeholder="Was machen Sie, seit wann, und woran haben Sie zuletzt gearbeitet? Mindestens 40 Zeichen."
              minLength={40}
              maxLength={MAX_SUMMARY_LENGTH}
              required
            />
            <span className={styles.hint}>
              {experienceSummary.trim().length}/{MAX_SUMMARY_LENGTH} Zeichen
            </span>
          </label>
        </div>
      </section>

      <section className={styles.section}>
        <p className={styles.eyebrow}>03 · Zusammenarbeit</p>
        <h2>Wie und ab wann arbeiten Sie?</h2>

        <div className={styles.grid}>
          <div className={`${styles.field} ${styles.full}`}>
            <span>Arbeitsform</span>
            <div className={styles.checks}>
              {WORK_MODES.map((mode) => (
                <label key={mode} className={styles.check}>
                  <input
                    type="checkbox"
                    checked={workModes.includes(mode)}
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
              value={availabilityStatus}
              onChange={(event) =>
                setAvailabilityStatus(event.target.value as AvailabilityStatus)
              }
            >
              {AVAILABILITY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {AVAILABILITY_LABELS[status]}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>
              Verfügbar ab<span className={styles.optional}> · optional</span>
            </span>
            <input
              value={availabilityFrom}
              onChange={(event) => setAvailabilityFrom(event.target.value)}
              type="date"
            />
          </label>

          {employment ? (
            <div className={`${styles.callout} ${styles.full}`}>
              <strong>Für eine feste Stelle brauchen wir kein Honorar.</strong>
              <span>Das Gehalt besprechen Sie direkt mit dem Unternehmen.</span>
            </div>
          ) : (
            <>
              <label className={styles.field}>
                <span>Stundensatz</span>
                <input
                  value={hourlyRate}
                  onChange={(event) => setHourlyRate(event.target.value)}
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step="0.01"
                  placeholder="95"
                />
              </label>

              <label className={styles.field}>
                <span>Tagessatz</span>
                <input
                  value={dayRate}
                  onChange={(event) => setDayRate(event.target.value)}
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step="0.01"
                  placeholder="760"
                />
              </label>

              <label className={styles.field}>
                <span>Währung</span>
                <select
                  value={currency}
                  onChange={(event) =>
                    setCurrency(event.target.value as (typeof CURRENCIES)[number])
                  }
                >
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>

              <span className={`${styles.hint} ${styles.full}`}>
                Mindestens einer der beiden Sätze ist erforderlich. Beträge netto, ohne Umsatzsteuer.
              </span>
            </>
          )}

          <label
            className={`${styles.field} ${styles.full} ${
              bookingUrlInvalid ? styles.invalid : ""
            }`}
          >
            <span>Terminlink für ein Erstgespräch (optional)</span>
            <input
              value={bookingUrl}
              onChange={(event) => setBookingUrl(event.target.value)}
              onBlur={() => setBookingUrlTouched(true)}
              type="url"
              inputMode="url"
              placeholder="https://calendly.com/ihr-name/30min"
              maxLength={1000}
              aria-invalid={bookingUrlInvalid}
            />
            {bookingUrlInvalid ? (
              <span className={styles.error}>
                Bitte eine vollständige HTTPS-Adresse angeben, zum Beispiel
                https://calendly.com/ihr-name/30min
              </span>
            ) : null}
          </label>

          <div className={`${styles.callout} ${styles.full}`}>
            <strong>Kein Kalender? Kein Problem.</strong>
            <span>
              Kunden fragen Sie über XPORTAL an, und wir stellen Sie per Mail
              vor. Mit Terminlink wählt der Kunde nach der Vorstellung direkt
              einen freien Slot, das geht schneller. Calendly, Cal.com und
              TidyCal sind in wenigen Minuten eingerichtet und kostenlos.
            </span>
          </div>
        </div>
      </section>

      <aside className={styles.preview} aria-labelledby="apply-preview-title">
        <p className={styles.eyebrow}>Vorschau</p>
        <h2 id="apply-preview-title">
          {employment ? "So sieht XPORTAL Ihr Profil" : "So sehen Unternehmen Ihr Profil"}
        </h2>
        <ShowcaseCard
          href={null}
          now={previewAt}
          profile={applicationPreviewProfile(
            {
              fullName,
              roleTitle,
              skills,
              locationText,
              workModes,
              hourlyRate,
              dayRate,
              currency,
              availabilityStatus,
              availabilityFrom,
              bookingUrl,
              seeking,
              experienceSummary,
              avatarUrl: photo?.previewUrl ?? null,
              projects,
            },
            previewAt,
          )}
        />
        <div className={styles.previewStrength}>
          <span>
            Profilstärke <strong>{strength.done} von {strength.total}</strong>
          </span>
          <meter min={0} max={strength.total} value={strength.done} aria-label="Profilstärke" />
          {strength.next ? (
            <span className={styles.hint}>Nächster Schritt: {strength.next.label}.</span>
          ) : null}
        </div>
        <p className={styles.hint}>
          {employment
            ? "Für eine feste Stelle erscheint Ihr Profil nicht in der öffentlichen Freelancer-Suche."
            : "Sichtbar erst nach der Freigabe. Den Haken „geprüft“ setzt XPORTAL nach der Sichtung."}
        </p>
      </aside>

      {extrasAvailable ? (
        <section className={styles.section}>
          <p className={styles.eyebrow}>04 · Referenzprojekte</p>
          <h2>Woran haben Sie gearbeitet?</h2>
          <p className={styles.sectionHint}>
            Freiwillig, aber das Überzeugendste an einem Profil. Bis zu acht Projekte; das erste steht auf
            Ihrer Karte. Ohne Haken „im Profil zeigen“ sieht ein Projekt nur unser Team.
          </p>
          <ProjectListEditor projects={projects} onChange={setProjects} mode="owner" classes={PROJECT_EDITOR_CLASSES} />
        </section>
      ) : null}

      <section className={styles.section}>
        <p className={styles.eyebrow}>{extrasAvailable ? "05" : "04"} · Nachweise</p>
        <h2>Lebenslauf und Hinweise</h2>
        <p className={styles.sectionHint}>
          Der Lebenslauf dient zuerst der Prüfung. Ob er später für passende
          Kunden sichtbar wird, entscheiden wir separat und nicht automatisch.
          PDF, maximal 10 MB.
        </p>

        <div className={styles.upload}>
          <input
            ref={fileInputRef}
            className={styles.hiddenFile}
            type="file"
            accept={CV_ACCEPT}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadCv(file);
            }}
          />
          <button
            type="button"
            className={styles.uploadButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={cvStatus === "uploading"}
          >
            {cvStatus === "uploading"
              ? "Wird hochgeladen …"
              : cv
                ? "Andere Datei wählen"
                : "Lebenslauf auswählen"}
          </button>

          {cv ? (
            <span className={styles.uploadState}>
              <strong>{cv.originalFilename}</strong> ·{" "}
              {formatFileSize(cv.sizeBytes)} ·{" "}
              <button type="button" onClick={() => setCv(null)}>
                entfernen
              </button>
            </span>
          ) : (
            <span className={styles.uploadState}>Noch keine Datei gewählt</span>
          )}
        </div>
        {cvError ? (
          <p className={styles.error} role="alert">
            {cvError}
          </p>
        ) : null}

        <div className={styles.grid} style={{ marginTop: 18 }}>
          <label className={`${styles.field} ${styles.full}`}>
            <span>
              Nachricht an uns<span className={styles.optional}> · optional</span>
            </span>
            <textarea
              value={applicantNote}
              onChange={(event) => setApplicantNote(event.target.value)}
              placeholder="Referenzen, Projektbeispiele oder alles, was bei der Prüfung hilft."
              maxLength={2000}
              style={{ minHeight: 96 }}
            />
          </label>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.honeypot} aria-hidden="true">
          <label>
            Website
            <input
              value={honeypot}
              onChange={(event) => setHoneypot(event.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </label>
        </div>

        {/*
          Ein Pflichthäkchen, und darin steht genau eine Erklärung.

          Vorher hing hier alles zusammen: der Wunsch, aufgenommen zu werden,
          die Speicherung von Angaben und Lebenslauf, die Kontaktaufnahme, die
          spätere Veröffentlichung und die AGB. Wer das ankreuzte, gab fünf
          Erklärungen auf einmal ab und konnte keine davon einzeln ablehnen.

          Was mit den Angaben geschieht, ist keine Einwilligung, sondern eine
          Auskunft: Es ist die Erfüllung genau dessen, wofür das Formular da
          ist. Deshalb steht es als Text daneben und nicht in einem Kästchen.
        */}
        <label className={styles.consent}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            required
          />
          <span>
            Ich stimme den <Link href="/terms">AGB</Link> zu.
          </span>
        </label>

        <p className={styles.consentNote}>
          XPORTAL speichert Ihre Angaben und den Lebenslauf, um die Bewerbung
          zu prüfen, und meldet sich dazu bei Ihnen. Nach der Freigabe wird Ihr
          Profil im Portal sichtbar, mit Foto und den Projekten, die Sie zum
          Zeigen markiert haben; der Lebenslauf wird Auftraggebern nur
          gezeigt, wenn XPORTAL ihn zusätzlich dafür freigibt. Ein nicht
          verwendetes Foto löschen wir. Näheres im{" "}
          <Link href="/privacy">Datenschutzhinweis</Link>.
        </p>

        {formError ? (
          <div className={styles.formError} role="alert" style={{ marginTop: 16 }}>
            {formError}
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

        <div className={styles.actions} style={{ marginTop: 18 }}>
          <button
            type="submit"
            className={styles.submit}
            disabled={disabled || !consent || cvStatus === "uploading" || photoStatus === "uploading"}
          >
            <span>
              {disabled ? "Wird gesendet …" : "Profil zur Sichtung senden"}
            </span>
            <span aria-hidden="true">→</span>
          </button>
          <span className={styles.actionsHint}>
            Wir sehen uns jedes Profil persönlich an, bevor es sichtbar wird.
          </span>
        </div>
      </section>
    </form>
  );
}
