"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { TagInput } from "@/components/TagInput";
import { appPath } from "@/lib/app-path";
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
} from "@/lib/freelancer/limits";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

import styles from "./apply.module.css";

type UploadedCv = {
  storagePath: string;
  token: string;
  originalFilename: string;
  mimeType: CvMimeType;
  sizeBytes: number;
};

type SubmitIssue = { path: string; message: string };

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

const tagClasses = {
  field: styles.field,
  tagBox: styles.tagBox,
  tag: styles.tag,
  hint: styles.hint,
  optional: styles.optional,
};

export function ApplyForm() {
  const [fullName, setFullName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
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
  const [applicantNote, setApplicantNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");

  const [cv, setCv] = useState<UploadedCv | null>(null);
  const [cvStatus, setCvStatus] = useState<"idle" | "uploading">("idle");
  const [cvError, setCvError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitState, setSubmitState] = useState<
    "editing" | "submitting" | "done"
  >("editing");
  const [formError, setFormError] = useState<string | null>(null);
  const [issues, setIssues] = useState<SubmitIssue[]>([]);

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
    if (!hourlyRate && !dayRate) {
      setFormError("Bitte Stundensatz oder Tagessatz angeben.");
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
          hourlyRate,
          dayRate,
          currency,
          availabilityStatus,
          availabilityFrom,
          bookingUrl,
          applicantNote,
          cv,
          consent,
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
        <h2>Danke — wir prüfen dein Profil.</h2>
        <p>
          Deine Angaben liegen jetzt zur Prüfung vor. Erst nach der Freigabe
          durch unser Team wird dein Profil im Portal sichtbar und kann für
          Projekte vorgeschlagen werden.
        </p>
        <ol>
          <li>Wir prüfen Angaben, Lebenslauf und Referenzen.</li>
          <li>Bei Rückfragen melden wir uns unter {contactEmail}.</li>
          <li>Nach der Freigabe ist dein Profil im Matching auffindbar.</li>
        </ol>
      </div>
    );
  }

  const disabled = submitState === "submitting";

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <section className={styles.section}>
        <p className={styles.eyebrow}>01 · Kontakt</p>
        <h2>Wer bist du?</h2>
        <p className={styles.sectionHint}>
          Diese Angaben sehen nur wir. Öffentlich sichtbar wird später nur dein
          freigegebenes Profil.
        </p>

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
              required
            />
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
        <h2>Was machst du?</h2>
        <p className={styles.sectionHint}>
          Skills und Sprachen entscheiden darüber, für welche Projekte du
          vorgeschlagen wirst. Nenne lieber konkrete Werkzeuge als allgemeine
          Schlagworte.
        </p>

        <div className={styles.grid}>
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
              placeholder="Was machst du, seit wann, und woran hast du zuletzt gearbeitet? Mindestens 40 Zeichen."
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
        <h2>Wie und ab wann arbeitest du?</h2>

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
            Mindestens einer der beiden Sätze ist erforderlich. Beträge netto,
            ohne Umsatzsteuer.
          </span>

          <label className={`${styles.field} ${styles.full}`}>
            <span>Terminlink für ein Erstgespräch</span>
            <input
              value={bookingUrl}
              onChange={(event) => setBookingUrl(event.target.value)}
              type="url"
              inputMode="url"
              placeholder="https://calendly.com/dein-name/30min"
              maxLength={1000}
            />
          </label>

          <div className={`${styles.callout} ${styles.full}`}>
            <strong>Warum der Terminlink wichtig ist</strong>
            <span>
              Kunden buchen das Erstgespräch direkt über diesen Link. Profile
              ohne Terminlink können nicht freigeschaltet werden — du kannst ihn
              aber auch später nachreichen.
            </span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <p className={styles.eyebrow}>04 · Nachweise</p>
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

        <label className={styles.consent}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            required
          />
          <span>
            Ich möchte als Freelancer aufgenommen werden und bin damit
            einverstanden, dass XPORTAL meine Angaben und den Lebenslauf zur
            Prüfung speichert und mich dazu kontaktiert. Nach der Freigabe wird
            mein Profil im Portal sichtbar; der Lebenslauf wird Kunden nur
            gezeigt, wenn XPORTAL ihn zusätzlich dafür freigibt. Weitere
            Informationen im <Link href="/privacy">Datenschutzhinweis</Link>.
          </span>
        </label>

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
            disabled={disabled || !consent || cvStatus === "uploading"}
          >
            <span>
              {disabled ? "Wird gesendet …" : "Zur Prüfung einreichen"}
            </span>
            <span aria-hidden="true">→</span>
          </button>
          <span className={styles.actionsHint}>
            Kein Profil geht ohne unsere Freigabe live.
          </span>
        </div>
      </section>
    </form>
  );
}
