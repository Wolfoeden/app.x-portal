import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { authIntentCopy } from "@/components/chat/auth-continuation";
import { AuthDialog } from "@/components/chat/dialogs";
import { exhaustedNotice } from "@/components/chat/upgrade";

const noop = () => undefined;

// Oktober 2026: Gäste sehen vor der Analyse keinen Hinweis mehr. Erst wenn
// sie „Projekt abgleichen“ drücken, kommt ein kurzer Registrierungsdialog.
describe("signing up to analyse a project", () => {
  it("is short: four facts, no paragraph", () => {
    const markup = renderToStaticMarkup(
      createElement(AuthDialog, {
        initialMode: "register",
        intent: "analyze_project",
        destination: "/chat?resume=analyze_project",
        onClose: noop,
        onAuthenticated: noop,
        showToast: noop,
      }),
    );
    expect(markup).toContain(">Kostenlos registrieren</h2>");
    for (const point of ["3 Projektanalysen inklusive", "Keine Kreditkarte erforderlich", "Ihre Eingaben bleiben erhalten"]) {
      expect(markup).toContain(point);
    }
    expect(markup).not.toContain("Für die Analyse brauchen Sie ein kostenloses Konto");
  });

  it("offers signing in with the same promise", () => {
    expect(authIntentCopy("analyze_project").loginTitle).toBe("Anmelden und analysieren");
  });

  it("no longer explains the free account below the composer", () => {
    const notice = exhaustedNotice({
      credits: {
        total: 9, used: 9, reserved: 0, remaining: 0, periodEnd: "2026-11-01T00:00:00.000Z",
        exhausted: true, creditsPerRequest: 3, planId: "starter", lastRequestCost: null,
      },
    });
    expect(notice.text).not.toContain("kostenloses Konto");
    expect(notice.text).not.toContain("Oder ohne Konto");
  });
});
