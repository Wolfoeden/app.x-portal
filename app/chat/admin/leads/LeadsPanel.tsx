"use client";

import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";

import { appPath } from "@/lib/app-path";
import type { LeadRow } from "@/lib/leadgen/leads-data";
import {
  LEAD_BULK_SEND_LIMIT,
  LEAD_STATUS_LABELS,
  leadHeadline,
  leadSourceUrl,
  type LeadStatus,
} from "@/lib/leadgen/limits";

import styles from "./leads.module.css";

/**
 * Die Zeilen und alles, was man mit ihnen tun kann.
 *
 * Der Stapelversand läuft bewusst hier im Browser Lead für Lead und nicht in
 * einer Serverfunktion: zwanzig Anbieteraufrufe hintereinander überschreiten
 * jede Laufzeitgrenze, und ein Abbruch nach dem zwölften ließe niemanden
 * wissen, welche zwölf schon raus sind. So sieht der Betreiber jede Zeile
 * einzeln umspringen und kann jederzeit abbrechen.
 */

type Props = {
  rows: LeadRow[];
  categories: string[];
  mailReady: boolean;
  creditsPerDraft: number;
};

type RowState = {
  subject: string;
  body: string;
  busy: null | "draft" | "send" | "patch";
  error: string | null;
  note: string | null;
};

const dateFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

const LEERER_ZUSTAND: RowState = {
  subject: "",
  body: "",
  busy: null,
  error: null,
  note: null,
};

const badgeClass: Record<LeadStatus, string> = {
  new: styles.badgeNew,
  contacted: styles.badgeContacted,
  replied: styles.badgeReplied,
  dismissed: styles.badgeDismissed,
};

function formatDateTime(value: string | null): string {
  if (!value) return "–";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "–" : dateFormat.format(parsed);
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error || `Fehler ${response.status}.`;
  } catch {
    return `Fehler ${response.status}.`;
  }
}

export function LeadsPanel({
  rows,
  categories,
  mailReady,
  creditsPerDraft,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [state, setState] = useState<Record<number, RowState>>({});
  const [bulk, setBulk] = useState<{
    running: boolean;
    done: number;
    total: number;
    failed: number;
  } | null>(null);

  const selectable = useMemo(
    () => rows.filter((row) => !row.last_contacted_at && !row.archived_at),
    [rows],
  );

  function rowState(id: number): RowState {
    return state[id] ?? LEERER_ZUSTAND;
  }

  /**
   * Der Zusammenbau liest den vorigen Zustand aus dem Aktualisierer, nicht
   * aus der Umgebung dieser Funktion. Sonst geht bei zwei Änderungen kurz
   * hintereinander — im Stapelversand der Normalfall — die erste verloren,
   * weil die zweite noch den Stand von vor dem Rendern sieht.
   */
  function patchRowState(id: number, patch: Partial<RowState>) {
    setState((previous) => ({
      ...previous,
      [id]: { ...(previous[id] ?? LEERER_ZUSTAND), ...patch },
    }));
  }

  function toggle(id: number) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createDraft(row: LeadRow): Promise<boolean> {
    patchRowState(row.id, { busy: "draft", error: null, note: null });
    try {
      const response = await fetch(
        appPath(`/api/admin/leads/${row.id}/draft`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ requestId: crypto.randomUUID() }),
        },
      );
      if (!response.ok) {
        patchRowState(row.id, { busy: null, error: await readError(response) });
        return false;
      }
      const payload = (await response.json()) as {
        draft: { subject: string; body: string };
        mode: "openai" | "fallback";
      };
      patchRowState(row.id, {
        busy: null,
        subject: payload.draft.subject,
        body: payload.draft.body,
        note:
          payload.mode === "fallback"
            ? "Ohne KI erzeugt — der Anbieter war nicht erreichbar. Bitte vor dem Senden überarbeiten."
            : null,
      });
      setOpen(row.id);
      return true;
    } catch {
      patchRowState(row.id, {
        busy: null,
        error: "Der Entwurf konnte nicht erzeugt werden.",
      });
      return false;
    }
  }

  async function send(
    row: LeadRow,
    options: { autoDraft?: boolean; silent?: boolean } = {},
  ): Promise<boolean> {
    const current = rowState(row.id);
    if (!options.silent) patchRowState(row.id, { busy: "send", error: null });
    try {
      const response = await fetch(appPath(`/api/admin/leads/${row.id}/send`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          autoDraft: options.autoDraft ?? false,
          ...(current.subject && current.body
            ? { subject: current.subject, body: current.body }
            : {}),
        }),
      });
      if (!response.ok) {
        patchRowState(row.id, { busy: null, error: await readError(response) });
        return false;
      }
      patchRowState(row.id, { busy: null, error: null, note: "Verschickt." });
      return true;
    } catch {
      patchRowState(row.id, {
        busy: null,
        error: "Der Versand ist fehlgeschlagen.",
      });
      return false;
    }
  }

  async function patchLead(
    row: LeadRow,
    patch: Record<string, unknown>,
  ): Promise<boolean> {
    patchRowState(row.id, { busy: "patch", error: null });
    try {
      const response = await fetch(appPath(`/api/admin/leads/${row.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        patchRowState(row.id, { busy: null, error: await readError(response) });
        return false;
      }
      patchRowState(row.id, { busy: null });
      router.refresh();
      return true;
    } catch {
      patchRowState(row.id, {
        busy: null,
        error: "Die Änderung wurde nicht gespeichert.",
      });
      return false;
    }
  }

  /**
   * Der Stapel. Nacheinander, nicht parallel: jede Zeile bekommt ihren eigenen
   * Anbieteraufruf, und zwanzig gleichzeitig laufen dem Minutenlimit direkt
   * in die Arme.
   */
  async function sendSelected() {
    const targets = selectable.filter((row) => selected.has(row.id));
    if (!targets.length) return;

    const batch = targets.slice(0, LEAD_BULK_SEND_LIMIT);
    const preview = batch
      .slice(0, 3)
      .map((row) => row.recipient_email)
      .join(", ");
    const confirmed = window.confirm(
      `${batch.length} Anschreiben werden jetzt erzeugt und sofort verschickt.\n\n` +
        `Empfänger unter anderem: ${preview}${batch.length > 3 ? " …" : ""}\n\n` +
        `Kosten: bis zu ${batch.length * creditsPerDraft} Credits. ` +
        `Das lässt sich nicht zurücknehmen.`,
    );
    if (!confirmed) return;

    setBulk({ running: true, done: 0, total: batch.length, failed: 0 });
    let done = 0;
    let failed = 0;
    for (const row of batch) {
      const ok = await send(row, { autoDraft: true, silent: false });
      done += 1;
      if (!ok) failed += 1;
      setBulk({ running: true, done, total: batch.length, failed });
    }
    setBulk({ running: false, done, total: batch.length, failed });
    setSelected(new Set());
    router.refresh();
  }

  if (!rows.length) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          <p>Hier liegt gerade nichts.</p>
          <p className={styles.muted}>
            Neue Leads kommen aus dem Importwerkzeug in{" "}
            <code>leadgen_queue</code>. Bearbeitete Leads stehen im Archiv.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      {selectable.length ? (
        <div className={styles.bulkBar}>
          <label className={styles.selectAll}>
            <input
              type="checkbox"
              checked={
                selected.size > 0 && selected.size === selectable.length
              }
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? new Set(selectable.map((row) => row.id))
                    : new Set(),
                )
              }
            />
            Alle {selectable.length} sichtbaren offenen auswählen
          </label>
          <span className={styles.muted}>
            {selected.size} ausgewählt
            {selected.size > LEAD_BULK_SEND_LIMIT
              ? ` — es werden die ersten ${LEAD_BULK_SEND_LIMIT} verschickt`
              : ""}
          </span>
          <button
            type="button"
            className={styles.bulkButton}
            disabled={!selected.size || !mailReady || bulk?.running}
            onClick={sendSelected}
          >
            {bulk?.running
              ? `Verschickt … ${bulk.done}/${bulk.total}`
              : "Auswahl automatisch anschreiben"}
          </button>
          {bulk && !bulk.running ? (
            <span className={styles.muted}>
              {bulk.done - bulk.failed} verschickt
              {bulk.failed ? `, ${bulk.failed} fehlgeschlagen` : ""}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">
                <span className={styles.srOnly}>Auswahl</span>
              </th>
              <th scope="col">Firma</th>
              <th scope="col">Ausschreibung</th>
              <th scope="col">Kategorie</th>
              <th scope="col">Status</th>
              <th scope="col">Eingegangen</th>
              <th scope="col">
                <span className={styles.srOnly}>Aktion</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const current = rowState(row.id);
              const expanded = open === row.id;
              const url = leadSourceUrl(row.stellenanzeige);
              const sendable = !row.last_contacted_at;

              return (
                <Fragment key={row.id}>
                  <tr data-status={row.status}>
                    <td data-label="Auswahl">
                      {sendable && !row.archived_at ? (
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => toggle(row.id)}
                          aria-label={`${row.company ?? row.recipient_email} auswählen`}
                        />
                      ) : null}
                    </td>
                    <td data-label="Firma">
                      <strong>{row.company ?? "–"}</strong>
                      <div className={styles.muted}>
                        {row.recipient_name ? `${row.recipient_name} · ` : ""}
                        {row.recipient_email}
                      </div>
                    </td>
                    <td data-label="Ausschreibung">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer noopener">
                          {leadHeadline(row.stellenanzeige)}
                        </a>
                      ) : (
                        leadHeadline(row.stellenanzeige)
                      )}
                      {row.outreach_state === "draft" ? (
                        <div className={styles.hint}>Entwurf liegt bereit</div>
                      ) : null}
                    </td>
                    <td data-label="Kategorie">
                      <input
                        className={styles.categoryInput}
                        list="lead-categories"
                        defaultValue={row.category ?? ""}
                        placeholder="—"
                        aria-label="Kategorie"
                        onBlur={(event) => {
                          const value = event.target.value.trim();
                          if (value === (row.category ?? "")) return;
                          void patchLead(row, { category: value || null });
                        }}
                      />
                    </td>
                    <td data-label="Status">
                      <span
                        className={`${styles.badge} ${badgeClass[row.status]}`}
                      >
                        {LEAD_STATUS_LABELS[row.status]}
                      </span>
                      {row.last_contacted_at ? (
                        <div className={styles.muted}>
                          {formatDateTime(row.last_contacted_at)}
                        </div>
                      ) : null}
                    </td>
                    <td className={styles.muted} data-label="Eingegangen">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td data-label="Aktionen">
                      {current.error && !expanded ? (
                        <p className={styles.error}>{current.error}</p>
                      ) : null}
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() => setOpen(expanded ? null : row.id)}
                        >
                          {expanded ? "Schließen" : "Öffnen"}
                        </button>
                        {row.archived_at ? (
                          <button
                            type="button"
                            className={styles.linkButton}
                            disabled={current.busy !== null}
                            onClick={() =>
                              void patchLead(row, { archived: false })
                            }
                          >
                            Zurückholen
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.linkButton}
                            disabled={current.busy !== null}
                            onClick={() =>
                              void patchLead(row, {
                                status: "dismissed",
                                archived: true,
                              })
                            }
                          >
                            Verwerfen
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className={styles.detailRow}>
                      <td colSpan={7}>
                        <div className={styles.detail}>
                          <div className={styles.detailColumn}>
                            <p className={styles.detailLabel}>Ausschreibung</p>
                            <p className={styles.detailText}>
                              {row.stellenanzeige}
                            </p>
                            <p className={styles.detailLabel}>Notiz</p>
                            <textarea
                              className={styles.notes}
                              defaultValue={row.notes ?? ""}
                              rows={3}
                              placeholder="Interne Notiz"
                              onBlur={(event) => {
                                const value = event.target.value;
                                if (value === (row.notes ?? "")) return;
                                void patchLead(row, { notes: value || null });
                              }}
                            />
                            {!row.archived_at && row.status !== "replied" ? (
                              <button
                                type="button"
                                className={styles.linkButton}
                                disabled={current.busy !== null}
                                onClick={() =>
                                  void patchLead(row, {
                                    status: "replied",
                                    archived: true,
                                  })
                                }
                              >
                                Als beantwortet ablegen
                              </button>
                            ) : null}
                          </div>

                          <div className={styles.detailColumn}>
                            <p className={styles.detailLabel}>Anschreiben</p>
                            <input
                              className={styles.subjectInput}
                              value={current.subject}
                              placeholder="Betreff"
                              aria-label="Betreff"
                              onChange={(event) =>
                                patchRowState(row.id, {
                                  subject: event.target.value,
                                })
                              }
                            />
                            <textarea
                              className={styles.bodyInput}
                              value={current.body}
                              rows={10}
                              placeholder="Noch kein Entwurf. Text erzeugen oder selbst schreiben."
                              aria-label="Text"
                              onChange={(event) =>
                                patchRowState(row.id, {
                                  body: event.target.value,
                                })
                              }
                            />
                            <p className={styles.hint}>
                              Anrede, Grußformel und die Pflichtangaben werden
                              beim Versand angehängt.
                            </p>

                            <div className={styles.detailActions}>
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                disabled={current.busy !== null}
                                onClick={() => void createDraft(row)}
                              >
                                {current.busy === "draft"
                                  ? "Schreibt …"
                                  : `Entwurf erzeugen (${creditsPerDraft} Credits)`}
                              </button>
                              <button
                                type="button"
                                className={styles.primaryButton}
                                disabled={
                                  current.busy !== null ||
                                  !mailReady ||
                                  !sendable ||
                                  !current.subject.trim() ||
                                  !current.body.trim()
                                }
                                onClick={async () => {
                                  if (
                                    !window.confirm(
                                      `Nachricht an ${row.recipient_email} verschicken?`,
                                    )
                                  ) {
                                    return;
                                  }
                                  if (await send(row)) router.refresh();
                                }}
                              >
                                {current.busy === "send"
                                  ? "Verschickt …"
                                  : "Senden"}
                              </button>
                            </div>

                            {current.note ? (
                              <p className={styles.hint}>{current.note}</p>
                            ) : null}
                            {current.error ? (
                              <p className={styles.error}>{current.error}</p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <datalist id="lead-categories">
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
    </div>
  );
}
