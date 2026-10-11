import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { APPLICANT_FAQ, FreelancerAuthGate, onboardingFacts } from "@/app/bewerber-portal/apply/FreelancerPortal";

function fact(term: string, placement = true): string {
  return onboardingFacts(placement).find((entry) => entry.term === term)!.text;
}

// Audit P2: Bewerber sollen Kosten, Unterlagen, Prüfumfang und Ablauf vor der
// Registrierung einschätzen können. UX-Review Oktober 2026: der eigene Nutzen
// (Kosten, Kontakt) vor dem Prüfprozess.
describe("freelancer onboarding before registration", () => {
  it("names costs and contact first, then the process, the check and the documents", () => {
    expect(onboardingFacts(true).map((entry) => entry.term)).toEqual(["Kosten", "Kontakt", "Ablauf", "Prüfung", "Unterlagen"]);
  });

  it("explains how companies get in touch without exposing contact details", () => {
    expect(fact("Kontakt")).toContain("ohne E-Mail-Adresse und Telefonnummer");
    expect(fact("Kontakt")).toContain("stellt Sie per E-Mail vor");
    expect(fact("Kontakt", false)).toContain("Kalenderlink");
    expect(fact("Kontakt", false)).not.toContain("stellt Sie per E-Mail vor");
  });

  it("promises no fee to anyone", () => {
    // Neue Vorgänge sind provisionsfrei, auch für Auftraggeber.
    expect(fact("Kosten")).toContain("eine Provision fällt für niemanden an");
    expect(fact("Kosten")).not.toContain("Vermittlungshonorar");
    expect(fact("Kosten", false)).not.toContain("Vermittlungshonorar");
  });

  it("states what the form actually requires", () => {
    const documents = fact("Unterlagen");
    expect(documents).toContain("Lebenslauf als PDF (bis 10 MB) hilft");
    expect(documents).toContain("ein Kalenderlink ist optional");
  });

  it("does not promise a competence check", () => {
    expect(fact("Prüfung")).toContain("gleicht einzelne mit Nachweisen ab");
    expect(fact("Prüfung")).not.toMatch(/Kompetenz(prüfung|test)/u);
  });

  // Oktober 2026: weniger erklären, mehr führen. Die Kernbotschaft oben, die
  // Erklärungen als Info-Blasen statt als eigene Abschnitte.
  it("leads with the core message and a sign-up button", () => {
    const markup = renderToStaticMarkup(createElement(FreelancerAuthGate));
    const hero = markup.slice(0, markup.indexOf("</header>"));
    expect(markup.match(/<h1>/gu)).toHaveLength(1);
    expect(hero).toContain("<h1>Profil veröffentlichen. Gefunden werden.</h1>");
    expect(hero).toContain("Nicht blind bewerben. Erst prüfen");
    expect(hero).toContain("Kostenlos Profil anlegen");
    expect(hero).toContain("Schon registriert? Anmelden");
    // Die Profilvorschau steht im ersten Bildschirm, neben dem Knopf.
    expect(hero).toContain("So sehen Unternehmen Ihr Profil");
  });

  it("keeps every explanation, but in info bubbles instead of sections", () => {
    const markup = renderToStaticMarkup(createElement(FreelancerAuthGate));
    for (const fact of onboardingFacts(true)) {
      expect(markup).toContain(fact.chip);
      expect(markup).toContain('role="tooltip"');
    }
    for (const entry of APPLICANT_FAQ) expect(markup).toContain(entry.label);
    expect(markup).not.toContain("Was Sie erwartet.");
    expect(markup).not.toContain("Ein Profil, drei Wege.");
    expect(markup).not.toContain("<details");
    expect(markup.match(/Kostenlos Profil anlegen/gu)).toHaveLength(1);
  });

  it("places notices after the first screen and omits the match protocol", () => {
    const markup = renderToStaticMarkup(
      createElement(FreelancerAuthGate, {
        notices: createElement("p", null, "HINWEIS"),
      }),
    );
    expect(markup.indexOf("HINWEIS")).toBeGreaterThan(markup.indexOf("</header>"));
    expect(markup).not.toContain("Match-Protokoll");
    expect(markup).not.toContain("Vom Profil zum nachvollziehbaren Match");
  });

  it("speaks to people who are not self-employed yet, without promising placement or benefits", () => {
    const markup = renderToStaticMarkup(createElement(FreelancerAuthGate));
    expect(markup).toContain("Auch ohne Selbstständigkeit");
    expect(markup).toContain("Auch für feste Stellen");
    expect(markup).toContain("Gründungszuschuss");
    expect(markup).toContain("Einstiegsgeld");
    expect(markup).not.toMatch(/Arbeitnehmerüberlassung|ANÜ|garantiert|Anspruch auf/u);
  });

  it("shows an example card that is marked as such and links nowhere", () => {
    const markup = renderToStaticMarkup(createElement(FreelancerAuthGate));
    expect(markup).toContain("So sehen Unternehmen Ihr Profil");
    expect(markup).toContain("Anna Beispiel");
    expect(markup).toContain("Ein ausgedachtes Profil.");
    expect(markup).not.toContain("/profil/");
  });
});
