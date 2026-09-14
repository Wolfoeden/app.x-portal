"use client";

import { IconArrowRight, IconSpark } from "../icons";

const suggestions = [
  {
    label: "KI & Automatisierung",
    description: "LLM · RAG · n8n · KI-Agenten",
    draftPrefix:
      "Wir wollen wiederkehrende Abläufe mit KI automatisieren: n8n-Workflows bauen und ein LLM an unsere Bestandssysteme anbinden, perspektivisch auch RAG auf unsere eigenen Dokumente. Projektbasis, remote, Start kurzfristig.",
    intro:
      "Ein Beispiel-Brief steht im Eingabefeld — passen Sie ihn an oder schicken Sie ihn direkt ab. Was Sie nicht erwähnen, ergänze ich nicht.",
  },
  {
    label: "SAP",
    description: "S/4HANA · FI/CO · HCM · Migration",
    draftPrefix:
      "Wir suchen Unterstützung im SAP-Umfeld: SAP S/4HANA, Anbindung an unsere bestehenden Systeme und Begleitung der Migration. Erfahrung mit SAP FI/CO oder SAP HCM ist willkommen. Projektbasis, remote möglich, Start in den nächsten Wochen.",
    intro:
      "Ein Beispiel-Brief steht im Eingabefeld — passen Sie ihn an oder schicken Sie ihn direkt ab. Was Sie nicht erwähnen, ergänze ich nicht.",
  },
  {
    label: "1st & 2nd Level Support",
    description: "IT Support · Helpdesk · L1/L2",
    draftPrefix:
      "Wir brauchen Verstärkung im IT Support: 1st und 2nd Level, Helpdesk für unsere Mitarbeitenden, Ticketbearbeitung und Störungsbehebung. Remote möglich, Start kurzfristig.",
    intro:
      "Ein Beispiel-Brief steht im Eingabefeld — passen Sie ihn an oder schicken Sie ihn direkt ab. Was Sie nicht erwähnen, ergänze ich nicht.",
  },
] as const;

export type GuidedSuggestion = (typeof suggestions)[number];

export function WelcomeState() {
  return (
    <section className="welcome-state" aria-labelledby="welcome-title">
      <div className="assistant-emblem" aria-hidden="true">
        <span><IconSpark size={22} /></span>
      </div>
      <h1 id="welcome-title">Aufgabe beschreiben. Belege und Lücken sehen.</h1>
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
          <span className="suggestion-description">{suggestion.description}</span>
          <span className="suggestion-arrow" aria-hidden="true"><IconArrowRight size={17} /></span>
        </button>
      ))}
    </div>
  );
}
