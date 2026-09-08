"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { appPath } from "@/lib/app-path";

import styles from "./leads.module.css";

/**
 * Den Versand von Hand anstoßen.
 *
 * Ruft dieselbe Route wie der Zeitgeber, mit `mode: "send"` — und damit
 * denselben Durchgang, dieselben vorbereiteten Entwürfe, denselben Text. Der
 * Unterschied ist allein, dass hier ein Mensch klickt: Das Zeitfenster gilt
 * nur für den Zeitgeber, die Tagesmenge für beide.
 *
 * Mehrmals hintereinander, weil ein Durchgang nach zwanzig Sekunden aufhört
 * und sagt, was liegen blieb.
 */

const MAX_RUNDEN = 20;

type Lauf = {
  verschickt: number;
  uebersprungen: number;
  verworfen: number;
  uebrig: number;
  grund: string | null;
};

export function SendNowButton({
  wartend,
  heuteVerschickt,
  tagesmenge,
  mailReady,
}: {
  wartend: number;
  heuteVerschickt: number;
  tagesmenge: number;
  mailReady: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [lauf, setLauf] = useState<Lauf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abbrechen = useRef(false);

  const uebrigHeute = Math.max(tagesmenge - heuteVerschickt, 0);
  const jetztMoeglich = Math.min(wartend, uebrigHeute);

  async function verschicken() {
    if (
      !window.confirm(
        `${jetztMoeglich} vorbereitete Nachrichten werden jetzt verschickt.\n\n` +
          `Es geht genau der Text raus, der unter „Wartet auf Versand" steht. ` +
          `Das lässt sich nicht zurücknehmen.`,
      )
    ) {
      return;
    }

    abbrechen.current = false;
    setRunning(true);
    setError(null);
    const summe: Lauf = {
      verschickt: 0,
      uebersprungen: 0,
      verworfen: 0,
      uebrig: wartend,
      grund: null,
    };
    setLauf(summe);

    try {
      for (let runde = 0; runde < MAX_RUNDEN; runde += 1) {
        if (abbrechen.current) break;

        const response = await fetch(appPath("/api/leadgen/run"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ mode: "send" }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(payload.error || `Fehler ${response.status}.`);
          break;
        }

        const ergebnis = (await response.json()) as {
          sent: number;
          skipped: number;
          discarded: number;
          remaining: number;
          stoppedBy: string;
        };

        summe.verschickt += ergebnis.sent;
        summe.uebersprungen += ergebnis.skipped;
        summe.verworfen += ergebnis.discarded;
        summe.uebrig = ergebnis.remaining;
        summe.grund = ergebnis.stoppedBy;
        setLauf({ ...summe });

        // Die Tagesmenge und ein leerer Vorrat sind beide Endpunkte. Ein
        // Durchgang, der nichts angesehen hat, würde sonst ewig weiterlaufen.
        if (
          ergebnis.stoppedBy === "daily_limit" ||
          ergebnis.stoppedBy === "nothing_prepared" ||
          ergebnis.remaining <= 0
        ) {
          break;
        }
      }
    } catch {
      setError("Der Versand ist abgebrochen.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  return (
    <p className={styles.runs}>
      <span className={styles.filterLabel}>Versand</span>
      <button
        type="button"
        className={styles.bulkButton}
        disabled={running || !mailReady || jetztMoeglich === 0}
        onClick={() => void verschicken()}
      >
        {/*
          Ein ausgegrauter Knopf mit „0 jetzt verschicken" sagt nicht, warum.
          Roman hat daraus geschlossen, der Versand sei kaputt — er war es
          nicht, die Tagesmenge war erreicht. Ein gesperrter Knopf muss seinen
          Grund tragen, nicht nur seine Zahl.
        */}
        {running
          ? `Verschickt … ${lauf?.verschickt ?? 0}`
          : jetztMoeglich > 0
            ? `${jetztMoeglich} jetzt verschicken`
            : !mailReady
              ? "Mailversand nicht eingerichtet"
              : wartend === 0
                ? "Keine Entwürfe vorbereitet"
                : `Tagesmenge erreicht (${heuteVerschickt}/${tagesmenge})`}
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
      <span className={styles.runStopped}>
        heute {heuteVerschickt} von {tagesmenge}
        {uebrigHeute === 0
          ? " — ab morgen wieder; das Zeitfenster gilt nur für den Zeitgeber"
          : ""}
      </span>
      {lauf && !running ? (
        <span className={styles.run}>
          <b>{lauf.verschickt}</b> verschickt
          {lauf.uebersprungen
            ? `, ${lauf.uebersprungen} übersprungen`
            : ""}
          {lauf.verworfen ? `, ${lauf.verworfen} verworfen` : ""}
          {lauf.uebrig ? `, ${lauf.uebrig} bleiben liegen` : ""}
        </span>
      ) : null}
      {error ? <span className={styles.error}>{error}</span> : null}
    </p>
  );
}
