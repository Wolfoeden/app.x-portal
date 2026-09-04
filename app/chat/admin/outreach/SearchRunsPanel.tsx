"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { appPath } from "@/lib/app-path";
import type { SearchRun } from "@/lib/freelancer/sourced-candidate-import";

import styles from "./outreach.module.css";

/**
 * Die bezahlten Suchläufe, aus denen Kandidaten entstehen können.
 *
 * Der Knopf legt die Treffer als recherchierte Kandidaten an — und startet
 * damit die Frist aus Art. 14 DSGVO. Deshalb steht er hier und läuft nicht am
 * Ende der Suche von selbst: Ab dem Anlegen schuldet XPORTAL diesen Menschen
 * eine Information, und diese Uhr soll niemand unbemerkt starten.
 */

const dateFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "–" : dateFormat.format(date);
}

type RowState = { busy: boolean; note: string | null; error: string | null };

export function SearchRunsPanel({ runs }: { runs: SearchRun[] }) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, RowState>>({});

  async function importRun(run: SearchRun) {
    setState((current) => ({
      ...current,
      [run.id]: { busy: true, note: null, error: null },
    }));

    try {
      const response = await fetch(appPath("/api/admin/sourced-candidates/import"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ searchRunId: run.id }),
      });
      const payload = (await response.json()) as {
        created?: number;
        skipped?: string[];
        error?: string;
      };

      if (!response.ok) {
        setState((current) => ({
          ...current,
          [run.id]: {
            busy: false,
            note: null,
            error: payload.error ?? `Fehler ${response.status}.`,
          },
        }));
        return;
      }

      const skipped = payload.skipped ?? [];
      // Die Gründe einzeln benennen: „2 übersprungen" ließe offen, ob die
      // Personen schon vorliegen oder ob etwas schiefging.
      const reasons: Record<string, string> = {
        duplicate: "lagen schon vor",
        suppressed: "haben widersprochen",
        summary_too_short: "ohne verwertbaren Text",
        rejected: "abgewiesen",
      };
      const detail = [...new Set(skipped)]
        .map(
          (reason) =>
            `${skipped.filter((entry) => entry === reason).length} ${
              reasons[reason] ?? reason
            }`,
        )
        .join(", ");

      setState((current) => ({
        ...current,
        [run.id]: {
          busy: false,
          error: null,
          note: `${payload.created ?? 0} angelegt${detail ? ` · ${detail}` : ""}`,
        },
      }));
      router.refresh();
    } catch {
      setState((current) => ({
        ...current,
        [run.id]: {
          busy: false,
          note: null,
          error: "Die Übernahme konnte nicht gestartet werden.",
        },
      }));
    }
  }

  if (!runs.length) {
    return (
      <p className={styles.empty}>
        Es liegt kein bezahlter Suchlauf mit Treffern vor.
      </p>
    );
  }

  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Suchlauf</th>
            <th scope="col">Treffer</th>
            <th scope="col">Übernommen</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const row = state[run.id];
            const complete = run.alreadyImported >= run.candidates.length;
            return (
              <tr key={run.id}>
                <td className={styles.days}>{formatDateTime(run.createdAt)}</td>
                <td>
                  {run.candidates.map((candidate) => (
                    <div key={`${run.id}:${candidate.displayName}`}>
                      <span className={styles.name}>{candidate.displayName}</span>
                      <span className={styles.role}>
                        {" "}
                        · {candidate.role}
                        {/* Ohne Adresse geht die Ansprache nur über LinkedIn
                            oder das Kontaktformular — das entscheidet sich
                            hier, nicht erst beim Schreiben. */}
                        {candidate.hasEmail ? " · E-Mail" : " · ohne E-Mail"}
                      </span>
                    </div>
                  ))}
                </td>
                <td className={styles.days}>
                  {run.alreadyImported} / {run.candidates.length}
                </td>
                <td>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => void importRun(run)}
                    disabled={row?.busy || complete}
                  >
                    {row?.busy
                      ? "Übernehme …"
                      : complete
                        ? "Vollständig"
                        : "Als Kandidaten übernehmen"}
                  </button>
                  {row?.note ? (
                    <div className={styles.role}>{row.note}</div>
                  ) : null}
                  {row?.error ? (
                    <div className={styles.rowError} role="alert">
                      {row.error}
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
