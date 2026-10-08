import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import DataFlowsPage from "@/app/datenwege/page";
import { INDEXABLE_PATHS } from "@/lib/seo";

const text = () => renderToStaticMarkup(createElement(DataFlowsPage)).replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ");

// Audit P2: Datenwege direkt zugänglich; eine EU-Datenbank nicht mit
// ausschließlich europäischer Verarbeitung gleichsetzen.
describe("data flows page", () => {
  it("says the database is in the EU without claiming that everything is", () => {
    const page = text();
    expect(page).toContain("Die Datenbank von XPORTAL liegt in der EU. Das heißt nicht, dass jede Verarbeitung dort stattfindet");
    expect(page).toContain("Sitz in den USA");
    expect(page).toContain("Irland ( eu-west-1 )");
  });

  it("names each step a pasted brief goes through, and what happens only on a click", () => {
    const page = text();
    for (const step of ["1. Speichern", "2. Strukturieren mit KI", "3. Abgleichen", "4. Ausliefern", "5. Weitergeben, nur auf Ihren Schritt", "6. Vertrauliche Ausschreibungen"]) {
      expect(page).toContain(step);
    }
    expect(page).toContain("nicht zum Training von Modellen verwendet");
    expect(page).toContain("bis zu 30 Tage");
  });

  // Oktober 2026: Profil aus Lebenslauf oder Code-Hosting übernehmen.
  it("explains the freelancer import the same way the privacy policy does", () => {
    const page = text();
    expect(page).toContain("7. Für Freelancer: Profil aus Lebenslauf oder Code-Hosting");
    expect(page).toContain("nicht als geprüft");
    const privacy = readFileSync("app/privacy/page.tsx", "utf8").replace(/\s+/gu, " ");
    for (const fact of ["pseudonymen Sicherheitskennung", "Dienst für Code-Hosting", "kein Training mit Ihren Inhalten", "als „geprüft“ gelten sie dadurch nicht"]) {
      expect(privacy).toContain(fact);
    }
  });

  it("states nothing the privacy policy does not already say", () => {
    const privacy = readFileSync("app/privacy/page.tsx", "utf8").replace(/\s+/gu, " ");
    for (const fact of ["eu-west-1", "store: false", "bis zu 30 Tage", "Sitz in den USA", "Sitz in Deutschland", "Mutterunternehmen in den USA"]) {
      expect(privacy).toContain(fact);
    }
  });

  // Die Hinweiszeile unter dem Chat-Eingabefeld nennt die Datenwege nicht
  // mehr (Wunsch des Betreibers, Oktober 2026); erreichbar bleiben sie über
  // Fußzeile, Startseite und Preisseite.
  it("is reachable from the footer, the landing page and the pricing page, and indexed", () => {
    expect(readFileSync("components/ChatWorkspace.tsx", "utf8")).not.toContain('href="/datenwege"');
    expect(readFileSync("components/LegalFooter.tsx", "utf8")).toContain('<Link href="/datenwege">Datenwege</Link>');
    expect(readFileSync("components/marketing/FreelancerLanding.tsx", "utf8")).toContain("/datenwege");
    const pricing = readFileSync("app/(marketing)/preise/page.tsx", "utf8");
    expect(pricing).toContain('href="/datenwege"');
    expect(pricing).not.toContain(`title: "Hosting und Datenbank in der EU"`);
    expect(pricing).toContain("Datenwege ansehen");
    expect(INDEXABLE_PATHS).toContain("/datenwege");
  });
});
