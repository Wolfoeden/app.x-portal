import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AuthDialog } from "@/components/chat/dialogs";
import { BUSINESS_ONLY_NOTICE } from "@/lib/legal/policy";

const noop = () => undefined;

function dialog(initialMode: "register" | "login" | "link" | "recover", audience?: "client" | "freelancer") {
  return renderToStaticMarkup(
    createElement(AuthDialog, {
      initialMode,
      audience,
      destination: "/freelancer/apply",
      onClose: noop,
      onAuthenticated: noop,
      showToast: noop,
    }),
  );
}

// UX-Review Oktober 2026: Wer sich auf /freelancer/apply registriert, sah den
// Dialog der Auftraggeber — mit „Ihre Anfrage bleibt erhalten“ und einem
// Newsletter über passende Freelancer.
describe("sign-up dialog for freelancers", () => {
  it("talks about the profile, not about a request", () => {
    const markup = dialog("register", "freelancer");
    expect(markup).toContain("Konto anlegen und Profil erstellen");
    expect(markup).toContain("direkt zum Profilformular");
    expect(markup).toContain("erst, wenn XPORTAL es freigegeben hat");
    expect(markup).not.toContain("Anfrage");
    expect(markup).not.toContain("Ihre bisherige Arbeit");
  });

  it("offers no newsletter about matching freelancers", () => {
    const markup = dialog("register", "freelancer");
    expect(markup).not.toContain("Newsletter");
    expect(markup).not.toContain("passende Freelancer");
    // Die AGB-Zustimmung bleibt Pflicht.
    expect(markup).toContain("Ich stimme den");
  });

  it("drops the business-only notice that contradicts the job-seeker path", () => {
    expect(dialog("register", "freelancer")).not.toContain(BUSINESS_ONLY_NOTICE);
    expect(dialog("register", "freelancer")).toContain("Datenschutzhinweisen");
  });

  it("uses profile wording when signing in or requesting a link", () => {
    expect(dialog("login", "freelancer")).toContain("Anmelden und Profil bearbeiten");
    for (const mode of ["login", "link", "recover"] as const) {
      expect(dialog(mode, "freelancer")).not.toContain("Anfrage");
    }
  });

  it("leaves the client dialog as it was", () => {
    const login = dialog("login");
    expect(login).toContain("Anmelden und direkt fortfahren");
    const register = dialog("register", "client");
    expect(register).toContain("Ihre Anfrage bleibt erhalten");
    expect(register).toContain("Newsletter:");
    expect(register).toContain(BUSINESS_ONLY_NOTICE);
  });
});

// Oktober 2026: LinkedIn und GitHub als Anmeldewege für beide Zielgruppen,
// nur wenn der Anbieter eingerichtet ist (Schalter in netlify.toml).
describe("LinkedIn and GitHub sign-in", () => {
  async function render(audience: "client" | "freelancer", enabled: boolean) {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_AUTH_LINKEDIN_ENABLED", enabled ? "true" : "false");
    vi.stubEnv("NEXT_PUBLIC_AUTH_GITHUB_ENABLED", enabled ? "true" : "false");
    const { AuthDialog: Dialog } = await import("@/components/chat/dialogs");
    const markup = renderToStaticMarkup(
      createElement(Dialog, {
        initialMode: "register",
        audience,
        destination: "/freelancer/apply",
        onClose: noop,
        onAuthenticated: noop,
        showToast: noop,
      }),
    );
    vi.unstubAllEnvs();
    return markup;
  }

  it("offers both buttons to clients and freelancers when switched on", async () => {
    for (const markup of [await render("client", true), await render("freelancer", true)]) {
      expect(markup).toContain("Mit LinkedIn fortfahren");
      expect(markup).toContain("Mit GitHub fortfahren");
      expect(markup).toContain("erst nach Ihrem Klick geöffnet");
    }
  });

  it("hides them while switched off", async () => {
    for (const markup of [await render("client", false), await render("freelancer", false)]) {
      expect(markup).not.toContain("Mit LinkedIn fortfahren");
      expect(markup).not.toContain("Mit GitHub fortfahren");
    }
  });
});
