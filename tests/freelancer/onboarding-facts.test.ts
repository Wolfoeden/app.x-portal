import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ApplicantLanding } from "@/app/bewerber-portal/apply/ApplicantLanding";
import { APPLICANT_FAQ, onboardingFacts } from "@/app/bewerber-portal/apply/applicant-copy";

function fact(term: string): string {
  return onboardingFacts().find((entry) => entry.term === term)!.text;
}

// Audit P2: Bewerber sollen Kosten, Unterlagen, Prüfumfang und Ablauf vor der
// Registrierung einschätzen können. UX-Review Oktober 2026: der eigene Nutzen
// (Kosten, Kontakt) vor dem Prüfprozess.
describe("freelancer onboarding before registration", () => {
  it("names costs and contact first, then the process, the check and the documents", () => {
    expect(onboardingFacts().map((entry) => entry.term)).toEqual(["Kosten", "Kontakt", "Ablauf", "Prüfung", "Unterlagen"]);
  });

  it("explains how companies get in touch without exposing contact details", () => {
    expect(fact("Kontakt")).toContain("ohne E-Mail-Adresse und Telefonnummer");
    expect(fact("Kontakt")).toContain("stellt Sie per E-Mail vor");
  });

  it("promises no fee to anyone", () => {
    // Neue Vorgänge sind provisionsfrei, auch für Auftraggeber.
    expect(fact("Kosten")).toContain("eine Provision fällt für niemanden an");
    expect(fact("Kosten")).not.toContain("Vermittlungshonorar");
  });

  it("states what the form actually requires", () => {
    const documents = fact("Unterlagen");
    expect(documents).toContain("Lebenslauf als PDF (bis 10 MB) hilft");
    expect(documents).toContain("ein Kalenderlink ist optional");
  });

  it("does not promise a competence check", () => {
    expect(fact("Prüfung")).toContain("gleicht einzelne später mit Nachweisen ab");
    expect(fact("Prüfung")).toContain("Angaben laut Freelancer");
    expect(fact("Prüfung")).not.toMatch(/Kompetenz(prüfung|test)/u);
  });

  // Oktober 2026: Die Kernbotschaft oben, daneben die Beispielkarte; der
  // Desktop-Entwurf zeigt die Fakten danach offen über die volle Breite.
  it("leads with the core message and a sign-up button", () => {
    const markup = renderToStaticMarkup(createElement(ApplicantLanding));
    const hero = markup.slice(0, markup.indexOf("</header>"));
    expect(markup.match(/<h1>/gu)).toHaveLength(1);
    expect(hero).toContain("<h1>Profil veröffentlichen. <span>Gefunden werden.</span></h1>");
    expect(hero).toContain("Nicht blind bewerben. Erst prüfen");
    expect(hero).toContain("Kostenlos Profil anlegen");
    expect(hero).toContain("Schon registriert? Anmelden");
    // Die Profilvorschau steht im ersten Bildschirm, neben dem Knopf.
    expect(hero).toContain("So sehen Unternehmen Ihr Profil");
  });

  it("states every fact before registration openly, the process as steps and the questions as cards", () => {
    const markup = renderToStaticMarkup(createElement(ApplicantLanding));
    for (const fact of onboardingFacts().filter((entry) => entry.term !== "Ablauf")) {
      expect(markup).toContain(fact.chip);
      expect(markup).toContain(fact.text);
    }
    // Seit 21.10.2026 erst das Formular, dann das Konto, dann sofort sichtbar.
    for (const step of ["Profil ausfüllen", "Konto bestätigen", "Sofort sichtbar", "Gefunden werden"]) expect(markup).toContain(step);
    expect(markup).toContain("Drei Minuten, ohne Lebenslauf.");
    for (const entry of APPLICANT_FAQ) {
      expect(markup).toContain(entry.question);
      expect(markup).toContain(entry.answer);
    }
    expect(markup).toContain('id="fragen"');
    expect(markup).not.toContain('role="tooltip"');
    expect(markup).not.toContain("<details");
    // Erster Bildschirm und Abschluss; der Seitenkopf trägt einen dritten.
    expect(markup.match(/Kostenlos Profil anlegen/gu)).toHaveLength(2);
  });

  it("places notices after the first screen and omits the match protocol", () => {
    const markup = renderToStaticMarkup(
      createElement(ApplicantLanding, {
        notices: createElement("p", null, "HINWEIS"),
      }),
    );
    expect(markup.indexOf("HINWEIS")).toBeGreaterThan(markup.indexOf("</header>"));
    expect(markup).not.toContain("Match-Protokoll");
    expect(markup).not.toContain("Vom Profil zum nachvollziehbaren Match");
  });

  it("speaks to people who are not self-employed yet, without promising placement or benefits", () => {
    const markup = renderToStaticMarkup(createElement(ApplicantLanding));
    expect(markup).toContain("Auch ohne Selbstständigkeit");
    expect(markup).toContain("Auch für feste Stellen");
    expect(markup).toContain("Gründungszuschuss");
    expect(markup).toContain("Einstiegsgeld");
    expect(markup).not.toMatch(/Arbeitnehmerüberlassung|ANÜ|garantiert|Anspruch auf/u);
  });

  it("shows an example card that is marked as such and links nowhere", () => {
    const markup = renderToStaticMarkup(createElement(ApplicantLanding));
    expect(markup).toContain("So sehen Unternehmen Ihr Profil");
    expect(markup).toContain("Anna Beispiel");
    expect(markup).toContain("Ein ausgedachtes Profil.");
    expect(markup).not.toContain("/profil/");
  });
});
