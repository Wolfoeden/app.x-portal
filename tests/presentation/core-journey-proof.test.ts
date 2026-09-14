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
import { BRIEF_ANALYSIS_CREDITS, EXTERNAL_SEARCH_CREDITS } from "@/lib/ai/credit-policy";

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

  it("erklärt Gaststart und Ergebnis mit demselben Protokoll", () => {
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

    expect(guestMarkup).toContain("Aufgabe beschreiben. Belege und Lücken sehen.");
    expect(guestMarkup).toContain("Das passiert nach dem Absenden");
    expect(guestMarkup).toContain(`${BRIEF_ANALYSIS_CREDITS} Credits pro Projektanalyse`);
    expect(resultMarkup).toContain("Vom Projekttext zur prüfbaren Auswahl");
    expect(resultMarkup).toContain("Im Profil belegt");
    expect(resultMarkup).toContain("Vor Kontakt offen");
  });

  it("zeigt im Preisdialog erst Stand und Aktionskosten, dann genau eine bezahlte Stufe", () => {
    const markup = renderToStaticMarkup(
      createElement(CreditPlansDialog, {
        usage: previewUsage,
        customerReference: "preview-user",
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

    expect(markup).toContain("Aktueller Stand. Klare nächste Option.");
    expect(markup).toContain(`${BRIEF_ANALYSIS_CREDITS} Credits`);
    expect(markup).toContain(`${EXTERNAL_SEARCH_CREDITS} Credits`);
    expect(markup).toContain("Einzige bezahlte Stufe");
    expect(markup.match(/<h3>Enterprise<\/h3>/gu)).toHaveLength(1);
    expect(markup).toContain("Keine");
  });
});
