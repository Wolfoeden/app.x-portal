import type { ShowcaseTheme } from "@/lib/freelancer/showcase";

/**
 * Die Rolleneinstiege unter dem Eingabefeld.
 *
 * Eigene Datei ohne "use client", weil auch die Landingpage (eine
 * Server-Komponente) sie verlinkt: `/chat?beispiel=<key>` öffnet den Chat so,
 * als hätte man den Shortcut angeklickt.
 *
 * Die Hauptaktion bleibt das Einfügen der eigenen Projektanzeige. Darunter
 * stehen höchstens drei konkrete Rollen statt breiter Themen wie „KI &
 * Automatisierung“: Ein Thema verspricht einen Bestand, eine Rolle beschreibt
 * eine Anfrage. Gewählt sind die Rollen, für die der Profilbestand am
 * 02.10.2026 verlässliche Treffer hergab:
 *
 * - AI Agents: der gezielte Test. Von 24 passenden Anfragen hatten 13 ein
 *   verlässliches Profil im Ergebnis.
 * - React und TypeScript: nur 9 von 34 passenden Anfragen endeten mit einem
 *   verlässlichen Profil. Ein Test, bis an echten Projekten geklärt ist,
 *   woran die übrigen scheitern.
 * - Requirements Engineering: die engere Fassung des früheren Shortcuts
 *   „Anforderungen & Prozesse“, ebenfalls erst an realen Ergebnissen zu prüfen.
 *
 * SAP, DevOps und Data Engineering fehlen bewusst: Am Markt gefragt, im
 * Bestand zu dünn (SAP: vier aktive Profile, eines davon jüngst
 * aktualisiert). Eine Rollensuche, die ins Leere läuft, kostet mehr Vertrauen,
 * als sie gewinnt; solche Projekte lassen sich weiterhin einfügen.
 *
 * Ein Klick setzt nur einen kurzen, editierbaren Anfang ins Eingabefeld und
 * schickt nichts ab: keine Analyse, keine Recherche, kein Guthaben. Der Anfang
 * nennt die Kompetenz, keine Rolle mit Titel oder Seniorität — wer „AI Agents“
 * sucht, sucht nicht automatisch einen „Junior AI Architect“. Was danach als
 * „…“ stehen bleibt, fällt beim Absenden weg ({@link withoutUnfilledPrompts}).
 *
 * `showcase` zeigt unter dem Anfang, wer sich für die Rolle selbst angemeldet
 * hat (components/chat/registered-showcase.tsx).
 */

/** Die Angaben nach dem ersten Satz, in dieser Reihenfolge. */
export const BRIEF_PROMPTS = ["Aufgabe", "Muss-Skills", "Start", "Budget"] as const;

/** Der Platzhalter hinter jeder Angabe; der erste ist nach dem Klick markiert. */
export const BRIEF_GAP = "…";

const INTRO =
  "Der Anfang Ihrer Anfrage steht im Eingabefeld. Ersetzen Sie die „…“ durch Aufgabe, Muss-Skills, Start und Budget – was offen bleibt, lasse ich weg und ergänze nichts dazu. Gesucht wird erst, wenn Sie absenden.";

function roleEntry<const Key extends string>(
  key: Key,
  label: string,
  opening: string,
  showcase: ShowcaseTheme | null,
) {
  return {
    key,
    label,
    /** Der erste Satz; an ihm wird eine abgeschickte Anfrage dem Shortcut zugeordnet. */
    opening,
    draftPrefix: `${opening} ${BRIEF_PROMPTS.map((prompt) => `${prompt}: ${BRIEF_GAP}`).join(" ")}`,
    intro: INTRO,
    showcase,
  };
}

export const EXAMPLE_BRIEFS = [
  roleEntry("ai-agenten", "AI-Agent-Entwickler finden", "Ich suche einen Freelancer für AI Agents.", "ai-agents"),
  roleEntry(
    "react-typescript",
    "React-/TypeScript-Entwickler finden",
    "Ich suche einen Freelancer für React und TypeScript.",
    "react-typescript",
  ),
  roleEntry(
    "requirements-engineer",
    "Requirements Engineer finden",
    "Ich suche einen Freelancer für Requirements Engineering.",
    "requirements-engineering",
  ),
] as const;

export type ExampleBrief = (typeof EXAMPLE_BRIEFS)[number];
export type ExampleBriefKey = ExampleBrief["key"];

/**
 * Links auf die früheren Themen-Shortcuts, etwa aus Mails, öffnen die Rolle,
 * die an ihre Stelle getreten ist.
 */
const FORMER_KEYS: ReadonlyMap<string, ExampleBriefKey> = new Map([
  ["ki-automatisierung", "ai-agenten"],
  ["anforderungen", "requirements-engineer"],
]);

export function exampleBrief(key: string | null | undefined): ExampleBrief | null {
  if (!key) return null;
  const current = FORMER_KEYS.get(key) ?? key;
  return EXAMPLE_BRIEFS.find((brief) => brief.key === current) ?? null;
}

/** Der Link, der den Chat mit diesem Einstieg öffnet. */
export function exampleBriefPath(key: ExampleBriefKey): string {
  return `/chat?beispiel=${key}`;
}

/** Der Shortcut, mit dem eine Anfrage begonnen wurde, solange ihr erster Satz steht. */
export function exampleBriefForText(text: string): ExampleBrief | null {
  const start = text.trimStart();
  return EXAMPLE_BRIEFS.find((brief) => start.startsWith(brief.opening)) ?? null;
}

// Die Bezeichnungen enthalten kein Zeichen mit Sonderbedeutung im Muster.
const PROMPT_PATTERN = BRIEF_PROMPTS.join("|");
const UNFILLED_PROMPT = new RegExp(
  `\\s*(?:${PROMPT_PATTERN}):\\s*(?:…|\\.\\.\\.)(?=\\s+(?:${PROMPT_PATTERN}):|\\s*$)`,
  "gu",
);

/**
 * Die Anfrage ohne die Angaben, die noch „…“ sind.
 *
 * „Budget: …“ ist keine Angabe, sondern eine leere Stelle. Bliebe sie stehen,
 * müsste die Analyse sie deuten — und könnte etwas hineinlesen, das niemand
 * geschrieben hat. Nur ein Platzhalter, auf den nichts mehr folgt, fällt weg:
 * „Budget: … 800 € pro Tag“ bleibt, wie es ist.
 */
export function withoutUnfilledPrompts(text: string): string {
  return text.replace(UNFILLED_PROMPT, "").trim();
}

/** Der erste Platzhalter, damit Tippen ihn gleich ersetzt; `null`, wenn keiner mehr da ist. */
export function firstGap(text: string): { start: number; end: number } | null {
  const start = text.indexOf(BRIEF_GAP);
  return start < 0 ? null : { start, end: start + BRIEF_GAP.length };
}
