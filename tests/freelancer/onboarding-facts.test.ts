import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { APPLICANT_PATHS, FreelancerAuthGate, onboardingFacts } from "@/app/freelancer/apply/FreelancerPortal";

// Audit P2: Bewerber sollen Kosten, Unterlagen, Prüfumfang und Ablauf vor der
// Registrierung einschätzen können.
describe("freelancer onboarding before registration", () => {
  it("names costs, documents, the check and the process", () => {
    expect(onboardingFacts(true).map((fact) => fact.term)).toEqual(["Kosten", "Unterlagen", "Prüfung", "Ablauf"]);
  });

  it("says who pays the placement fee only when placement is on", () => {
    expect(onboardingFacts(true)[0]!.text).toContain("das Vermittlungshonorar zahlt der Auftraggeber");
    expect(onboardingFacts(false)[0]!.text).not.toContain("Vermittlungshonorar");
  });

  it("states what the form actually requires", () => {
    const documents = onboardingFacts(true)[1]!.text;
    expect(documents).toContain("Lebenslauf als PDF (bis 10 MB) hilft");
    expect(documents).toContain("ein Kalenderlink ist optional");
  });

  it("does not promise a competence check", () => {
    expect(onboardingFacts(true)[2]!.text).toContain("gleicht einzelne mit Nachweisen ab");
    expect(onboardingFacts(true)[2]!.text).not.toMatch(/Kompetenz(prüfung|test)/u);
  });

  it("shows the facts on the gate before the sign-up button", () => {
    const markup = renderToStaticMarkup(createElement(FreelancerAuthGate));
    expect(markup).toContain("<dt>Kosten</dt>");
    expect(markup.indexOf("<dt>Ablauf</dt>")).toBeLessThan(markup.indexOf("Kostenlos Profil anlegen"));
    expect(markup).toContain("Schon registriert? Anmelden");
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
