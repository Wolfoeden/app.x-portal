import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { APPLICANT_PATHS, APPLY_HERO, FreelancerAuthGate, onboardingFacts } from "@/app/freelancer/apply/FreelancerPortal";

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

  it("says who pays the placement fee only when placement is on", () => {
    expect(fact("Kosten")).toContain("das Vermittlungshonorar zahlt der Auftraggeber");
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

  it("leads with the benefit and a sign-up button, naming cost and review before it", () => {
    const markup = renderToStaticMarkup(createElement(FreelancerAuthGate));
    const hero = markup.slice(0, markup.indexOf("</header>"));
    expect(markup.match(/<h1>/gu)).toHaveLength(1);
    expect(hero).toContain(`<h1>${APPLY_HERO.title}</h1>`);
    expect(hero).toContain("Erstellen Sie Ihr kostenloses Profil.");
    expect(hero).toContain("Kostenlos Profil anlegen");
    expect(hero).toContain("Schon registriert? Anmelden");
    expect(hero).toContain("Sichtbar erst nach der Prüfung durch XPORTAL.");
    // Die Profilvorschau steht im ersten Bildschirm, neben dem Knopf.
    expect(hero).toContain("So sehen Unternehmen Ihr Profil");
  });

  it("shows all facts before the second sign-up button", () => {
    const markup = renderToStaticMarkup(createElement(FreelancerAuthGate));
    const second = markup.indexOf("Kostenlos Profil anlegen", markup.indexOf("</header>"));
    expect(markup).toContain("<dt>Kosten</dt>");
    expect(markup.indexOf("<dt>Unterlagen</dt>")).toBeLessThan(second);
    expect(markup.indexOf("<dt>Unterlagen</dt>")).toBeGreaterThan(markup.indexOf("</header>"));
  });

  it("keeps the three paths, but after the benefit", () => {
    const markup = renderToStaticMarkup(createElement(FreelancerAuthGate));
    expect(markup.indexOf("Ein Profil, drei Wege.")).toBeGreaterThan(markup.indexOf("<dt>Unterlagen</dt>"));
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
    expect(APPLICANT_PATHS.map((path) => path.title)).toEqual([
      "Projekte als Freelancer",
      "Eine feste Stelle",
      "Auf dem Weg in die Selbstständigkeit",
    ]);
    expect(markup).toContain("Muss ich schon selbstständig sein?");
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
