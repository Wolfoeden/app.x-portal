/**
 * Die Beispiel-Briefs hinter den Shortcuts im Chat.
 *
 * Eigene Datei ohne "use client", weil auch die Landingpage (eine
 * Server-Komponente) sie verlinkt: `/chat?beispiel=<key>` öffnet den Chat so,
 * als hätte man den Shortcut angeklickt.
 *
 * Nur Themen, die der Profilbestand trägt. SAP stand hier gleichrangig neben
 * KI, obwohl am 30.09.2026 nur fünf buchbare Profile SAP nannten und keines
 * davon selbst angemeldet war; eine Beispielsuche, die ins Leere läuft, kostet
 * mehr Vertrauen, als sie gewinnt. SAP-Projekte lassen sich weiterhin
 * einfügen. Anforderungen & Prozesse ist das Thema mit dem breitesten Bestand
 * nach KI (docs/freelancer-pool-audit.md).
 *
 * Der KI-Brief nennt kein einzelnes Werkzeug. Mit „n8n-Workflows“ fiel durch,
 * wer Agenten, Make oder Zapier baut und kein n8n nennt — genau die
 * Freelancer, die sich für KI-Automatisierung angemeldet haben. Kern bleibt
 * das LLM, RAG ist optional.
 *
 * `showcase` zeigt unter dem Brief, wer sich für das Thema selbst angemeldet
 * hat (components/chat/registered-showcase.tsx).
 */
const INTRO =
  "Ein Beispiel-Brief steht im Eingabefeld — passen Sie ihn an oder schicken Sie ihn direkt ab. Was Sie nicht erwähnen, ergänze ich nicht.";

export const EXAMPLE_BRIEFS = [
  {
    key: "ki-automatisierung",
    label: "KI & Automatisierung",
    draftPrefix:
      "Wir wollen wiederkehrende Abläufe mit KI automatisieren: Workflow-Automatisierungen bauen und ein LLM an unsere Bestandssysteme anbinden, perspektivisch auch RAG auf unsere eigenen Dokumente. Projektbasis, remote, Start kurzfristig.",
    intro: INTRO,
    showcase: "automation",
  },
  {
    key: "anforderungen",
    label: "Anforderungen & Prozesse",
    draftPrefix:
      "Wir suchen Unterstützung im Anforderungsmanagement: fachliche Anforderungen mit den Fachbereichen aufnehmen, Geschäftsprozesse analysieren und die Umsetzung mit der IT abstimmen. Projektbasis, remote möglich, Start in den nächsten Wochen.",
    intro: INTRO,
    showcase: null,
  },
] as const;

export type ExampleBrief = (typeof EXAMPLE_BRIEFS)[number];
export type ExampleBriefKey = ExampleBrief["key"];

export function exampleBrief(key: string | null | undefined): ExampleBrief | null {
  return EXAMPLE_BRIEFS.find((brief) => brief.key === key) ?? null;
}

/** Der Link, der den Chat mit diesem Beispiel öffnet. */
export function exampleBriefPath(key: ExampleBriefKey): string {
  return `/chat?beispiel=${key}`;
}
