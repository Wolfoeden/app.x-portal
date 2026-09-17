"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const suggestions = [
  {
    label: "KI & Automatisierung",
    draftPrefix:
      "Wir wollen wiederkehrende Abläufe mit KI automatisieren: n8n-Workflows bauen und ein LLM an unsere Bestandssysteme anbinden, perspektivisch auch RAG auf unsere eigenen Dokumente. Projektbasis, remote, Start kurzfristig.",
    intro:
      "Ein Beispiel-Brief steht im Eingabefeld — passen Sie ihn an oder schicken Sie ihn direkt ab. Was Sie nicht erwähnen, ergänze ich nicht.",
  },
  {
    label: "SAP",
    draftPrefix:
      "Wir suchen Unterstützung im SAP-Umfeld: SAP S/4HANA, Anbindung an unsere bestehenden Systeme und Begleitung der Migration. Erfahrung mit SAP FI/CO oder SAP HCM ist willkommen. Projektbasis, remote möglich, Start in den nächsten Wochen.",
    intro:
      "Ein Beispiel-Brief steht im Eingabefeld — passen Sie ihn an oder schicken Sie ihn direkt ab. Was Sie nicht erwähnen, ergänze ich nicht.",
  },
] as const;

export type GuidedSuggestion = (typeof suggestions)[number];

const GREETING = "Schönen Guten Morgen";
/** Anrede für Gäste und für Konten, zu denen kein Name bekannt ist. */
const FALLBACK_ADDRESSEE = "Recruiter";

const FIRST_KEYSTROKE_DELAY_MS = 400;
const KEYSTROKE_MS = 50;
const WORD_GAP_MS = 35;
const COMMA_PAUSE_MS = 260;
const DELETE_MS = 32;

/**
 * Der Vorname aus dem Kontonamen, wie Google oder Microsoft ihn liefern.
 *
 * Microsoft-Verzeichnisse führen Namen oft als „Nachname, Vorname"; Titel wie
 * „Dr." gehören nicht in die Begrüßung.
 */
export function greetingName(displayName: string | null | undefined): string | null {
  const [head = "", ...rest] = (displayName ?? "").trim().split(",");
  const givenNames = rest.length > 0 && !/\s/u.test(head.trim()) ? rest.join(",") : head;
  return givenNames.split(/\s+/u).find((part) => part && !part.endsWith(".")) ?? null;
}

/**
 * Der nächste Anschlag auf dem Weg vom angezeigten zum gewünschten Text.
 *
 * Passt der angezeigte Text nicht mehr zum Ziel, etwa weil nach der Anmeldung
 * ein Vorname statt „Recruiter" dasteht, wird bis zum gemeinsamen Anfang
 * gelöscht und dann weitergetippt.
 */
export function nextKeystroke(
  shown: string,
  target: string,
): { text: string; delayMs: number } | null {
  if (shown === target) return null;
  const shownChars = Array.from(shown);
  if (!target.startsWith(shown)) {
    return { text: shownChars.slice(0, -1).join(""), delayMs: DELETE_MS };
  }

  const targetChars = Array.from(target);
  const index = shownChars.length;
  const previous = targetChars[index - 1];
  // Ungleichmäßige Abstände wirken getippt statt abgespielt. Fest statt
  // zufällig, damit die Begrüßung bei jedem Aufruf gleich läuft.
  const unevenness = ((index * 37) % 17) - 8;
  const delayMs =
    index === 0
      ? FIRST_KEYSTROKE_DELAY_MS
      : previous === ","
        ? COMMA_PAUSE_MS
        : previous === " "
          ? KEYSTROKE_MS + WORD_GAP_MS + unevenness
          : KEYSTROKE_MS + unevenness;
  return { text: targetChars.slice(0, index + 1).join(""), delayMs };
}

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const subscribeToReducedMotion = (onChange: () => void) => {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const readReducedMotion = () => window.matchMedia(reducedMotionQuery).matches;
const readReducedMotionOnServer = () => false;

/** Tippt `target` ein, sobald `active` gilt; bei reduzierter Bewegung steht er dann sofort da. */
function useTypewriter(target: string, active: boolean) {
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    readReducedMotion,
    readReducedMotionOnServer,
  );
  const [shown, setShown] = useState("");

  useEffect(() => {
    if (!active || reducedMotion) return;
    const keystroke = nextKeystroke(shown, target);
    if (!keystroke) return;
    const timer = window.setTimeout(() => setShown(keystroke.text), keystroke.delayMs);
    return () => window.clearTimeout(timer);
  }, [active, reducedMotion, shown, target]);

  if (reducedMotion) return { text: active ? target : "", typing: false };
  return { text: shown, typing: active && shown !== target };
}

export function WelcomeState({
  displayName,
  ready,
}: {
  /** Kontoname des angemeldeten Nutzers, null für Gäste. */
  displayName: string | null;
  /**
   * Getippt wird erst, wenn feststeht, wer angemeldet ist; sonst würde
   * „Recruiter" angetippt und wieder gelöscht. Bis dahin blinkt die Schreibmarke.
   */
  ready: boolean;
}) {
  const greeting = `${GREETING}, ${greetingName(displayName) ?? FALLBACK_ADDRESSEE}`;
  const { text, typing } = useTypewriter(greeting, ready);
  // Der ungetippte Rest steht unsichtbar im Satz, damit die Zeile von Anfang
  // an ihre endgültige Breite und ihren Umbruch hat und nicht beim Tippen wandert.
  const untyped = greeting.startsWith(text) ? greeting.slice(text.length) : "";

  return (
    <section className="welcome-state" aria-labelledby="welcome-title">
      <h1 id="welcome-title">
        <span className="sr-only">{greeting}</span>
        <span aria-hidden="true">
          {text}
          <span className={typing ? "welcome-caret is-typing" : "welcome-caret"} />
          <span className="welcome-untyped">{untyped}</span>
        </span>
      </h1>
    </section>
  );
}

export function SuggestionGrid({
  onSuggestion,
}: {
  onSuggestion: (suggestion: GuidedSuggestion) => void;
}) {
  return (
    <div className="suggestion-grid" aria-label="Beispielanfragen">
      {suggestions.map((suggestion) => (
        <button key={suggestion.label} type="button" onClick={() => onSuggestion(suggestion)}>
          <span className="suggestion-label">{suggestion.label}</span>
        </button>
      ))}
    </div>
  );
}
