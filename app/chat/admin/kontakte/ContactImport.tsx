"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import styles from "@/components/admin/cockpit.module.css";
import { appPath } from "@/lib/app-path";

type ImportResponse = {
  count?: number;
  created?: number;
  updated?: number;
  skipped?: Array<{ line: number; reason: string }>;
  unmappedHeaders?: string[];
  preview?: Array<{ company: string; contactName: string | null; email: string | null }>;
  error?: string;
};

/**
 * Kontakte aus einer Tabelle übernehmen.
 *
 * Der kürzeste Weg aus Excel: Bereich markieren, kopieren, hier einfügen —
 * die Zellen kommen mit Tabulatoren an. CSV geht ebenso, als Datei oder
 * eingefügt. Erst die Vorschau, dann das Übernehmen; ein zweiter Import
 * derselben Liste aktualisiert, statt zu verdoppeln.
 */
export function ContactImport() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [mode, setMode] = useState<"preview" | "done" | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function send(dryRun: boolean) {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(appPath("/api/admin/contacts/import"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ text, source: source.trim() || undefined, dryRun }),
      });
      const payload = (await response.json().catch(() => ({}))) as ImportResponse;
      if (!response.ok) {
        setResult({ error: payload.error ?? `Fehler ${response.status}.` });
        return;
      }
      setResult(payload);
      setMode(dryRun ? "preview" : "done");
      if (!dryRun) {
        setText("");
        startTransition(() => router.refresh());
      }
    } catch {
      setResult({ error: "Die Verbindung ist abgebrochen." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.cardBody} style={{ display: "grid", gap: 12 }}>
      <p className={styles.cardNote}>
        In Excel den Bereich samt Kopfzeile markieren, kopieren und hier einfügen — oder eine CSV-Datei wählen.
        Erkannt werden Spalten wie Unternehmen, Ansprechpartner, Funktion, Region, AI-Bezug, E-Mail-Adresse,
        E-Mail-Art, E-Mail-Quelle, Projektlink und Hinweis.
      </p>
      <label className={styles.field}>
        Tabelle
        <textarea
          className={styles.textarea}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setMode(null);
          }}
          placeholder={"Unternehmen\tAnsprechpartner\tE-Mail-Adresse\nBeispiel GmbH\tVorname Nachname\tname@beispiel.de"}
          spellCheck={false}
        />
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 10 }}>
        <label className={styles.field}>
          CSV-Datei
          <input
            className={styles.input}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setText(await file.text());
              if (!source) setSource(file.name.replace(/\.[^.]+$/u, "").slice(0, 80));
              setMode(null);
            }}
          />
        </label>
        <label className={styles.field}>
          Herkunft
          <input
            className={styles.input}
            value={source}
            maxLength={80}
            onChange={(event) => setSource(event.target.value)}
            placeholder="z. B. AI-Recruiter DACH"
          />
        </label>
        <button type="button" className={styles.button} disabled={busy || !text.trim()} onClick={() => send(true)}>
          Vorschau
        </button>
        <button
          type="button"
          className={styles.buttonPrimary}
          disabled={busy || !text.trim() || mode !== "preview" || !result?.count}
          onClick={() => send(false)}
        >
          {result?.count && mode === "preview" ? `${result.count} übernehmen` : "Übernehmen"}
        </button>
      </div>

      {result?.error ? (
        <p className={styles.error} role="alert">
          {result.error}
        </p>
      ) : null}
      {result && !result.error ? (
        <div role="status" style={{ display: "grid", gap: 6, fontSize: 13 }}>
          {mode === "done" ? (
            <p className={styles.success}>
              {result.created ?? 0} neu angelegt, {result.updated ?? 0} aktualisiert.
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              <strong>{result.count ?? 0}</strong> Kontakte erkannt
              {result.preview?.length
                ? `, z. B. ${result.preview
                    .slice(0, 3)
                    .map((contact) => contact.contactName ? `${contact.contactName} (${contact.company})` : contact.company)
                    .join(", ")}`
                : ""}
              .
            </p>
          )}
          {result.skipped?.length ? (
            <p className={styles.cardNote}>
              Übersprungen: {result.skipped.slice(0, 6).map((entry) => `Zeile ${entry.line} – ${entry.reason}`).join(" · ")}
              {result.skipped.length > 6 ? ` · und ${result.skipped.length - 6} weitere` : ""}
            </p>
          ) : null}
          {result.unmappedHeaders?.length ? (
            <p className={styles.cardNote}>Nicht übernommene Spalten: {result.unmappedHeaders.join(", ")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
