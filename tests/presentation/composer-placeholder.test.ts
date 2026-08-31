import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChatWorkspace } from "@/components/ChatWorkspace";
import {
  previewAuth,
  previewBrief,
  previewAnalysis,
  previewMessages,
  previewProjects,
  previewUsage,
} from "@/components/chat/preview-fixtures";

function render(messages: typeof previewMessages) {
  return renderToStaticMarkup(
    createElement(ChatWorkspace, {
      previewData: {
        auth: previewAuth,
        projects: previewProjects,
        messages,
        brief: previewBrief,
        profiles: [],
        analysis: previewAnalysis,
        usage: previewUsage,
      },
    }),
  );
}

describe("composer placeholder", () => {
  /**
   * Der Platzhalter wird selbst gezeichnet statt dem Attribut ueberlassen:
   * `text-overflow: ellipsis` wirkt auf `::placeholder` eines Textfeldes nicht,
   * der Text wird dort hart abgeschnitten. Wird das Feld schmal — etwa weil die
   * Projektuebersicht aufgeht — soll er in derselben Zeile mit "…" enden.
   */
  it("draws the placeholder itself instead of using the attribute", () => {
    const markup = render(previewMessages);

    expect(markup).toContain("composer-placeholder");
    // Nur das Chatfeld; die Felder der Projektuebersicht behalten ihre
    // eigenen Platzhalter.
    const composer = markup.match(/<textarea id="chat-composer"[^>]*>/u);
    expect(composer).not.toBeNull();
    expect(composer?.[0]).not.toContain("placeholder=");
  });

  it("keeps the field labelled even without a placeholder attribute", () => {
    const markup = render(previewMessages);

    expect(markup).toContain('for="chat-composer"');
    expect(markup).toContain("Projekt oder Ergänzung beschreiben");
  });

  it("asks differently on an empty chat than in a running one", () => {
    expect(render([])).toContain("Welchen Freelancer suchen Sie?");
    expect(render(previewMessages)).toContain("Projektbeschreibung einfügen");
  });
});
