"use client";

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

export function WelcomeState() {
  return (
    <section className="welcome-state" aria-labelledby="welcome-title">
      <h1 id="welcome-title">Projekt einfügen. Profil buchen.</h1>
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
