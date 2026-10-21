"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createPortal } from "react-dom";

import { AuthDialog } from "@/components/chat/dialogs";
import { ShowcaseCard } from "@/components/chat/showcase-card";
import { TagInput } from "@/components/TagInput";
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
import {
  CURRENCIES,
  CV_MAX_BYTES,
  CV_MIME_TYPES,
  MAX_LANGUAGES,
  MAX_SKILLS,
  MIN_SELF_PUBLISH_SUMMARY,
  REFERRAL_PATTERN,
  WORK_MODES,
  type CvMimeType,
  type WorkMode,
} from "@/lib/freelancer/limits";
import { profilePath } from "@/lib/profile/profile-link";
import type { ProfileProject } from "@/lib/profile/project-limits";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

import {
  APPLY_DRAFT_KEY,
  availabilityFields,
  parseApplyDraft,
  serializeApplyDraft,
  type ApplyDraft,
  type AvailabilityChoice,
  type RateKind,
} from "./apply-draft";
import { ImportPanel } from "./ImportPanel";
import { InfoTip } from "./InfoTip";
import styles from "./apply.module.css";

type UploadedCv = {
  storagePath: string;
  token: string;
  originalFilename: string;
  mimeType: CvMimeType;
  sizeBytes: number;
};
type SubmitIssue = { path: string; message: string };
type Outcome = { status: "published"; profileId: string } | { status: "received"; reasons: string[] };

const CV_ACCEPT = "application/pdf,.pdf";
export const REFERRAL_STORAGE_KEY = "xportal.apply-referral.v1";
const REFERRAL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Die Nische zuerst (KI-Freelancer DACH); jede andere Kompetenz geht auch. */
const SKILL_SUGGESTIONS = ["KI-Agenten", "LLM", "RAG", "Python", "LangChain", "MLOps", "Azure OpenAI", "n8n"] as const;
const LANGUAGE_SUGGESTIONS = ["Deutsch", "Englisch"] as const;
const WORK_MODE_LABEL: Record<WorkMode, string> = { remote: "Remote", hybrid: "Hybrid", on_site: "Vor Ort" };

const tagClasses = {
  field: `${styles.field} ${styles.full}`,
  tagBox: styles.tagBox,
  tag: styles.tag,
  hint: styles.hint,
  optional: styles.optional,
  suggestions: styles.suggestions,
};

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

const noSubscription = () => () => undefined;
function storedDraft(): string | null {
  try {
    return window.localStorage.getItem(APPLY_DRAFT_KEY);
  } catch {
    return null;
  }
}
function forgetDraft() {
  try {
    window.localStorage.removeItem(APPLY_DRAFT_KEY);
  } catch {
    // Ohne Speicher gibt es nichts zu vergessen.
  }
}

type ApplyFormProps = {
  cvImportAvailable?: boolean;
  githubLogin?: string | null;
  linkedinConnected?: boolean;
  accountEmail?: string;
  accountName?: string | null;
  extrasAvailable?: boolean;
  referral?: string | null;
  inviteToken?: string | null;
  /** Abgemeldet: Das Formular ist da, das Konto entsteht beim Absenden. */
  guest?: boolean;
  /** Vor Migration 20261021120000 bleibt der Lebenslauf Pflicht. */
  cvRequired?: boolean;
  /** Development-only local walkthrough; never enabled on production routes. */
  previewMode?: boolean;
};

/**
 * Das Bewerbungsformular. Ein gemerkter Entwurf (apply-draft.ts) füllt es
 * vor; kommt die Person angemeldet zurück, geht er ab. Der Entwurf wird erst
 * im Browser gelesen, damit Server und erste Darstellung übereinstimmen.
 */
export function ApplyForm(props: ApplyFormProps) {
  const raw = useSyncExternalStore(noSubscription, storedDraft, () => null);
  const restored = props.previewMode ? null : parseApplyDraft(raw);
  return <ApplyFormFields key={restored ? "restored" : "empty"} {...props} restored={restored} />;
}

function ApplyFormFields({
  accountEmail = "",
  accountName = null,
  inviteToken = null,
  referral = null,
  extrasAvailable = false,
  cvImportAvailable = false,
  githubLogin = null,
  linkedinConnected = false,
  guest = false,
  cvRequired = false,
  previewMode = false,
  restored,
}: ApplyFormProps & { restored: ApplyDraft | null }) {
  const [source] = useState<string | null>(() => referral ?? (typeof window === "undefined" ? null : rememberedReferral()));
  const [fullName, setFullName] = useState(restored?.fullName ?? accountName ?? "");
  const [roleTitle, setRoleTitle] = useState(restored?.roleTitle ?? "");
  const [rateKind, setRateKind] = useState<RateKind>(restored?.rateKind ?? "daily");
  const [rate, setRate] = useState(restored?.rate ?? "");
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>(restored?.currency ?? "EUR");
  const [skills, setSkills] = useState<string[]>(restored?.skills ?? []);
  const [languages, setLanguages] = useState<string[]>(restored?.languages ?? []);
  const [workModes, setWorkModes] = useState<WorkMode[]>(restored?.workModes.length ? restored.workModes : ["remote"]);
  const [availability, setAvailability] = useState<AvailabilityChoice>(restored?.availability ?? "now");
  const [availabilityFrom, setAvailabilityFrom] = useState(restored?.availabilityFrom ?? "");
  const [locationText, setLocationText] = useState(restored?.locationText ?? "");
  const [experienceSummary, setExperienceSummary] = useState(restored?.experienceSummary ?? "");
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [projects, setProjects] = useState<ProfileProject[]>([]);
  const [provenance, setProvenance] = useState<ImportProvenance>(EMPTY_PROVENANCE);
  const [cv, setCv] = useState<UploadedCv | null>(null);
  const [cvStatus, setCvStatus] = useState<"idle" | "uploading" | "analyzing">("idle");
  const [cvError, setCvError] = useState<string | null>(null);
  const [cvNote, setCvNote] = useState<string | null>(null);
  const [consent, setConsent] = useState(restored?.consent ?? false);
  const [consentSearchIndex, setConsentSearchIndex] = useState(restored?.consentSearchIndex ?? false);
  const [consentMarketStats, setConsentMarketStats] = useState(restored?.consentMarketStats ?? false);
  const [honeypot, setHoneypot] = useState("");
  const [confirmShort, setConfirmShort] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<"editing" | "submitting" | "done">("editing");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [issues, setIssues] = useState<SubmitIssue[]>([]);
  const [previewAt] = useState(() => new Date());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resumed = useRef(false);

  const { availabilityStatus, availabilityFrom: availableFrom } = availabilityFields(availability, availabilityFrom);
  const seeking = rateKind === "monthly" ? "employment" : "projects";
  const summaryShort = experienceSummary.trim().length < MIN_SELF_PUBLISH_SUMMARY;

  function draftTarget(): DraftTarget {
    return { roleTitle, experienceSummary, locationText, skills, languages, qualifications, industries, projects };
  }

  function currentDraft(): ApplyDraft {
    return { fullName, roleTitle, rateKind, rate, currency, skills, languages, workModes, availability, availabilityFrom, locationText, experienceSummary, consent, consentSearchIndex, consentMarketStats };
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
        setCvNote("Lebenslauf hochgeladen. Die automatische Auswertung ist gerade nicht verfügbar.");
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
        setCvNote("Lebenslauf gespeichert. Die automatische Auswertung hat nicht geklappt; bitte die Angaben selbst ergänzen.");
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

  /** Was vor dem Absenden fehlt, als ein Satz; sonst `null`. */
  function missing(): string | null {
    if (fullName.trim().length < 2) return "Bitte Ihren Namen angeben.";
    if (roleTitle.trim().length < 2) return "Bitte Ihre Rolle angeben, etwa „KI-Engineer (LLM, RAG)“.";
    if (!skills.length) return "Bitte mindestens eine Kompetenz angeben.";
    if (!languages.length) return "Bitte mindestens eine Sprache angeben.";
    if (!rate.trim()) return "Bitte Monatsgehalt, Stunden- oder Tagessatz angeben.";
    if (!workModes.length) return "Bitte mindestens eine Arbeitsform wählen.";
    if (availability === "from" && !availabilityFrom) return "Bitte das Datum angeben, ab dem Sie verfügbar sind.";
    if (cvRequired && !guest && !cv) return "Bitte Ihren Lebenslauf als PDF hochladen.";
    if (!consent) return "Bitte den AGB zustimmen.";
    return null;
  }

  async function submitApplication(acceptShortSummary: boolean) {
    setFormError(null);
    setIssues([]);
    const problem = missing();
    if (problem) return setFormError(problem);
    if (summaryShort && !acceptShortSummary) {
      setConfirmShort(true);
      return;
    }
    setConfirmShort(false);

    // Abgemeldet: Angaben merken, dann das Konto. Nach der Rückkehr schickt
    // das Formular sie ab.
    if (guest) {
      try {
        window.localStorage.setItem(APPLY_DRAFT_KEY, serializeApplyDraft(currentDraft()));
      } catch {
        // Ohne Speicher muss man nach der Anmeldung neu ausfüllen.
      }
      setAuthOpen(true);
      return;
    }

    setSubmitState("submitting");
    const filledProjects = extrasAvailable ? projects.filter((project) => project.title.trim()) : [];
    if (previewMode) {
      setOutcome(summaryShort ? { status: "received", reasons: ["„Über mich“ ist noch sehr kurz."] } : { status: "published", profileId: "vorschau" });
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
          workModes,
          monthlySalary: rateKind === "monthly" ? rate : "",
          hourlyRate: rateKind === "hourly" ? rate : "",
          dayRate: rateKind === "daily" ? rate : "",
          currency,
          availabilityStatus,
          availabilityFrom: availableFrom,
          bookingUrl: "",
          seeking,
          referral: source,
          applicantNote: "",
          capacityDaysPerWeek: "",
          desiredProjects: "",
          importProvenance: finalProvenance(provenance, { ...draftTarget(), projects: filledProjects }),
          cv,
          projects: filledProjects,
          consent,
          consentSearchIndex,
          consentMarketStats,
          inviteToken,
          website: honeypot,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<Outcome> & { error?: string; issues?: SubmitIssue[]; profileId?: string; reasons?: string[] };
      if (response.ok) {
        forgetDraft();
        setOutcome(payload.status === "published" && payload.profileId ? { status: "published", profileId: payload.profileId } : { status: "received", reasons: payload.reasons ?? [] });
        setSubmitState("done");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setFormError(payload.error ?? "Die Bewerbung konnte nicht gespeichert werden.");
      setIssues(payload.issues ?? []);
      setSubmitState("editing");
    } catch {
      setFormError("Keine Verbindung zum Server. Bitte erneut versuchen.");
      setSubmitState("editing");
    }
  }

  // Zurück von der Anmeldung: Der Entwurf war schon abgeschickt, nur das
  // Konto fehlte.
  const resume = useEffectEvent(() => {
    if (resumed.current || guest || !restored) return;
    resumed.current = true;
    void submitApplication(true);
  });
  useEffect(() => {
    resume();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitApplication(false);
  }

  if (submitState === "done" && outcome?.status === "published") return (
    <div className={styles.success} role="status">
      <p className={styles.eyebrow}>Online</p>
      <h2>Ihr Profil ist sichtbar.</h2>
      <p>Unternehmen finden es ab sofort im Matching, ohne Ihre E-Mail-Adresse und Telefonnummer. Ihre Angaben stehen dort als Angaben laut Freelancer; einzelne gleicht XPORTAL später mit Nachweisen ab.</p>
      <p>Passt eine Anfrage, melden wir uns per E-Mail. Eine Bestätigung ist unterwegs.</p>
      <p className={styles.successLinks}>
        <Link href={profilePath(outcome.profileId)}>Profil ansehen</Link>
        <a href={appPath("/bewerber-portal/apply")}>Profil bearbeiten</a>
      </p>
    </div>
  );

  if (submitState === "done") return (
    <div className={styles.success} role="status">
      <p className={styles.eyebrow}>Eingegangen</p>
      <h2>Ihr Profil sieht sich jetzt unser Team an.</h2>
      {outcome?.status === "received" && outcome.reasons.length ? (
        <>
          <p>Vor der Veröffentlichung schauen wir drauf, weil:</p>
          <ul>{outcome.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        </>
      ) : null}
      <p>Das dauert in der Regel ein bis zwei Werktage. Fehlt etwas, fragen wir per E-Mail nach.</p>
    </div>
  );

  const preview = applicationPreviewProfile({
    fullName,
    roleTitle,
    skills,
    locationText,
    workModes,
    monthlySalary: rateKind === "monthly" ? rate : "",
    hourlyRate: rateKind === "hourly" ? rate : "",
    dayRate: rateKind === "daily" ? rate : "",
    currency,
    availabilityStatus,
    availabilityFrom: availableFrom,
    bookingUrl: "",
    seeking,
    experienceSummary,
    projects,
  }, previewAt);

  return (
    <form id="profil-formular" className={`${styles.form} ${styles.simpleForm}`} onSubmit={handleSubmit} noValidate>
      <section className={`${styles.section} ${styles.intakeSection}`}>
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>Profil anlegen</p><h2>In drei Minuten online.</h2></div>
          <InfoTip label="Hinweis zu den Pflichtangaben">Name, Rolle, eine Kompetenz, eine Sprache und Ihr Honorar sind Pflicht. Mit ein, zwei Sätzen „Über mich“ ist das Profil sofort sichtbar.</InfoTip>
        </div>

        <div className={styles.grid}>
          <label className={`${styles.field} ${styles.full}`}><span>Vor- und Nachname</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" minLength={2} maxLength={120} required /></label>
          <label className={`${styles.field} ${styles.full}`}><span>Rolle</span><input value={roleTitle} onChange={(event) => setRoleTitle(event.target.value)} maxLength={160} placeholder="z. B. KI-Engineer (LLM, RAG)" required /></label>
          <TagInput label="Kompetenzen" placeholder="z. B. RAG" values={skills} max={MAX_SKILLS} required suggestions={SKILL_SUGGESTIONS} onChange={setSkills} classes={tagClasses} />
          <TagInput label="Sprachen" placeholder="z. B. Deutsch" values={languages} max={MAX_LANGUAGES} required suggestions={LANGUAGE_SUGGESTIONS} onChange={setLanguages} classes={tagClasses} />
          <div className={`${styles.rateComposer} ${styles.full}`}>
            <label className={styles.field}><span>Vergütungsart</span><select value={rateKind} onChange={(event) => setRateKind(event.target.value as RateKind)}><option value="monthly">Monatsgehalt</option><option value="hourly">Stundensatz</option><option value="daily">Tagessatz</option></select></label>
            <label className={styles.field}><span>{rateKind === "monthly" ? "Monatsgehalt brutto" : rateKind === "hourly" ? "Stundensatz netto" : "Tagessatz netto"}</span><input value={rate} onChange={(event) => setRate(event.target.value)} type="number" inputMode="decimal" min={1} step="0.01" placeholder={rateKind === "monthly" ? "6500" : rateKind === "hourly" ? "95" : "760"} required /></label>
            <label className={styles.field}><span>Währung</span><select value={currency} onChange={(event) => setCurrency(event.target.value as (typeof CURRENCIES)[number])}>{CURRENCIES.map((code) => <option key={code}>{code}</option>)}</select></label>
          </div>
          <div className={`${styles.availabilityRow} ${styles.full}`}>
            <label className={styles.field}><span>Verfügbar</span><select value={availability} onChange={(event) => setAvailability(event.target.value as AvailabilityChoice)}><option value="now">Sofort</option><option value="from">Ab Datum</option><option value="limited">Teilweise</option></select></label>
            {availability === "from" ? <label className={styles.field}><span>Ab</span><input type="date" value={availabilityFrom} onChange={(event) => setAvailabilityFrom(event.target.value)} required /></label> : null}
            <label className={styles.field}><span>Ort <span className={styles.optional}>· optional</span></span><input value={locationText} onChange={(event) => setLocationText(event.target.value)} maxLength={160} autoComplete="address-level2" placeholder="z. B. München" /></label>
          </div>
          <fieldset className={`${styles.full} ${styles.plainFieldset}`}>
            <legend>Arbeitsform</legend>
            <div className={styles.checks}>
              {WORK_MODES.map((mode) => (
                <label key={mode} className={styles.check}>
                  <input type="checkbox" checked={workModes.includes(mode)} onChange={(event) => setWorkModes((current) => event.target.checked ? [...current, mode] : current.filter((entry) => entry !== mode))} />
                  {WORK_MODE_LABEL[mode]}
                </label>
              ))}
            </div>
          </fieldset>

          {guest ? (
            <p className={`${styles.hint} ${styles.full}`}>Ein Lebenslauf ist nicht nötig. Referenzprojekte und GitHub ergänzen Sie nach der Anmeldung im Dashboard.</p>
          ) : (
            <div className={`${styles.cvDrop} ${styles.full}`} data-ready={Boolean(cv)}>
              <input ref={fileInputRef} className={styles.hiddenFile} type="file" accept={CV_ACCEPT} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadCv(file); }} />
              <div><strong>Lebenslauf{cvRequired ? null : <span className={styles.optional}> · optional</span>}</strong><span>PDF bis 10 MB · füllt die Angaben oben vor</span></div>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={cvStatus !== "idle"}>{cvStatus === "uploading" ? "Wird hochgeladen …" : cvStatus === "analyzing" ? "KI wertet aus …" : cv ? "Andere PDF wählen" : "PDF hochladen"}</button>
              {cv ? <p><strong>{cv.originalFilename}</strong> · {formatFileSize(cv.sizeBytes)}</p> : null}
              {cvError ? <p className={styles.error} role="alert">{cvError}</p> : null}
              {cvNote ? <p className={styles.importNote} role="status">{cvNote}</p> : null}
            </div>
          )}
        </div>

        {guest ? null : (
          <div className={styles.connectionSection}>
            <div className={styles.connectionHeading}><div><strong>Profile verbinden</strong><span>Freiwillig ergänzen</span></div><InfoTip label="Hinweis zu verbundenen Profilen">GitHub übernimmt öffentliche Projekte und Technologien. LinkedIn bestätigt Ihre Identität; Angaben daraus tragen Sie bitte selbst ein.</InfoTip></div>
            <ImportPanel githubLogin={githubLogin} linkedinConnected={linkedinConnected} onDraft={applyDraft} />
          </div>
        )}

        <label className={`${styles.field} ${styles.aboutField}`}>
          <span>Über mich</span>
          <textarea value={experienceSummary} onChange={(event) => setExperienceSummary(event.target.value)} maxLength={2000} placeholder="Ein, zwei Sätze: woran Sie arbeiten und wofür Unternehmen Sie holen." />
          <span className={styles.hint}>{summaryShort ? `Ab ${MIN_SELF_PUBLISH_SUMMARY} Zeichen ist Ihr Profil sofort sichtbar · ${experienceSummary.trim().length}/${MIN_SELF_PUBLISH_SUMMARY}` : "Reicht für die sofortige Veröffentlichung."}</span>
        </label>
      </section>

      <aside className={`${styles.preview} ${styles.simplePreview}`} aria-labelledby="apply-preview-title">
        <p className={styles.eyebrow}>Live-Vorschau</p><h2 id="apply-preview-title">So sehen Unternehmen Ihr Profil</h2>
        <ShowcaseCard href={null} now={previewAt} profile={preview} />
        <div className={styles.evidenceSummary}><strong>{skills.length + industries.length + projects.length}</strong><span>Angaben für den Abgleich mit Projektanfragen</span></div>
        <p className={styles.hint}>Ohne E-Mail-Adresse und Telefonnummer. Angaben stehen als Angaben laut Freelancer, bis XPORTAL sie mit einem Nachweis abgleicht.</p>
      </aside>

      <section className={`${styles.section} ${styles.submitSection}`}>
        <div className={styles.honeypot} aria-hidden="true"><label>Website<input value={honeypot} onChange={(event) => setHoneypot(event.target.value)} tabIndex={-1} autoComplete="off" /></label></div>
        <label className={styles.consent}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>Ich stimme den <Link href="/terms">AGB</Link> zu. Mein Profil ist für Unternehmen im Matching sichtbar.</span></label>
        <label className={styles.consent}><input type="checkbox" checked={consentSearchIndex} onChange={(event) => setConsentSearchIndex(event.target.checked)} /><span>Mein Profil darf in Suchmaschinen wie Google erscheinen, ohne Kontaktdaten. <span className={styles.optional}>Freiwillig</span></span></label>
        <label className={styles.consent}><input type="checkbox" checked={consentMarketStats} onChange={(event) => setConsentMarketStats(event.target.checked)} /><span>Honorar, Kompetenzen und Verfügbarkeit dürfen anonymisiert in Marktstatistiken einfließen, nie einzeln erkennbar. <span className={styles.optional}>Freiwillig</span></span></label>
        <p className={styles.consentNote}>Einen Lebenslauf sehen Auftraggeber nur nach gesonderter Freigabe. Beide freiwilligen Häkchen können Sie jederzeit widerrufen. Näheres im <Link href="/privacy">Datenschutzhinweis</Link>.</p>
        {confirmShort ? <div className={styles.blankConfirm} role="alertdialog" aria-labelledby="short-summary-title"><strong id="short-summary-title">„Über mich“ ist noch sehr kurz.</strong><p>Mit ein, zwei Sätzen ist Ihr Profil sofort sichtbar. Ohne sieht es sich erst unser Team an.</p><div><button type="button" onClick={() => setConfirmShort(false)}>Zurück und ergänzen</button><button type="button" className={styles.submit} onClick={() => void submitApplication(true)}>Trotzdem senden</button></div></div> : null}
        {formError ? <div className={styles.formError} role="alert">{formError}{issues.length ? <ul>{issues.slice(0, 8).map((issue) => <li key={`${issue.path}:${issue.message}`}>{issue.message}</li>)}</ul> : null}</div> : null}
        {authNotice ? <p className={styles.importNote} role="status">{authNotice}</p> : null}
        <div className={styles.actions}><button type="submit" className={styles.submit} disabled={submitState === "submitting" || cvStatus !== "idle"}>{submitState === "submitting" ? "Wird gesendet …" : "Profil veröffentlichen"}<span aria-hidden="true">→</span></button><span className={styles.actionsHint}>{guest ? "Danach bestätigen Sie Ihr Konto mit Google, LinkedIn oder E-Mail. Ihre Angaben bleiben erhalten." : "Vollständige Profile sind sofort sichtbar."}</span></div>
      </section>
      {authOpen ? createPortal(
        <AuthDialog
          initialMode="register"
          audience="freelancer"
          // Zurück zum Formular; dort geht der gemerkte Entwurf ab.
          destination="/bewerber-portal/apply"
          onClose={() => setAuthOpen(false)}
          onAuthenticated={() => window.location.reload()}
          showToast={(message) => setAuthNotice(message)}
        />,
        document.body,
      ) : null}
    </form>
  );
}
