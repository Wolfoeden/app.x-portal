"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { appPath } from "@/lib/app-path";

import styles from "./leads.module.css";

/**
 * Archivierte Leads noch einmal gegen den heutigen Katalog halten.
 *
 * Ein Lead wird archiviert, wenn der Abgleich niemanden fand — nicht weil die
 * Anfrage schlecht war, sondern weil XPORTAL zu dem Zeitpunkt niemanden hatte.
 * Wächst der Katalog, ändert sich das, und der Recruiter von damals ist der
 * beste Neukunde, den es gibt: Er hat seinen Bedarf schon bewiesen.
 *
 * Der Lauf kostet nichts — gerechnet wird mit den Briefs, die beim ersten
 * Durchgang gespeichert wurden, kein Modell wird gefragt. Deshalb steht hier
 * auch keine Warnung und kein Budget; man darf ihn so oft drücken, wie man
 * mag. Nach einer Freigabe läuft er ohnehin von selbst.
 *
 * „Nur nachsehen" holt nichts zurück und zeigt bloß, was zurückkäme.
 */

type Ergebnis = {
  examined: number;
  withoutBrief: number;
  revived: number;
  stillEmpty: number;
  leads: { leadId: number; company: string | null; matchCount: number; matched: string[] }[];
};

export function RematchButton({ archiviert }: { archiviert: number }) {
  const router = useRouter();
  const [laeuft, setLaeuft] = useState(false);
  const [nurNachsehen, setNurNachsehen] = useState(false);
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  async function starten() {
    setLaeuft(true);
    setFehler(null);
    setErgebnis(null);
    try {
      const antwort = await fetch(appPath("/api/admin/leads/rematch"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ limit: 500, dryRun: nurNachsehen }),
      });
      const nutzlast = (await antwort.json()) as Ergebnis & { error?: string };
      if (!antwort.ok) {
        setFehler(nutzlast.error ?? `Fehler ${antwort.status}.`);
        return;
      }
      setErgebnis(nutzlast);
      if (!nurNachsehen) router.refresh();
    } catch {
      setFehler("Die Verbindung ist abgebrochen.");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className={styles.rematch}>
      <div className={styles.rematchHead}>
        <span>
          <strong>Archiv neu abgleichen</strong>
          <span>
            {archiviert > 0
              ? `${archiviert} archivierte Leads · kostet nichts`
              : "kostet nichts"}
          </span>
        </span>
        <label>
          <input
            checked={nurNachsehen}
            disabled={laeuft}
            onChange={(event) => setNurNachsehen(event.target.checked)}
            type="checkbox"
          />
          nur nachsehen
        </label>
        <button disabled={laeuft} onClick={starten} type="button">
          {laeuft ? "läuft…" : nurNachsehen ? "Nachsehen" : "Neu abgleichen"}
        </button>
      </div>

      {fehler ? <p className={styles.rematchError}>{fehler}</p> : null}

      {ergebnis ? (
        <div className={styles.rematchResult}>
          <p>
            {ergebnis.examined} geprüft ·{" "}
            <strong>{ergebnis.revived}</strong>{" "}
            {nurNachsehen ? "hätten jetzt Treffer" : "zurück in die Warteschlange"} ·{" "}
            {ergebnis.stillEmpty} weiterhin ohne
            {ergebnis.withoutBrief > 0
              ? ` · ${ergebnis.withoutBrief} ohne gespeicherten Bedarf`
              : ""}
          </p>
          {ergebnis.leads.length > 0 ? (
            <ul>
              {ergebnis.leads.slice(0, 12).map((lead) => (
                <li key={lead.leadId}>
                  <strong>{lead.company ?? `Lead ${lead.leadId}`}</strong> ·{" "}
                  {lead.matchCount} Treffer: {lead.matched.join(", ")}
                </li>
              ))}
            </ul>
          ) : null}
          {!nurNachsehen && ergebnis.revived > 0 ? (
            <p>
              Die Entwürfe schreibt der nächste Abgleich; verschickt wird erst
              im Versandfenster.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
