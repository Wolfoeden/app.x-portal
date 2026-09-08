"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { appPath } from "@/lib/app-path";
import type { SourcingAutomation } from "@/lib/sourcing/automation";

import styles from "./demand.module.css";

/**
 * Der Betriebsstreifen der Beschaffung.
 *
 * In der Formensprache der Zeitraumleiste darüber — dieselbe Zeile, dieselben
 * Knöpfe, kein eigener Kasten und keine erklärende Karte. Was er schaltet, ist
 * folgenreich; wie er aussieht, muss es nicht sein.
 *
 * Der Knopf an den Nachfrageprofilen wirkt unabhängig davon. „Aus" heißt „von
 * selbst passiert nichts", nicht „geht nicht" — deshalb steht hier nirgends
 * ein Wort wie „gesperrt".
 */

type Feld = "absorbUserSearches" | "resolveAddresses" | "autoInvite";

const BESCHRIFTUNG: Record<Feld, { titel: string; hilfe: string }> = {
  absorbUserSearches: {
    titel: "Kundensuche",
    hilfe: "Treffer bezahlter Suchen als Kandidaten anlegen",
  },
  resolveAddresses: {
    titel: "Adressen",
    hilfe: "zu Kandidaten ohne Adresse selbst eine suchen (~5 ct)",
  },
  autoInvite: {
    titel: "Einladungen",
    hilfe: "gefundene Adressen selbsttätig anschreiben",
  },
};

function morgenFrueh(): string {
  const morgen = new Date();
  morgen.setDate(morgen.getDate() + 1);
  morgen.setHours(6, 0, 0, 0);
  return morgen.toISOString();
}

/**
 * Ob die Automatik ruht, entscheidet der Server.
 *
 * Nicht aus Vorsicht, sondern weil `Date.now()` beim Zeichnen zwei Antworten
 * gibt: eine auf dem Server, eine im Browser. React beanstandet das zu Recht —
 * und der Streifen zeigte je nach Millisekunde einen anderen Knopf.
 */
export function AutomationStrip({
  automation,
  paused,
}: {
  automation: SourcingAutomation;
  paused: boolean;
}) {
  const router = useRouter();
  const [stand, setStand] = useState(automation);
  const [angehalten, setAngehalten] = useState(paused);
  const [fehler, setFehler] = useState<string | null>(null);
  const [uebertraegt, starteUebergang] = useTransition();

  async function schreibe(patch: Record<string, unknown>) {
    setFehler(null);
    try {
      const antwort = await fetch(appPath("/api/admin/sourcing/automation"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(patch),
      });
      const nutzlast = (await antwort.json()) as {
        automation?: SourcingAutomation;
        error?: string;
      };
      if (!antwort.ok || !nutzlast.automation) {
        setFehler(nutzlast.error ?? `Fehler ${antwort.status}.`);
        return;
      }
      setStand(nutzlast.automation);
      // Im Ereignisbehandler ist die Uhr erlaubt — hier wird nicht gezeichnet.
      const bis = nutzlast.automation.pausedUntil;
      setAngehalten(bis !== null && Date.parse(bis) > Date.now());
      starteUebergang(() => router.refresh());
    } catch {
      setFehler("Die Verbindung ist abgebrochen.");
    }
  }

  return (
    <div className={styles.automationBar}>
      <span>Betrieb</span>

      {(Object.keys(BESCHRIFTUNG) as Feld[]).map((feld) => (
        <span className={styles.automationSwitch} key={feld}>
          <span title={BESCHRIFTUNG[feld].hilfe}>{BESCHRIFTUNG[feld].titel}</span>
          <button
            aria-pressed={stand[feld]}
            data-on={stand[feld]}
            disabled={uebertraegt}
            onClick={() => schreibe({ [feld]: !stand[feld] })}
            type="button"
          >
            {stand[feld] ? "an" : "aus"}
          </button>
        </span>
      ))}

      <span className={styles.automationBudget}>
        Tagesbudget
        <input
          disabled={uebertraegt}
          max={500}
          min={0}
          onBlur={(event) => {
            const wert = Number(event.target.value);
            if (Number.isSafeInteger(wert) && wert !== stand.dailyAddressBudget) {
              void schreibe({ dailyAddressBudget: wert });
            }
          }}
          defaultValue={stand.dailyAddressBudget}
          type="number"
        />
        Adressen
      </span>

      <button
        className={styles.automationPause}
        disabled={uebertraegt}
        onClick={() =>
          schreibe({ pausedUntil: angehalten ? null : morgenFrueh() })
        }
        type="button"
      >
        {angehalten ? "Weiterlaufen lassen" : "Bis morgen anhalten"}
      </button>

      {angehalten ? (
        <span className={styles.automationPaused}>
          angehalten bis{" "}
          {new Intl.DateTimeFormat("de-DE", {
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(stand.pausedUntil!))}
        </span>
      ) : null}

      {fehler ? <span className={styles.automationError}>{fehler}</span> : null}
    </div>
  );
}
