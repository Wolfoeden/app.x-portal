"use client";

import { useState } from "react";
import Image from "next/image";

import { appPath } from "@/lib/app-path";
import { connectOauthIdentity } from "@/lib/auth/browser";
import type { ProfileDraft } from "@/lib/freelancer/import/draft";

import styles from "./apply.module.css";
import { InfoTip } from "./InfoTip";

/** GitHub keeps the existing public-repository import; LinkedIn OIDC only confirms identity. */
export function ImportPanel({ githubLogin, linkedinConnected, onDraft }: {
  githubLogin: string | null;
  linkedinConnected: boolean;
  onDraft: (draft: ProfileDraft) => number;
}) {
  const [busy, setBusy] = useState<"github" | "linkedin" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function connect(provider: "github" | "linkedin") {
    setError(null);
    setBusy(provider);
    try {
      // Verbindet mit dem angemeldeten Konto, ohne je das Konto zu wechseln.
      await connectOauthIdentity(provider, "/bewerber-portal/apply");
    } catch {
      setBusy(null);
      setError("Die Verbindung konnte nicht hergestellt werden. Sie bleiben in Ihrem Konto angemeldet; bitte später erneut versuchen.");
    }
  }

  async function importGithub() {
    if (!githubLogin) return;
    setError(null);
    setNote(null);
    setBusy("github");
    try {
      const response = await fetch(appPath("/api/freelancer-applications/github-import"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ login: githubLogin }),
      });
      const payload = (await response.json().catch(() => ({}))) as { draft?: ProfileDraft; error?: string };
      if (!response.ok || !payload.draft) {
        setError(payload.error ?? "GitHub konnte nicht eingelesen werden.");
        return;
      }
      const taken = onDraft(payload.draft);
      setNote(taken ? `${taken} ${taken === 1 ? "Angabe" : "Angaben"} aus GitHub übernommen.` : "GitHub ist verbunden; es kamen keine neuen öffentlichen Angaben hinzu.");
    } catch {
      setError("Keine Verbindung zum Server. Bitte erneut versuchen.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.connectionGrid}>
      <div className={styles.connectionCard} data-connected={Boolean(githubLogin)}>
        <div className={styles.sourceHead}><Image src="/images/auth/github.png" alt="" width={28} height={28} /><div><strong>GitHub</strong><span>{githubLogin ? `Verbunden als @${githubLogin}` : "Öffentliche Projekte und Technologien übernehmen"}</span></div></div>
        {githubLogin ? (
          <button type="button" onClick={() => void importGithub()} disabled={Boolean(busy)}>{busy === "github" ? "Wird ausgewertet …" : "GitHub auswerten"}</button>
        ) : (
          <button type="button" onClick={() => void connect("github")} disabled={Boolean(busy)}>GitHub verbinden</button>
        )}
      </div>
      <div className={styles.connectionCard} data-connected={linkedinConnected}>
        <div className={styles.sourceHead}><Image src="/images/auth/linkedin.png" alt="" width={28} height={28} /><div><div className={styles.sourceTitle}><strong>LinkedIn</strong><InfoTip label="Hinweis zu LinkedIn">LinkedIn bestätigt, dass das Konto Ihnen gehört. Angaben aus Ihrem LinkedIn-Profil übernimmt XPORTAL nicht; tragen Sie sie bitte oben selbst ein.</InfoTip></div><span>{linkedinConnected ? "Profil verbunden" : "Identität bestätigen"}</span></div></div>
        {linkedinConnected ? <span className={styles.connectedMark}>Verbunden</span> : (
          <button type="button" onClick={() => void connect("linkedin")} disabled={Boolean(busy)}>{busy === "linkedin" ? "Weiterleitung …" : "LinkedIn verbinden"}</button>
        )}
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {note ? <p className={styles.importNote} role="status">{note}</p> : null}
    </div>
  );
}
