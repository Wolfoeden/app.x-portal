"use client";

import { useState } from "react";

import { appPath } from "@/lib/app-path";

import styles from "./demand.module.css";

/**
 * Der Wortlaut einer verschickten Einladung, auf Klick.
 *
 * Der Text wird erst beim Öffnen geholt und dann behalten. Zwei Gründe: Eine
 * Liste mit fünfzig Nachrichtentexten wäre groß und wird zu 98 Prozent nicht
 * gelesen — und jeder dieser Texte enthält den Namen und die Anschrift eines
 * Menschen. Was niemand aufschlägt, muss auch nicht durch die Leitung.
 */

type Nachricht = {
  subject: string | null;
  body: string | null;
  error: string | null;
  recipientEmail: string;
};

export function MessageView({ id, hasBody }: { id: string; hasBody: boolean }) {
  const [offen, setOffen] = useState(false);
  const [nachricht, setNachricht] = useState<Nachricht | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function oeffnen() {
    setOffen(true);
    if (nachricht || laedt) return;
    setLaedt(true);
    setFehler(null);
    try {
      const antwort = await fetch(
        appPath(`/api/admin/sourcing/outreach/${id}`),
        { credentials: "same-origin" },
      );
      const nutzlast = (await antwort.json()) as Nachricht & { error?: string };
      if (!antwort.ok) {
        setFehler(nutzlast.error ?? `Fehler ${antwort.status}.`);
        return;
      }
      setNachricht(nutzlast);
    } catch {
      setFehler("Die Verbindung ist abgebrochen.");
    } finally {
      setLaedt(false);
    }
  }

  if (!hasBody) {
    // Bei einer nicht zugestellten Nachricht gibt es keinen Text — der
    // Versandweg schreibt ihn erst nach der Zustellung. Ein Knopf, der ein
    // leeres Feld öffnet, wäre eine Enttäuschung mit Extraklick.
    return <span className={styles.messageNone}>kein Text</span>;
  }

  if (!offen) {
    return (
      <button className={styles.messageToggle} onClick={oeffnen} type="button">
        Text ansehen
      </button>
    );
  }

  return (
    <div className={styles.messageBox}>
      <button
        className={styles.messageToggle}
        onClick={() => setOffen(false)}
        type="button"
      >
        Text schließen
      </button>
      {laedt ? <p className={styles.messageNone}>wird geladen…</p> : null}
      {fehler ? <p className={styles.messageError}>{fehler}</p> : null}
      {nachricht ? (
        <>
          <p className={styles.messageMeta}>
            An {nachricht.recipientEmail}
            {nachricht.subject ? ` · Betreff: ${nachricht.subject}` : ""}
          </p>
          {nachricht.error ? (
            <p className={styles.messageError}>Fehler: {nachricht.error}</p>
          ) : null}
          <pre className={styles.messageBody}>{nachricht.body}</pre>
        </>
      ) : null}
    </div>
  );
}
