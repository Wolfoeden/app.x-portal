"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";

import { appPath } from "@/lib/app-path";

import type { OutreachRow } from "@/lib/leadgen/leads-data";

import styles from "./leads.module.css";

/**
 * Die Nachrichten: was rausging und was als Nächstes rausgeht.
 *
 * Eine eigene Tabelle und nicht ein Filter über die Warteschlange, weil sie
 * eine andere Frage beantwortet. Die Warteschlange sagt, was noch zu tun ist;
 * diese Liste sagt, was geschehen ist — und das gilt weiter, wenn der Lead
 * längst gelöscht wurde. Am 8. September verschwanden 234 Leads aus der
 * Warteschlange; wer danach wissen wollte, was an dem Morgen rausgegangen
 * war, fand in der alten Ansicht nichts mehr davon.
 */

const dateFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: string | null): string {
  if (!value) return "–";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "–" : dateFormat.format(parsed);
}

const HERKUNFT: Readonly<Record<"scheduler" | "admin", string>> = {
  scheduler: "Tageslauf",
  admin: "von Hand",
};

const ZUSTAND: Readonly<
  Record<OutreachRow["state"], { label: string; className: string }>
> = {
  draft: { label: "Wartet", className: styles.badgeNew },
  sending: { label: "Wird verschickt", className: styles.badgeNew },
  sent: { label: "Verschickt", className: styles.badgeContacted },
  failed: { label: "Nicht zugestellt", className: styles.badgeFailed },
};

export function OutreachPanel({
  rows,
  view,
  mailReady,
}: {
  rows: OutreachRow[];
  view: "prepared" | "sent";
  mailReady: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fehler, setFehler] = useState<Record<string, string>>({});

  /**
   * Von Hand verschicken heißt: derselbe Entwurf, derselbe Weg, nur ein
   * Mensch als Auslöser. Der Text wird nicht neu erzeugt — was oben in der
   * Vorschau steht, geht raus.
   */
  async function verschicken(row: OutreachRow) {
    if (
      !window.confirm(
        `Diese Nachricht jetzt an ${row.recipient_email} verschicken?

` +
          `Es geht genau der Text raus, der hier steht.`,
      )
    ) {
      return;
    }

    setBusy(row.outreach_id);
    setFehler((vorher) => {
      const rest = { ...vorher };
      delete rest[row.outreach_id];
      return rest;
    });

    try {
      const response = await fetch(
        appPath(`/api/admin/outreach/${row.outreach_id}/send`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: "{}",
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setFehler((vorher) => ({
          ...vorher,
          [row.outreach_id]: payload.error || `Fehler ${response.status}.`,
        }));
        return;
      }
      router.refresh();
    } catch {
      setFehler((vorher) => ({
        ...vorher,
        [row.outreach_id]: "Der Versand ist gescheitert.",
      }));
    } finally {
      setBusy(null);
    }
  }

  if (!rows.length) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          <p>
            {view === "prepared"
              ? "Es wartet kein Entwurf auf den Versand."
              : "Es wurde noch nichts verschickt."}
          </p>
          <p className={styles.muted}>
            {view === "prepared"
              ? "Der Abgleich legt Entwürfe an — über den Knopf oben oder stündlich ab 5 Uhr."
              : "Der Versand läuft werktags zwischen 8 und 12 Uhr, höchstens zwanzig am Tag."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Empfänger</th>
              <th scope="col">Betreff</th>
              <th scope="col">Zustand</th>
              <th scope="col">
                {view === "prepared" ? "Vorbereitet" : "Verschickt"}
              </th>
              <th scope="col">
                <span className={styles.srOnly}>Aktion</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expanded = open === row.outreach_id;
              const zustand = ZUSTAND[row.state];

              return (
                <Fragment key={row.outreach_id}>
                  <tr data-status={row.state}>
                    <td data-label="Empfänger">
                      <strong>{row.company ?? "–"}</strong>
                      <div className={styles.muted}>
                        {row.recipient_email ?? "Adresse nicht gespeichert"}
                      </div>
                      {/* Ein gelöschter Lead ist kein Fehler, aber er erklärt,
                          warum die Zeile sich nicht mehr weiterbearbeiten
                          lässt. */}
                      {!row.lead_vorhanden ? (
                        <div className={styles.hint}>
                          Lead nicht mehr in der Warteschlange
                        </div>
                      ) : null}
                    </td>
                    <td data-label="Betreff">
                      {row.subject}
                      {row.cta_url ? (
                        <div className={styles.hint}>
                          <a
                            href={row.cta_url}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            Portal-Link aus der Mail ↗
                          </a>
                        </div>
                      ) : null}
                    </td>
                    <td data-label="Zustand">
                      <span className={`${styles.badge} ${zustand.className}`}>
                        {zustand.label}
                      </span>
                      {row.origin ? (
                        <div className={styles.muted}>
                          {HERKUNFT[row.origin]}
                        </div>
                      ) : null}
                      {row.failure_reason ? (
                        <div className={styles.hint}>{row.failure_reason}</div>
                      ) : null}
                    </td>
                    <td className={styles.muted} data-label="Zeitpunkt">
                      {formatDateTime(
                        view === "prepared" ? row.prepared_at : row.sent_at,
                      )}
                    </td>
                    <td data-label="Aktionen">
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() =>
                            setOpen(expanded ? null : row.outreach_id)
                          }
                        >
                          {expanded ? "Schließen" : "Text ansehen"}
                        </button>
                        {view === "prepared" ? (
                          <button
                            type="button"
                            className={styles.linkButton}
                            disabled={
                              busy === row.outreach_id ||
                              !mailReady ||
                              !row.recipient_email
                            }
                            onClick={() => void verschicken(row)}
                          >
                            {busy === row.outreach_id
                              ? "Verschickt …"
                              : "Jetzt verschicken"}
                          </button>
                        ) : null}
                      </div>
                      {fehler[row.outreach_id] ? (
                        <p className={styles.error}>
                          {fehler[row.outreach_id]}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className={styles.detailRow}>
                      <td colSpan={5}>
                        <div className={styles.detail}>
                          <div className={styles.detailColumn}>
                            <p className={styles.detailLabel}>
                              {view === "prepared"
                                ? "Geht so raus"
                                : "So ging es raus"}
                            </p>
                            <div className={styles.sentMeta}>
                              <span>an {row.recipient_email ?? "–"}</span>
                              {row.origin ? (
                                <span>{HERKUNFT[row.origin]}</span>
                              ) : null}
                              <span>
                                {view === "prepared"
                                  ? `vorbereitet ${formatDateTime(row.prepared_at)}`
                                  : `verschickt ${formatDateTime(row.sent_at)}`}
                              </span>
                              {row.model ? <span>{row.model}</span> : null}
                            </div>
                            <p className={styles.detailText}>
                              <strong>{row.subject}</strong>
                            </p>
                            <pre className={styles.sentBody}>{row.body}</pre>
                          </div>

                          <div className={styles.detailColumn}>
                            <p className={styles.detailLabel}>Ausschreibung</p>
                            <p className={styles.detailText}>
                              {row.stellenanzeige ??
                                "Der Lead wurde gelöscht — der Ausschreibungstext steht nicht mehr zur Verfügung."}
                            </p>
                            {row.prepared_profile_id ? (
                              <>
                                <p className={styles.detailLabel}>
                                  Angebotenes Profil
                                </p>
                                <p className={styles.detailText}>
                                  <a
                                    href={`/chat/admin/freelancers/${row.prepared_profile_id}`}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                  >
                                    Profil ansehen ↗
                                  </a>
                                </p>
                              </>
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
    </div>
  );
}
