import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MandateCard } from "@/components/chat/mandate-card";

const PROJECT = "22222222-2222-4222-8222-222222222222";

// Oktober 2026: Der Suchauftrag ist eine Antwort von XPORTAL im Gespräch,
// kein eigener Kasten mit Formular.
describe("search mandate in the conversation", () => {
  const markup = renderToStaticMarkup(createElement(MandateCard, { projectId: PROJECT, guest: false, preview: true }));

  it("asks like an assistant reply", () => {
    expect(markup).toContain("assistant-message");
    expect(markup).toContain("Kein passendes Profil gefunden? Ich lege einen Suchauftrag an und suche automatisch weiter.");
    expect(markup).toContain("Suchauftrag erstellen");
    expect(markup).toContain("Nein, danke");
  });

  it("needs no form for an account and says what the click allows", () => {
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("Suchauftrag geben");
    expect(markup).toContain("Mit dem Klick darf XPORTAL Sie zu diesem Suchauftrag per E-Mail kontaktieren.");
  });

  it("stays away without an analysed project", () => {
    expect(renderToStaticMarkup(createElement(MandateCard, { projectId: null, guest: false }))).toBe("");
  });
});
