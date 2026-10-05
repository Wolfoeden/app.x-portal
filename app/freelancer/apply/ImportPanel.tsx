"use client";

import { useRef, useState } from "react";

import { appPath } from "@/lib/app-path";
import type { ProfileDraft } from "@/lib/freelancer/import/draft";

import styles from "./apply.module.css";

type Missing = { label: string; target: string };

/**
 * „Profil schneller ausfüllen“: Lebenslauf einlesen, GitHub ergänzen.
 *
 * Der Kasten holt nur Entwürfe; was davon ins Formular geht, entscheidet
 * `mergeDraft` im Formular (füllt Leeres, überschreibt nichts). Ein Fehler
 * hier blockiert nichts: Das Formular bleibt von Hand ausfüllbar.
 */
export function ImportPanel({
  cvImportAvailable,
  githubLogin,
  linkedinConnected,
  uploadCv,
  onDraft,
  takenCount,
  missing,
}: {
  /** Ohne KI-Schlüssel auf dem Server gibt es kein Einlesen. */
  cvImportAvailable: boolean;
  /** Der GitHub-Name des verknüpften Kontos, falls über GitHub angemeldet. */
  githubLogin: string | null;
  linkedinConnected: boolean;
  /** Der vorhandene Upload des Formulars; liefert die signierte Referenz. */
  uploadCv: (file: File) => Promise<{ storagePath: string; token: string } | null>;
  onDraft: (draft: ProfileDraft) => number;
  /** Wie viele Angaben bisher übernommen wurden; 0 heißt „noch kein Import“. */
  takenCount: number;
  missing: readonly Missing[];
}) {
  const [busy, setBusy] = useState<"cv" | "github" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [login, setLogin] = useState(githubLogin ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  async function requestDraft(path: string, body: unknown): Promise<ProfileDraft | null> {
    const response = await fetch(appPath(path), {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as { draft?: ProfileDraft; error?: string };
    if (!response.ok || !payload.draft) {
      setError(payload.error ?? "Das hat nicht geklappt. Bitte füllen Sie die Angaben selbst aus.");
      return null;
    }
    return payload.draft;
  }

  function report(draft: ProfileDraft, label: string) {
    const taken = onDraft(draft);
    setNote(
      taken
        ? `${taken} ${taken === 1 ? "Angabe" : "Angaben"} ${label} übernommen. Bitte prüfen Sie alles, bevor Sie absenden.`
        : `${label[0]!.toUpperCase()}${label.slice(1)} kam nichts Neues dazu; was schon ausgefüllt war, bleibt stehen.`,
    );
  }

  async function readCv(file: File) {
    setError(null);
    setNote(null);
    setBusy("cv");
    try {
      const uploaded = await uploadCv(file);
      if (!uploaded) return;
      const draft = await requestDraft("/api/freelancer-applications/cv-extract", uploaded);
      if (draft) report(draft, "aus dem Lebenslauf");
    } catch {
      setError("Keine Verbindung zum Server. Bitte erneut versuchen.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function readGithub() {
    setError(null);
    setNote(null);
    setBusy("github");
    try {
      const draft = await requestDraft("/api/freelancer-applications/github-import", { login: login.trim() || null });
      if (draft) report(draft, "aus GitHub");
    } catch {
      setError("Keine Verbindung zum Server. Bitte erneut versuchen.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.importPanel} aria-labelledby="apply-import-title">
      <p className={styles.eyebrow}>Optional · spart Tipparbeit</p>
      <h2 id="apply-import-title">Profil schneller ausfüllen</h2>
      <p className={styles.sectionHint}>
        Wir füllen leere Felder aus Ihrem Lebenslauf oder Ihrem GitHub-Profil vor. Was Sie schon
        eingetragen haben, bleibt stehen. Übernommene Angaben gelten als Ihre Angaben, nicht als geprüft.
      </p>
      {linkedinConnected ? (
        <p className={styles.importLinked}>Mit LinkedIn angemeldet: Name und E-Mail-Adresse sind übernommen.</p>
      ) : null}

      <div className={styles.importOptions}>
        {cvImportAvailable ? (
          <div className={styles.importOption}>
            <strong>Lebenslauf einlesen</strong>
            <span>PDF bis 10 MB. Er wird zugleich als Lebenslauf Ihrer Bewerbung hinterlegt.</span>
            <input
              ref={fileRef}
              className={styles.hiddenFile}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readCv(file);
              }}
            />
            <button type="button" className={styles.uploadButton} onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>
              {busy === "cv" ? "Wird eingelesen …" : "PDF auswählen"}
            </button>
          </div>
        ) : null}

        <div className={styles.importOption}>
          <strong>GitHub ergänzen</strong>
          <span>Öffentliche Repositorys: Sprachen und bis zu drei Projekte. Kein GitHub? Kein Nachteil.</span>
          <div className={styles.importRow}>
            <input
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              placeholder="GitHub-Nutzername"
              aria-label="GitHub-Nutzername"
              maxLength={120}
              autoComplete="off"
            />
            <button type="button" className={styles.uploadButton} onClick={() => void readGithub()} disabled={Boolean(busy) || !login.trim()}>
              {busy === "github" ? "Wird gelesen …" : "Übernehmen"}
            </button>
          </div>
        </div>
      </div>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {note ? <p className={styles.importNote} role="status">{note}</p> : null}

      {takenCount > 0 && missing.length ? (
        <div className={styles.importMissing}>
          <strong>Noch zu ergänzen</strong>
          <ul>
            {missing.map((item) => (
              <li key={item.target}><a href={`#${item.target}`}>{item.label}</a></li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
