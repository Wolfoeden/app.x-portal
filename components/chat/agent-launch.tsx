"use client";

import { useEffect, useState } from "react";

import { EXTERNAL_SEARCH_CREDITS } from "@/lib/ai/credit-policy";
import { IconSpark } from "@/components/icons";

/**
 * Der Einstieg in die Websuche, wenn der Katalog nichts hergibt.
 *
 * Vorher stand hier ein grauer, gesperrter Knopf mit einer roten Zeile
 * darunter — die Stelle mit der höchsten Absprungrate. Die erste Gegenfassung
 * war eine ganze Karte mit Überschrift, Fließtext und vier Schrittkacheln und
 * damit das andere Extrem: Ein Ergebnisbereich verträgt an dieser Stelle einen
 * Knopf, keinen Prospekt.
 *
 * Geblieben ist eine Pille in der Formensprache der übrigen Vorschläge, eine
 * kurze Zeile darunter und während des Laufs genau eine Zeile, die sagt, woran
 * gerade gearbeitet wird.
 */

export type AgentLaunchState =
  | { kind: "ready"; remaining: number }
  | { kind: "login" }
  | { kind: "loading" }
  | { kind: "insufficient"; remaining: number };

export function agentLaunchState(
  authenticated: boolean,
  creditsRemaining: number | null,
): AgentLaunchState {
  if (!authenticated) return { kind: "login" };
  if (creditsRemaining === null) return { kind: "loading" };
  if (creditsRemaining < EXTERNAL_SEARCH_CREDITS) {
    return { kind: "insufficient", remaining: creditsRemaining };
  }
  return { kind: "ready", remaining: creditsRemaining };
}

function label(state: AgentLaunchState): string {
  switch (state.kind) {
    case "login":
      return "Anmelden und Recherche-Agent starten";
    case "loading":
      return "Guthaben wird geladen …";
    case "insufficient":
      return "Guthaben aufstocken";
    default:
      return "Recherche-Agent starten";
  }
}

function note(state: AgentLaunchState): string {
  switch (state.kind) {
    case "login":
      return "Sucht öffentlich weiter · nur mit Konto";
    case "loading":
      return `${EXTERNAL_SEARCH_CREDITS} Credits`;
    case "insufficient":
      return `${EXTERNAL_SEARCH_CREDITS} Credits nötig · ${state.remaining} verfügbar`;
    default:
      return `${EXTERNAL_SEARCH_CREDITS} Credits · bei Fehlschlag kostenlos`;
  }
}

export function AgentLaunchPanel({
  state,
  searching,
  failed,
  onStart,
  onRequireLogin,
  onNeedCredits,
}: {
  state: AgentLaunchState;
  searching: boolean;
  failed: boolean;
  onStart: () => void;
  onRequireLogin: () => void;
  onNeedCredits: () => void;
}) {
  if (searching) return <AgentRunProgress />;

  const action =
    state.kind === "login"
      ? onRequireLogin
      : state.kind === "insufficient"
        ? onNeedCredits
        : onStart;

  return (
    <div className="agent-launch">
      <button
        className="agent-pill"
        type="button"
        onClick={action}
        disabled={state.kind === "loading"}
      >
        <IconSpark size={14} />
        {label(state)}
      </button>
      <p className="agent-pill-note">
        {failed ? "Letzter Lauf fehlgeschlagen · nichts belastet" : note(state)}
      </p>
    </div>
  );
}

/**
 * Was gerade passiert, in einer Zeile.
 *
 * Die Phasen laufen nach Zeit, nicht nach Ereignissen: die Route ist ein
 * einzelner Aufruf und meldet zwischendurch nichts. Deshalb behauptet keine
 * Zeile einen Abschluss — sie benennen die Reihenfolge der Arbeit, und die
 * stimmt. Die letzte ist die Ansprache: sie geht erst nach dem Abgleich raus,
 * und nur an Personen, die bei XPORTAL noch nicht hinterlegt sind.
 */
const PHASES = [
  { after: 0, label: "Anforderungen werden in Suchanfragen übersetzt" },
  { after: 4_000, label: "Öffentliche Quellen werden durchsucht" },
  { after: 12_000, label: "Treffer werden an ihren Quellen geprüft" },
  { after: 20_000, label: "Abgleich mit XPORTAL läuft" },
  {
    after: 26_000,
    label: "KI-Agenten laden gefundene Freelancer zu XPORTAL ein",
  },
] as const;

export function AgentRunProgress() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 1_000);
    return () => clearInterval(timer);
  }, []);

  const phase = PHASES.reduce(
    (current, next) => (elapsed >= next.after ? next : current),
    PHASES[0],
  );

  return (
    <div className="agent-launch">
      <p className="agent-pill is-running" role="status" aria-live="polite">
        <span className="thinking-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        {phase.label}
      </p>
    </div>
  );
}
