"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";

import { Card, cockpitStyles as styles } from "@/components/admin/Cockpit";
import { ProjectListEditor, type ProjectEditorClasses } from "@/components/profile/ProjectListEditor";
import { appPath } from "@/lib/app-path";
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from "@/lib/freelancer/avatar-limits";
import {
  LINK_KINDS,
  LINK_LABELS,
  MAX_LINKS,
  MAX_PROJECTS,
  PROJECT_LIMITS,
  type LinkKind,
  type ProfileLink,
  type ProfileProject,
} from "@/lib/profile/project-limits";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

const EDITOR_CLASSES: ProjectEditorClasses = {
  field: styles.field,
  input: styles.input,
  textarea: styles.textarea,
  select: styles.select,
  button: styles.button,
  buttonPrimary: styles.buttonPrimary,
  buttonDanger: styles.buttonDanger,
  textLink: styles.textLink,
  note: styles.cardNote,
};

type Feedback = { tone: "error" | "success"; text: string } | null;

function useSave() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function request<T>(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T | null> {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(appPath(path), {
        method,
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
      if (!response.ok) {
        setFeedback({ tone: "error", text: payload.error ?? `Fehler ${response.status}.` });
        return null;
      }
      return payload;
    } catch {
      setFeedback({ tone: "error", text: "Die Verbindung ist abgebrochen." });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function send(path: string, method: "PUT" | "PATCH" | "DELETE", body: unknown, success: string): Promise<boolean> {
    if (!(await request(path, method, body))) return false;
    setFeedback({ tone: "success", text: success });
    startTransition(() => router.refresh());
    return true;
  }

  const report = (text: string) => setFeedback({ tone: "error", text });

  return { busy, feedback, send, request, report };
}

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return feedback.tone === "error" ? (
    <p className={styles.error} role="alert">{feedback.text}</p>
  ) : (
    <p className={styles.success} role="status">{feedback.text}</p>
  );
}

function TextField({
  label,
  value,
  onChange,
  max,
  placeholder,
  type = "text",
}: {
  label: ReactNode;
  value: string | null;
  onChange: (value: string | null) => void;
  max?: number;
  placeholder?: string;
  type?: "text" | "url" | "month";
}) {
  return (
    <label className={styles.field}>
      {label}
      <input
        className={styles.input}
        type={type}
        value={value ?? ""}
        maxLength={max}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value.trim() ? event.target.value : null)}
      />
    </label>
  );
}

/**
 * Der Editor auf der Pflegeseite eines Profils. Jeder Abschnitt speichert
 * für sich; danach lädt die Seite neu und die Vorschau links zeigt den Stand.
 */
export function ProfileEditor({
  profileId,
  initialProjects,
  initialLinks,
  initialReferences,
  status,
  projectsAvailable,
  referencesPublic,
  hasPhoto,
}: {
  profileId: string;
  initialProjects: ProfileProject[];
  initialLinks: ProfileLink[];
  initialReferences: string | null;
  status: string;
  projectsAvailable: boolean;
  referencesPublic: boolean;
  hasPhoto: boolean;
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [links, setLinks] = useState(initialLinks);
  const [references, setReferences] = useState(initialReferences ?? "");
  const projectSave = useSave();
  const linkSave = useSave();
  const referenceSave = useSave();
  const statusSave = useSave();
  const photoSave = useSave();
  const [photoConsent, setPhotoConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const base = `/api/admin/freelancer-profiles/${profileId}`;

  // Ticket holen, direkt zu Storage laden, dann mit Einwilligung hinterlegen.
  async function uploadPhoto(file: File) {
    if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type) || file.size > AVATAR_MAX_BYTES) {
      photoSave.report("Erlaubt sind JPEG, PNG oder WebP bis 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const ticket = await photoSave.request<{ bucket: string; path: string; uploadToken: string; pathToken: string }>(`${base}/photo`, "POST", {
        mimeType: file.type,
        sizeBytes: file.size,
      });
      if (!ticket) return;
      const { error } = await getBrowserSupabaseClient()
        .storage.from(ticket.bucket)
        .uploadToSignedUrl(ticket.path, ticket.uploadToken, file, { contentType: file.type });
      if (error) {
        photoSave.report("Der Upload ist fehlgeschlagen. Bitte erneut versuchen.");
        return;
      }
      if (await photoSave.send(`${base}/photo`, "PUT", { path: ticket.path, token: ticket.pathToken, consent: photoConsent }, "Foto gespeichert.")) {
        setPhotoConsent(false);
      }
    } finally {
      setUploading(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  return (
    <>
      <Card title={`Referenzprojekte (${projects.length} von ${MAX_PROJECTS})`}>
        <div className={styles.cardBody} style={{ display: "grid", gap: 10 }}>
          {projectsAvailable ? null : (
            <p className={styles.error}>Die Migration 20261006090000_referenzprojekte fehlt noch; Speichern geht erst danach.</p>
          )}
          <ProjectListEditor projects={projects} onChange={setProjects} mode="admin" classes={EDITOR_CLASSES} />
          <div>
            <button
              type="button"
              className={styles.buttonPrimary}
              disabled={projectSave.busy || !projectsAvailable}
              onClick={() => void projectSave.send(`${base}/projects`, "PUT", { projects }, "Projekte gespeichert.")}
            >
              Projekte speichern
            </button>
          </div>
          <FeedbackLine feedback={projectSave.feedback} />
        </div>
      </Card>

      <Card title={`Links (${links.length} von ${MAX_LINKS})`}>
        <div className={styles.cardBody} style={{ display: "grid", gap: 8 }}>
          {links.map((link, index) => (
            <div key={index} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "end" }}>
              <label className={styles.field}>
                Art
                <select
                  className={styles.select}
                  value={link.kind}
                  onChange={(event) =>
                    setLinks((current) => current.map((entry, position) => (position === index ? { ...entry, kind: event.target.value as LinkKind } : entry)))
                  }
                >
                  {LINK_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {LINK_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </label>
              <TextField
                label="Adresse (https)"
                type="url"
                value={link.url}
                max={PROJECT_LIMITS.url}
                onChange={(value) => setLinks((current) => current.map((entry, position) => (position === index ? { ...entry, url: value ?? "" } : entry)))}
              />
              <button type="button" className={styles.buttonDanger} onClick={() => setLinks((current) => current.filter((_, position) => position !== index))}>
                Entfernen
              </button>
            </div>
          ))}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className={styles.button}
              disabled={links.length >= MAX_LINKS}
              onClick={() => setLinks((current) => [...current, { kind: "linkedin", url: "" }])}
            >
              Link hinzufügen
            </button>
            <button
              type="button"
              className={styles.buttonPrimary}
              disabled={linkSave.busy || !projectsAvailable}
              onClick={() => void linkSave.send(base, "PATCH", { links: links.filter((link) => link.url.trim()) }, "Links gespeichert.")}
            >
              Links speichern
            </button>
          </div>
          <FeedbackLine feedback={linkSave.feedback} />
        </div>
      </Card>

      <Card title="Foto">
        <div className={styles.cardBody} style={{ display: "grid", gap: 8 }}>
          <p className={styles.cardNote}>
            {hasPhoto ? "Das Profil hat ein Foto (links in der Vorschau). " : "Noch kein Foto; Karte und Profil zeigen das Monogramm. "}
            Nur ein Foto, das die Person selbst geschickt hat, nie eines von LinkedIn oder aus der Recherche.
          </p>
          <label style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <input type="checkbox" checked={photoConsent} onChange={(event) => setPhotoConsent(event.target.checked)} />
            <span>Die Person hat eingewilligt, dass dieses Foto im Profil erscheint. Das wird mit dem Upload protokolliert.</span>
          </label>
          <input
            ref={photoInput}
            type="file"
            hidden
            accept={AVATAR_MIME_TYPES.join(",")}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadPhoto(file);
            }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className={styles.buttonPrimary}
              disabled={!photoConsent || uploading || photoSave.busy}
              onClick={() => photoInput.current?.click()}
            >
              {uploading ? "Wird hochgeladen …" : hasPhoto ? "Foto ersetzen" : "Foto hochladen"}
            </button>
            {hasPhoto ? (
              <button
                type="button"
                className={styles.buttonDanger}
                disabled={uploading || photoSave.busy}
                onClick={() => {
                  if (window.confirm("Foto entfernen? Karte und Profil zeigen dann wieder das Monogramm.")) {
                    void photoSave.send(`${base}/photo`, "DELETE", undefined, "Foto entfernt.");
                  }
                }}
              >
                Foto entfernen
              </button>
            ) : null}
          </div>
          <FeedbackLine feedback={photoSave.feedback} />
        </div>
      </Card>

      <Card title="Referenznotiz">
        <div className={styles.cardBody} style={{ display: "grid", gap: 8 }}>
          <textarea className={styles.textarea} maxLength={2000} value={references} onChange={(event) => setReferences(event.target.value)} />
          <p className={styles.cardNote}>
            {referencesPublic
              ? "Öffentlich sichtbar auf Karte und Profil."
              : "Noch nicht öffentlich: Sichtbar erst mit PROFILE_REFERENCES_VISIBLE=true, nachdem alle Notizen auf Kundennamen geprüft sind."}
          </p>
          <div>
            <button
              type="button"
              className={styles.buttonPrimary}
              disabled={referenceSave.busy}
              onClick={() => void referenceSave.send(base, "PATCH", { referencesSummary: references }, "Notiz gespeichert.")}
            >
              Notiz speichern
            </button>
          </div>
          <FeedbackLine feedback={referenceSave.feedback} />
        </div>
      </Card>

      <Card title="Sichtbarkeit">
        <div className={styles.cardBody} style={{ display: "grid", gap: 8 }}>
          <p className={styles.cardNote}>
            {status === "active"
              ? "Das Profil erscheint in Suche, Shortcuts und unter seinem Link."
              : "Das Profil ist pausiert: nicht in der Suche, der Link zeigt „nicht verfügbar“."}
          </p>
          <div>
            {status === "active" ? (
              <button
                type="button"
                className={styles.buttonDanger}
                disabled={statusSave.busy}
                onClick={() => {
                  if (window.confirm("Profil pausieren? Es verschwindet aus Suche und Shortcuts, bis es wieder aktiviert wird.")) {
                    void statusSave.send(base, "PATCH", { status: "paused" }, "Profil pausiert.");
                  }
                }}
              >
                Profil pausieren
              </button>
            ) : (
              <button type="button" className={styles.buttonPrimary} disabled={statusSave.busy} onClick={() => void statusSave.send(base, "PATCH", { status: "active" }, "Profil wieder aktiv.")}>
                Wieder aktivieren
              </button>
            )}
          </div>
          <FeedbackLine feedback={statusSave.feedback} />
        </div>
      </Card>
    </>
  );
}
