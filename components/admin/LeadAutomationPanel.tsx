"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { appPath } from "@/lib/app-path";
import {
  LEAD_PREPARE_MODES,
  LEAD_PREPARE_MODE_LABELS,
  LEAD_SEND_MODES,
  LEAD_SEND_MODE_LABELS,
  type LeadAutomation,
  type LeadPrepareMode,
  type LeadSendMode,
} from "@/lib/leadgen/automation-model";

import styles from "./cockpit.module.css";

/**
 * Der Schalter der Lead-Automatik: Abgleich und Versand getrennt, dazu
 * Tagesmenge und Pause.
 *
 * Der automatische Versand verschickt Werbe-E-Mails ohne Durchsicht im
 * Einzelfall. Er wird deshalb erst nach einer ausdrücklichen Bestätigung
 * eingeschaltet, die den offenen Punkt nennt — nicht mit einem Klick, der
 * sich wie jeder andere anfühlt.
 */

const CONFIRM_AUTOMATIC_SEND =
  "Automatischer Versand schickt Mo–Fr zwischen 8 und 12 Uhr Akquise-Mails an Leads, ohne dass jede einzeln freigegeben wird.\n\n" +
  "Werbe-E-Mails ohne vorherige Einwilligung sind nach § 7 Abs. 2 Nr. 2 UWG auch gegenüber Unternehmen grundsätzlich unzulässig; ob die Antwort auf eine öffentliche Ausschreibung darunter fällt, ist nicht entschieden.\n\n" +
  "Automatischen Versand jetzt einschalten?";

function tomorrowMorning(): string {
  const morgen = new Date();
  morgen.setDate(morgen.getDate() + 1);
  morgen.setHours(6, 0, 0, 0);
  return morgen.toISOString();
}

export function LeadAutomationPanel({
  automation,
  paused,
  defaultDailyLimit,
}: {
  automation: LeadAutomation;
  /** Vom Server bestimmt: `Date.now()` gäbe beim Zeichnen zwei Antworten. */
  paused: boolean;
  defaultDailyLimit: number;
}) {
  const router = useRouter();
  const [state, setState] = useState(automation);
  const [isPaused, setIsPaused] = useState(paused);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function write(patch: Partial<{ prepareMode: LeadPrepareMode; sendMode: LeadSendMode; dailyLimit: number | null; pausedUntil: string | null }>) {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const response = await fetch(appPath("/api/admin/leadgen/automation"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(patch),
      });
      const payload = (await response.json().catch(() => ({}))) as { automation?: LeadAutomation; error?: string };
      if (!response.ok || !payload.automation) {
        setError(payload.error ?? `Fehler ${response.status}.`);
        return;
      }
      setState(payload.automation);
      // Gesetzt wird nur „bis morgen früh“ oder nichts; eine abgelaufene Pause
      // erkennt der Server beim nächsten Laden.
      setIsPaused(payload.automation.pausedUntil !== null);
      setSaved(true);
      startTransition(() => router.refresh());
    } catch {
      setError("Die Verbindung ist abgebrochen.");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || pending;

  return (
    <div className={styles.cardBody} style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <span className={styles.tileLabel} id="lead-prepare-mode">Abgleich neuer Leads</span>
        <div className={styles.segmented} role="group" aria-labelledby="lead-prepare-mode">
          {LEAD_PREPARE_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={state.prepareMode === mode}
              disabled={disabled}
              onClick={() => state.prepareMode !== mode && write({ prepareMode: mode })}
            >
              {LEAD_PREPARE_MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <span className={styles.tileLabel} id="lead-send-mode">Versand der Mail-Entwürfe</span>
        <div className={styles.segmented} role="group" aria-labelledby="lead-send-mode">
          {LEAD_SEND_MODES.slice()
            .reverse()
            .map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={state.sendMode === mode}
                disabled={disabled}
                onClick={() => {
                  if (state.sendMode === mode) return;
                  if (mode === "scheduled" && !window.confirm(CONFIRM_AUTOMATIC_SEND)) return;
                  void write({ sendMode: mode });
                }}
              >
                {LEAD_SEND_MODE_LABELS[mode]}
              </button>
            ))}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 10 }}>
        <label className={styles.field}>
          Tagesmenge automatisch
          <input
            className={styles.input}
            type="number"
            min={1}
            max={200}
            placeholder={String(defaultDailyLimit)}
            defaultValue={state.dailyLimit ?? ""}
            disabled={disabled}
            style={{ width: 110 }}
            onBlur={(event) => {
              const raw = event.target.value.trim();
              const value = raw === "" ? null : Number(raw);
              if (value !== null && (!Number.isInteger(value) || value < 1 || value > 200)) {
                setError("Tagesmenge zwischen 1 und 200.");
                return;
              }
              if (value !== state.dailyLimit) void write({ dailyLimit: value });
            }}
          />
        </label>
        <button
          type="button"
          className={styles.button}
          disabled={disabled}
          onClick={() => write({ pausedUntil: isPaused ? null : tomorrowMorning() })}
        >
          {isPaused ? "Automatik fortsetzen" : "Bis morgen 6 Uhr anhalten"}
        </button>
      </div>

      {isPaused && state.pausedUntil ? (
        <p className={styles.cardNote}>
          Angehalten bis{" "}
          {new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" }).format(
            new Date(state.pausedUntil),
          )}{" "}
          Uhr. Die Knöpfe auf der Leads-Seite wirken weiter.
        </p>
      ) : (
        <p className={styles.cardNote}>
          {state.sendMode === "scheduled"
            ? `Versand automatisch Mo–Fr 8–12 Uhr, höchstens ${state.dailyLimit ?? defaultDailyLimit} am Tag. Die Knöpfe auf der Leads-Seite wirken weiter.`
            : "Entwürfe warten auf Freigabe auf der Leads-Seite. Der Zeitplan verschickt nichts."}
        </p>
      )}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {saved && !error ? <p className={styles.success} role="status">Gespeichert.</p> : null}
    </div>
  );
}
