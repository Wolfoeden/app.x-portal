"use client";

import { useRef, useState, type FormEvent } from "react";

import { TagInput } from "@/components/TagInput";
import { AuthDialog } from "@/components/chat/dialogs";
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

export function FreelancerAuthGate() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  return (
    <>
      <section className={styles.portalCard}>
        <p className={styles.eyebrow}>Geschützter Freelancer-Bereich</p>
        <h2>Anmelden, Profil verwalten und Zahlen sehen.</h2>
        <p>
          Für eine Bewerbung und das spätere Dashboard brauchst du ein
          dauerhaftes Konto. So können nur du und XPORTAL deine Profildaten
          ändern.
        </p>
        {notice ? (
          <p className={notice.tone === "error" ? styles.formError : styles.callout}>
            {notice.message}
          </p>
        ) : null}
        <button
          className={styles.submit}
          type="button"
          onClick={() => setDialogOpen(true)}
        >
          Anmelden oder Konto erstellen
        </button>
      </section>
      {dialogOpen ? (
        <AuthDialog
          initialMode="login"
          onClose={() => setDialogOpen(false)}
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
    title: "Deine Bewerbung ist eingegangen.",
    text: "XPORTAL prüft deine Angaben und deinen Lebenslauf. Du musst aktuell nichts weiter tun.",
  },
  in_review: {
    title: "Deine Bewerbung wird geprüft.",
    text: "Das Team sichtet dein Profil. Bei Rückfragen melden wir uns über deine Konto-E-Mail.",
  },
  approved: {
    title: "Deine Bewerbung ist freigegeben.",
    text: "Das veröffentlichte Profil wird vorbereitet. Lade die Seite in Kürze erneut, um dein Dashboard zu öffnen.",
  },
  rejected: {
    title: "Deine Bewerbung wurde noch nicht freigegeben.",
    text: "Du kannst deine Angaben überarbeiten und eine neue Bewerbung einreichen.",
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

export function FreelancerDashboard({
  initialProfile,
  metrics,
  preview = false,
}: {
  initialProfile: EditableFreelancerProfile;
  metrics: FreelancerMetrics;
  preview?: boolean;
}) {
  const [profile, setProfile] = useState(initialProfile);
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
        <h2>Dein Freelancer-Profil ist nicht mehr sichtbar.</h2>
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
              <input type="url" value={profile.bookingUrl} onChange={(event) => update("bookingUrl", event.target.value)} pattern="https://.*" required />
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
