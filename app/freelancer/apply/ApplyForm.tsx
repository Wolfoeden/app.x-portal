"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { ShowcaseCard } from "@/components/chat/showcase-card";
import { appPath } from "@/lib/app-path";
import { applicationPreviewProfile } from "@/lib/freelancer/application-preview";
import {
  addProvenance,
  EMPTY_PROVENANCE,
  finalProvenance,
  mergeDraft,
  type DraftTarget,
  type ImportProvenance,
  type ProfileDraft,
} from "@/lib/freelancer/import/draft";
import { CURRENCIES, CV_MAX_BYTES, CV_MIME_TYPES, REFERRAL_PATTERN, type CvMimeType } from "@/lib/freelancer/limits";
import type { ProfileProject } from "@/lib/profile/project-limits";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

import { ImportPanel } from "./ImportPanel";
import styles from "./apply.module.css";

type UploadedCv = {
  storagePath: string;
  token: string;
  originalFilename: string;
  mimeType: CvMimeType;
  sizeBytes: number;
};
type SubmitIssue = { path: string; message: string };
type RateKind = "monthly" | "hourly" | "daily";

const CV_ACCEPT = "application/pdf,.pdf";
export const REFERRAL_STORAGE_KEY = "xportal.apply-referral.v1";
const REFERRAL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function rememberedReferral(): string | null {
  try {
    const raw = window.localStorage.getItem(REFERRAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { referral?: unknown; at?: unknown };
    return typeof parsed.referral === "string" && REFERRAL_PATTERN.test(parsed.referral) && typeof parsed.at === "number" && Date.now() - parsed.at < REFERRAL_MAX_AGE_MS ? parsed.referral : null;
  } catch {
    return null;
  }
}

function formatFileSize(bytes: number) {
  return `${Math.max(0.1, bytes / 1_048_576).toFixed(1)} MB`;
}

export function ApplyForm({
  accountEmail = "",
  accountName = null,
  inviteToken = null,
  referral = null,
  extrasAvailable = false,
  cvImportAvailable = false,
  githubLogin = null,
  linkedinConnected = false,
  previewMode = false,
}: {
  cvImportAvailable?: boolean;
  githubLogin?: string | null;
  linkedinConnected?: boolean;
  accountEmail?: string;
  accountName?: string | null;
  extrasAvailable?: boolean;
  referral?: string | null;
  inviteToken?: string | null;
  /** Development-only local walkthrough; never enabled on production routes. */
  previewMode?: boolean;
}) {
  const [source] = useState<string | null>(() => referral ?? (typeof window === "undefined" ? null : rememberedReferral()));
  const [fullName, setFullName] = useState(accountName ?? "");
  const [rateKind, setRateKind] = useState<RateKind>("daily");
  const [rate, setRate] = useState("");
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>("EUR");
  const [experienceSummary, setExperienceSummary] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [locationText, setLocationText] = useState("");
  const [projects, setProjects] = useState<ProfileProject[]>([]);
  const [provenance, setProvenance] = useState<ImportProvenance>(EMPTY_PROVENANCE);
  const [cv, setCv] = useState<UploadedCv | null>(null);
  const [cvStatus, setCvStatus] = useState<"idle" | "uploading" | "analyzing">("idle");
  const [cvError, setCvError] = useState<string | null>(null);
  const [cvNote, setCvNote] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [confirmBlank, setConfirmBlank] = useState(false);
  const [submitState, setSubmitState] = useState<"editing" | "submitting" | "done">("editing");
  const [formError, setFormError] = useState<string | null>(null);
  const [issues, setIssues] = useState<SubmitIssue[]>([]);
  const [previewAt] = useState(() => new Date());
  const fileInputRef = useRef<HTMLInputElement>(null);

  function draftTarget(): DraftTarget {
    return { roleTitle, experienceSummary, locationText, skills, languages, qualifications, industries, projects };
  }

  function applyDraft(draft: ProfileDraft): number {
    const { next, taken } = mergeDraft(draftTarget(), extrasAvailable ? draft : { ...draft, projects: [] });
    setRoleTitle(next.roleTitle);
    setExperienceSummary(next.experienceSummary);
    setLocationText(next.locationText);
    setSkills(next.skills);
    setLanguages(next.languages);
    setQualifications(next.qualifications);
    setIndustries(next.industries);
    setProjects(next.projects);
    setProvenance((current) => addProvenance(current, draft, taken));
    return taken.length;
  }

  async function uploadCv(file: File): Promise<UploadedCv | null> {
    setCvError(null);
    setCvNote(null);
    if (file.size > CV_MAX_BYTES) {
      setCvError("Die Datei ist größer als 10 MB.");
      return null;
    }
    if (!(CV_MIME_TYPES as readonly string[]).includes(file.type) || !/\.pdf$/iu.test(file.name)) {
      setCvError("Bitte eine PDF-Datei auswählen.");
      return null;
    }
    if (previewMode) {
      const uploaded: UploadedCv = {
        storagePath: "local-preview/cv.pdf",
        token: "0".repeat(64),
        originalFilename: file.name.slice(0, 255),
        mimeType: file.type as CvMimeType,
        sizeBytes: file.size,
      };
      setCv(uploaded);
      const taken = applyDraft({
        roleTitle: "Senior AI & Blockchain Developer",
        experienceSummary: "Ich entwickle nachvollziehbare KI-Automatisierungen und Blockchain-Anwendungen für Unternehmen.",
        locationText: "Remote",
        skills: ["AI Agents", "Blockchain", "TypeScript", "Automation"],
        languages: ["Deutsch", "Englisch"],
        qualifications: [],
        industries: ["Softwareentwicklung", "Finanztechnologie"],
        projects: [],
        source: "cv",
        importedAt: new Date().toISOString(),
      });
      setCvNote(`${taken} Profilangaben wurden lokal aus einem Beispiel-Lebenslauf vorbereitet. Es wurden keine Daten übertragen.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return uploaded;
    }
    setCvStatus("uploading");
    try {
      const ticketResponse = await fetch(appPath("/api/freelancer-applications/cv-upload"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
      });
      const ticket = (await ticketResponse.json()) as { bucket?: string; path?: string; uploadToken?: string; pathToken?: string; error?: string };
      if (!ticketResponse.ok || !ticket.path || !ticket.uploadToken || !ticket.pathToken) {
        setCvError(ticket.error ?? "Der Upload konnte nicht gestartet werden.");
        return null;
      }
      const { error } = await getBrowserSupabaseClient().storage.from(ticket.bucket ?? "freelancer-cvs").uploadToSignedUrl(ticket.path, ticket.uploadToken, file, { contentType: file.type });
      if (error) {
        setCvError("Der Upload ist fehlgeschlagen. Bitte erneut versuchen.");
        return null;
      }
      const uploaded: UploadedCv = { storagePath: ticket.path, token: ticket.pathToken, originalFilename: file.name.slice(0, 255), mimeType: file.type as CvMimeType, sizeBytes: file.size };
      setCv(uploaded);
      if (!cvImportAvailable) {
        setCvNote("Lebenslauf hochgeladen. Die automatische Auswertung ist gerade nicht verfügbar; XPORTAL prüft ihn manuell.");
        return uploaded;
      }
      setCvStatus("analyzing");
      const response = await fetch(appPath("/api/freelancer-applications/cv-extract"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ storagePath: uploaded.storagePath, token: uploaded.token }),
      });
      const payload = (await response.json().catch(() => ({}))) as { draft?: ProfileDraft; error?: string };
      if (!response.ok || !payload.draft) {
        setCvNote("Lebenslauf gespeichert. Die automatische Auswertung hat nicht geklappt; XPORTAL prüft ihn manuell.");
        return uploaded;
      }
      const taken = applyDraft(payload.draft);
      setCvNote(`${taken} ${taken === 1 ? "Profilangabe wurde" : "Profilangaben wurden"} aus dem Lebenslauf vorbereitet. Bitte die Vorschau prüfen.`);
      return uploaded;
    } catch {
      setCvError("Keine Verbindung zum Server. Bitte erneut versuchen.");
      return null;
    } finally {
      setCvStatus("idle");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function submitApplication(allowBlankSummary: boolean) {
    setFormError(null);
    setIssues([]);
    if (!fullName.trim()) return setFormError("Bitte Ihren Namen angeben.");
    if (!rate.trim()) return setFormError("Bitte Monatsgehalt, Stunden- oder Tagessatz angeben.");
    if (!cv) return setFormError("Bitte Ihren Lebenslauf als PDF hochladen.");
    if (!consent) return setFormError("Bitte den AGB zustimmen.");
    if (!experienceSummary.trim() && !allowBlankSummary) {
      setConfirmBlank(true);
      return;
    }
    setConfirmBlank(false);
    setSubmitState("submitting");
    const filledProjects = extrasAvailable ? projects.filter((project) => project.title.trim()) : [];
    if (previewMode) {
      setSubmitState("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    try {
      const response = await fetch(appPath("/api/freelancer-applications"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          fullName,
          contactEmail: accountEmail,
          contactPhone: "",
          websiteUrl: "",
          roleTitle,
          experienceSummary,
          skills,
          languages,
          qualifications,
          industries,
          locationText,
          workModes: ["remote"],
          monthlySalary: rateKind === "monthly" ? rate : "",
          hourlyRate: rateKind === "hourly" ? rate : "",
          dayRate: rateKind === "daily" ? rate : "",
          currency,
          availabilityStatus: "unknown",
          availabilityFrom: "",
          bookingUrl: "",
          seeking: rateKind === "monthly" ? "employment" : "projects",
          referral: source,
          applicantNote: "",
          capacityDaysPerWeek: "",
          desiredProjects: "",
          importProvenance: finalProvenance(provenance, { ...draftTarget(), projects: filledProjects }),
          cv,
          projects: filledProjects,
          photo: null,
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
      const payload = (await response.json().catch(() => ({}))) as { error?: string; issues?: SubmitIssue[] };
      setFormError(payload.error ?? "Die Bewerbung konnte nicht gespeichert werden.");
      setIssues(payload.issues ?? []);
      setSubmitState("editing");
    } catch {
      setFormError("Keine Verbindung zum Server. Bitte erneut versuchen.");
      setSubmitState("editing");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitApplication(false);
  }

  if (submitState === "done") return (
    <div className={styles.success} role="status"><p className={styles.eyebrow}>Eingegangen</p><h2>Ihr Profil wird jetzt geprüft.</h2><p>Die aus Lebenslauf und verbundenen Quellen erstellten Angaben werden erst nach der Freigabe sichtbar.</p></div>
  );

  const preview = applicationPreviewProfile({
    fullName,
    roleTitle,
    skills,
    locationText,
    workModes: ["remote"],
    monthlySalary: rateKind === "monthly" ? rate : "",
    hourlyRate: rateKind === "hourly" ? rate : "",
    dayRate: rateKind === "daily" ? rate : "",
    currency,
    availabilityStatus: "unknown",
    availabilityFrom: "",
    bookingUrl: "",
    seeking: rateKind === "monthly" ? "employment" : "projects",
    experienceSummary,
    projects,
  }, previewAt);

  return (
    <form className={`${styles.form} ${styles.simpleForm}`} onSubmit={handleSubmit} noValidate>
      <section className={`${styles.section} ${styles.intakeSection}`}>
        <p className={styles.eyebrow}>Profil anlegen</p>
        <h2>Drei Pflichtangaben. Den Rest bereitet XPORTAL vor.</h2>
        <p className={styles.sectionHint}>Name, Vergütung und Lebenslauf sind Pflicht. GitHub und LinkedIn verbessern die Datengrundlage, sind aber freiwillig.</p>

        <div className={styles.grid}>
          <label className={`${styles.field} ${styles.full}`}><span>Vor- und Nachname</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" minLength={2} maxLength={120} required /></label>
          <div className={`${styles.rateComposer} ${styles.full}`}>
            <label className={styles.field}><span>Vergütungsart</span><select value={rateKind} onChange={(event) => setRateKind(event.target.value as RateKind)}><option value="monthly">Monatsgehalt</option><option value="hourly">Stundensatz</option><option value="daily">Tagessatz</option></select></label>
            <label className={styles.field}><span>{rateKind === "monthly" ? "Monatsgehalt brutto" : rateKind === "hourly" ? "Stundensatz netto" : "Tagessatz netto"}</span><input value={rate} onChange={(event) => setRate(event.target.value)} type="number" inputMode="decimal" min={1} step="0.01" placeholder={rateKind === "monthly" ? "6500" : rateKind === "hourly" ? "95" : "760"} required /></label>
            <label className={styles.field}><span>Währung</span><select value={currency} onChange={(event) => setCurrency(event.target.value as (typeof CURRENCIES)[number])}>{CURRENCIES.map((code) => <option key={code}>{code}</option>)}</select></label>
          </div>

          <div className={`${styles.cvDrop} ${styles.full}`} data-ready={Boolean(cv)}>
            <input ref={fileInputRef} className={styles.hiddenFile} type="file" accept={CV_ACCEPT} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadCv(file); }} />
            <div><strong>Lebenslauf</strong>{" "}<span>PDF bis 10 MB · wird für den Profilentwurf ausgewertet</span></div>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={cvStatus !== "idle"}>{cvStatus === "uploading" ? "Wird hochgeladen …" : cvStatus === "analyzing" ? "KI wertet aus …" : cv ? "Andere PDF wählen" : "PDF hochladen"}</button>
            {cv ? <p><strong>{cv.originalFilename}</strong> · {formatFileSize(cv.sizeBytes)}</p> : null}
            {cvError ? <p className={styles.error} role="alert">{cvError}</p> : null}
            {cvNote ? <p className={styles.importNote} role="status">{cvNote}</p> : null}
          </div>
        </div>

        <div className={styles.connectionSection}>
          <div><strong>Profile verbinden</strong>{" "}<span>freiwillig</span></div>
          <ImportPanel githubLogin={githubLogin} linkedinConnected={linkedinConnected} onDraft={applyDraft} />
        </div>

        <label className={`${styles.field} ${styles.aboutField}`}>
          <span>Über mich <span className={styles.optional}>· optional</span></span>
          <textarea value={experienceSummary} onChange={(event) => setExperienceSummary(event.target.value)} maxLength={2000} placeholder="Von der KI aus Ihrem CV vorbereitet – oder selbst schreiben." />
        </label>
      </section>

      <aside className={`${styles.preview} ${styles.simplePreview}`} aria-labelledby="apply-preview-title">
        <p className={styles.eyebrow}>Live-Vorschau</p><h2 id="apply-preview-title">So entsteht Ihr Profil</h2>
        <ShowcaseCard href={null} now={previewAt} profile={preview} />
        <div className={styles.evidenceSummary}><strong>{skills.length + industries.length + projects.length}</strong><span>strukturierte Angaben aus CV und verbundenen Quellen</span></div>
        <p className={styles.hint}>Arbeitgeber, Branchen und Projekte werden nur gezeigt, wenn sie im Lebenslauf oder einer verbundenen Quelle belegt sind.</p>
      </aside>

      <section className={`${styles.section} ${styles.submitSection}`}>
        <div className={styles.honeypot} aria-hidden="true"><label>Website<input value={honeypot} onChange={(event) => setHoneypot(event.target.value)} tabIndex={-1} autoComplete="off" /></label></div>
        <label className={styles.consent}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>Ich stimme den <Link href="/terms">AGB</Link> zu.</span></label>
        <p className={styles.consentNote}>XPORTAL verarbeitet den Lebenslauf zur Profilerstellung. Er wird Auftraggebern nur nach gesonderter Freigabe zugänglich. Näheres im <Link href="/privacy">Datenschutzhinweis</Link>.</p>
        {confirmBlank ? <div className={styles.blankConfirm} role="alertdialog" aria-labelledby="blank-summary-title"><strong id="blank-summary-title">Willst du „Über mich“ leer lassen?</strong><p>Das Profil kann gespeichert werden. Ein kurzer Text macht die Auswahl für Recruiter verständlicher.</p><div><button type="button" onClick={() => setConfirmBlank(false)}>Zurück und ergänzen</button><button type="button" className={styles.submit} onClick={() => void submitApplication(true)}>Ja, leer lassen</button></div></div> : null}
        {formError ? <div className={styles.formError} role="alert">{formError}{issues.length ? <ul>{issues.slice(0, 8).map((issue) => <li key={`${issue.path}:${issue.message}`}>{issue.message}</li>)}</ul> : null}</div> : null}
        <div className={styles.actions}><button type="submit" className={styles.submit} disabled={submitState === "submitting" || cvStatus !== "idle"}>{submitState === "submitting" ? "Wird gesendet …" : "Profil zur Sichtung senden"}<span aria-hidden="true">→</span></button><span className={styles.actionsHint}>Persönliche Prüfung vor Veröffentlichung.</span></div>
      </section>
    </form>
  );
}
