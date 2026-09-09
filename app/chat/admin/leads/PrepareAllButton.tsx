"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { appPath } from "@/lib/app-path";

import styles from "./leads.module.css";

/**
 * Den Abgleich für alle offenen Leads anstoßen.
 *
 * Der Knopf ruft dieselbe Route, die auch der Zeitgeber weckt, und zwar
 * mehrmals: Ein Aufruf arbeitet zwanzig Sekunden und sagt dann, was liegen
 * blieb. Bei zweihundertfünfzig Leads sind das mehrere Runden, und die
 * Schleife gehört in den Browser und nicht in die Serverfunktion — dieselbe
 * Überlegung wie beim Stapelversand: Eine Funktion, die alles in einem Zug
 * versucht, läuft in die Zeitgrenze des Gateways, und ein Abbruch nach der
 * Hälfte ließe niemanden wissen, welche Hälfte.
 *
 * Es geht dabei nichts raus. Der Abgleich legt Entwürfe an und archiviert,
 * was der Katalog nicht bedienen kann; verschickt wird erst im Fenster.
 */

/**
 * Sicherheitsnetz gegen eine Schleife, die nicht kleiner wird.
 *
 * Großzügig bemessen, seit ein Modell jede Ausschreibung liest: Ein
 * Durchgang schafft dann acht bis zwölf Leads statt fünfzig, und
 * zweihundertfünfzig brauchen entsprechend mehr Runden.
 */
const MAX_RUNDEN = 60;

type Lauf = {
  runden: number;
  geprueft: number;
  vorbereitet: number;
  archiviert: number;
  uebrig: number;
  /** Wie viele Ausschreibungen das Modell gelesen hat. */
  vomModell: number;
};

/**
 * @param offen Leads, die der Lauf tatsächlich anfassen würde — unarchiviert,
 * Status `new`, kein Entwurf. Nicht die Zahl der offenen Leads: Einer mit
 * fertigem Entwurf ist offen und wird trotzdem übersprungen, und der Knopf
 * bot dann „Alle 0 offenen abgleichen" neben der Kachel „Offen 1" an.
 */
export function PrepareAllButton({ offen }: { offen: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [lauf, setLauf] = useState<Lauf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abbrechen = useRef(false);

  async function abgleichen() {
    if (
      !window.confirm(
        `Alle offenen Leads werden gegen den Katalog gehalten.\n\n` +
          `Treffer bekommen einen Entwurf, der auf das Versandfenster wartet. ` +
          `Leads ohne Treffer wandern ins Archiv und zählen als offene ` +
          `Nachfrage.\n\nEs wird dabei nichts verschickt.`,
      )
    ) {
      return;
    }

    abbrechen.current = false;
    setRunning(true);
    setError(null);
    const summe: Lauf = {
      runden: 0,
      geprueft: 0,
      vorbereitet: 0,
      archiviert: 0,
      uebrig: offen,
      vomModell: 0,
    };
    setLauf(summe);

    try {
      for (let runde = 0; runde < MAX_RUNDEN; runde += 1) {
        if (abbrechen.current) break;

        const response = await fetch(appPath("/api/leadgen/run"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ mode: "prepare" }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(payload.error || `Fehler ${response.status}.`);
          break;
        }

        const ergebnis = (await response.json()) as {
          examined: number;
          prepared: number;
          archived: number;
          remaining: number;
          stoppedBy: string;
          extractedByModel: number;
        };

        summe.runden += 1;
        summe.geprueft += ergebnis.examined;
        summe.vorbereitet += ergebnis.prepared;
        summe.archiviert += ergebnis.archived;
        summe.uebrig = ergebnis.remaining;
        summe.vomModell += ergebnis.extractedByModel ?? 0;
        setLauf({ ...summe });

        // Fertig ist, wer nichts mehr vorfindet. Ein Durchgang, der nichts
        // angesehen hat, würde sonst ewig weiterlaufen.
        if (ergebnis.remaining <= 0 || ergebnis.examined === 0) break;
      }
    } catch {
      setError("Der Abgleich ist abgebrochen.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  return (
    <p className={styles.runs}>
      <span className={styles.filterLabel}>Abgleich</span>
      <button
        type="button"
        className={styles.bulkButton}
        disabled={running || offen === 0}
        onClick={() => void abgleichen()}
      >
        {running
          ? `Gleicht ab … ${lauf?.geprueft ?? 0} von ${offen} geprüft`
          : offen === 0
            ? "Nichts abzugleichen"
            : `Alle ${offen} offenen abgleichen`}
      </button>
      {running ? (
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => {
            abbrechen.current = true;
          }}
        >
          Abbrechen
        </button>
      ) : null}
      {lauf && !running ? (
        <span className={styles.run}>
          <b>{lauf.vorbereitet}</b> vorbereitet, <b>{lauf.archiviert}</b>{" "}
          archiviert
          {lauf.geprueft && lauf.vomModell < lauf.geprueft
            ? `, ${lauf.geprueft - lauf.vomModell} ohne Modell gelesen`
            : ""}
          {lauf.uebrig ? `, ${lauf.uebrig} übrig` : ""}
          {lauf.runden >= MAX_RUNDEN ? " — noch einmal starten" : ""}
        </span>
      ) : null}
      {error ? <span className={styles.error}>{error}</span> : null}
    </p>
  );
}
