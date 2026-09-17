import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ChatWorkspace } from "@/components/ChatWorkspace";
import { CreditPlansDialog } from "@/components/chat/account";
import {
  previewAnalysis,
  previewAuth,
  previewBrief,
  previewGuestAuth,
  previewMessages,
  previewProfiles,
  previewUsage,
} from "@/components/chat/preview-fixtures";
import { MatchProtocol } from "@/components/product/MatchProtocol";

describe("Paket 2: gemeinsamer Beweisfaden", () => {
  it("trennt KI-Strukturierung, Regelabgleich und menschliche Entscheidung", () => {
    const markup = renderToStaticMarkup(createElement(MatchProtocol));

    expect(markup).toContain("Match-Protokoll");
    expect(markup).toContain("<b>KI</b>");
    expect(markup).toContain("<b>Regeln</b>");
    expect(markup).toContain("Kontakt oder Recherche starten erst nach Ihrer Entscheidung.");
  });

  it("kennzeichnet die sichere Basisanalyse ohne erfundene KI-Leistung", () => {
    const markup = renderToStaticMarkup(
      createElement(MatchProtocol, { structureMode: "basis" }),
    );

    expect(markup).toContain("<b>Basis</b>");
    expect(markup).not.toContain("<b>KI</b>");
    expect(markup).toContain("ohne KI-Antwort");
  });

  it("hält den Gaststart ruhig und belegt erst das Ergebnis", () => {
    const guestMarkup = renderToStaticMarkup(
      createElement(ChatWorkspace, {
        previewData: {
          auth: previewGuestAuth,
          projects: [],
          messages: [],
          brief: previewBrief,
          profiles: [],
          analysis: previewAnalysis,
          usage: previewUsage,
        },
      }),
    );
    const resultMarkup = renderToStaticMarkup(
      createElement(ChatWorkspace, {
        previewData: {
          auth: previewAuth,
          projects: [],
          messages: previewMessages,
          brief: previewBrief,
          profiles: previewProfiles,
          analysis: previewAnalysis,
          usage: previewUsage,
        },
      }),
    );

    expect(guestMarkup).toMatch(/Schönen Guten (Morgen|Tag|Abend), Recruiter/u);
    expect(guestMarkup).not.toContain("Das passiert nach dem Absenden");
    expect(guestMarkup).not.toContain("Gast-Credits");
    expect(guestMarkup).not.toContain("KI strukturiert den Text. Das Matching bleibt regelbasiert.");
    expect(resultMarkup).toContain("Vom Projekttext zur prüfbaren Auswahl");
    expect(resultMarkup).toContain("Im Profil belegt");
    expect(resultMarkup).toContain("Vor Kontakt offen");
  });

  it("verweist aus der Kontoverwaltung auf die einzige Preisseite", () => {
    const markup = renderToStaticMarkup(
      createElement(CreditPlansDialog, {
        usage: previewUsage,
        team: null,
        teamBusy: false,
        teamNotice: null,
        selfLimit: null,
        selfLimitMaxEuro: 50,
        onSelfLimitSaved: () => undefined,
        onInviteTeamMember: () => undefined,
        onRemoveTeamMember: () => undefined,
        onClose: () => undefined,
      }),
    );

    expect(markup).toContain("Abrechnung und Team");
    expect(markup).not.toContain("Was eine bestätigte Aktion kostet");
    expect(markup).not.toContain("Aktueller Stand. Klare nächste Option.");
    expect(markup).not.toContain("Fragen zur Abrechnung oder eine Obergrenze vereinbaren");
    expect(markup).toContain('href="/preise"');
    expect(markup).toContain("Tarife ansehen und Credits kaufen");
    expect(markup).not.toContain("Monatlich buchen");
  });
});
