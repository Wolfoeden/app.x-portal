import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import PricingPage from "@/app/(marketing)/preise/page";
import { FreelancerLanding } from "@/components/marketing/FreelancerLanding";
import { PLACEMENT_TERMS } from "@/lib/placement/config";

afterEach(() => vi.unstubAllEnvs());

describe("public copy with the placement model on", () => {
  it("offers request and introduction for free and names the fee instead of promising direct booking", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    const html = renderToStaticMarkup(createElement(FreelancerLanding));
    expect(html).toContain("Anfrage und Vorstellung kostenlos");
    expect(html).toContain(`${PLACEMENT_TERMS.feePercent} % Honorar nur bei Beauftragung`);
    expect(html).toContain("Anfragen, wir stellen vor.");
    expect(html).toContain("Was kostet die Vermittlung?");
    expect(html).toContain('href="/vermittlungsbedingungen"');
    expect(html).not.toContain("direkt ein Erstgespräch buchen");
    expect(html).not.toContain("Termin direkt buchen");
    expect(html).not.toContain("Was bedeutet „direkt buchen“?");
  });

  it("keeps the calendar copy while the model is off", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "false");
    const html = renderToStaticMarkup(createElement(FreelancerLanding));
    expect(html).toContain("Termin direkt buchen");
    expect(html).not.toContain("Was kostet die Vermittlung?");
  });

  // UX-Review Oktober 2026: erst der Nutzen und die Tarife, dann die
  // Vermittlung im Detail. Dass eine Anfrage kein Abo braucht, steht schon
  // im Kopf, vor den Tarifen.
  it("opens with the work a plan supports and shows the plans before the placement details", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    const html = renderToStaticMarkup(createElement(PricingPage));
    const plans = html.indexOf('aria-label="Tarife"');
    expect(html).toContain("Vorstellung kostenlos.");
    expect(html).not.toContain("Ein Guthaben.");
    expect(html.indexOf("Welcher Weg passt?")).toBeLessThan(plans);
    expect(html.indexOf("Kein Abo nötig.")).toBeLessThan(plans);
    expect(html).toContain('href="#tarife"');
    expect(html).toContain('id="tarife"');
    expect(html.indexOf("Für Recruiter, die einzelne Kundenanfragen")).toBeGreaterThan(plans);
    // In jeder Karte: erst die Aufgabe, dann der Umfang, dann der Preis.
    const card = html.slice(html.indexOf("Für Recruiter, die einzelne Kundenanfragen"));
    expect(card.indexOf("Reicht im Monat für etwa")).toBeLessThan(card.indexOf("netto pro Monat"));
    expect(html.indexOf("placement-title")).toBeGreaterThan(plans);
  });

  it("still explains the placement fee with a worked example", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    const html = renderToStaticMarkup(createElement(PricingPage));
    expect(html).toContain("Kostenlos anfragen.");
    expect(html).toContain("Zahlen bei Beauftragung.");
    // 600 € × 15 Projekttage × 10 %
    expect(html).toMatch(/900\s€ netto/u);
    expect(html).toContain("nicht schon für Termin oder Erstgespräch");
    expect(PLACEMENT_TERMS.status).toBe("approved");
  });

  it("addresses recruiters first and explains how agencies work with XPORTAL", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    const html = renderToStaticMarkup(createElement(FreelancerLanding));
    const hero = html.slice(0, html.indexOf("</header>"));
    expect(hero).toContain("Recruiter und Personaldienstleister");
    expect(hero).toContain("Ihre Kundenanfrage.");
    // Der Suchbegriff steht am Anfang der einzigen h1.
    expect(html.match(/<h1[\s>]/gu)).toHaveLength(1);
    expect(html).toMatch(/<h1><span class="[^"]*">Freelancer finden für Recruiter und Personaldienstleister<\/span>/u);
    expect(hero).not.toContain("in Ihrem Unternehmen");
    // Die Produktansicht: Anforderung, Beleg, offener Punkt, nächster Schritt.
    const steps = ["Kundenanforderung", "Profilbeleg", "Offener Punkt", "Nächster Schritt"].map((label) => hero.indexOf(label));
    expect(steps.every((index) => index > 0)).toBe(true);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);

    const section = html.slice(html.indexOf('id="zusammenarbeit"'), html.indexOf('id="vermittlung"'));
    expect(section).toContain("So arbeiten Personaldienstleister mit XPORTAL.");
    expect(section).toContain("Wer spricht mit Ihrem Kunden?");
    expect(section).toContain("spricht Ihren Kunden nicht direkt an");
    expect(section).toContain("XPORTAL wird nicht Partei dieses Vertrags.");
    expect(section).toContain(`einmalig ${PLACEMENT_TERMS.feePercent} % des vereinbarten Honorars der ersten ${PLACEMENT_TERMS.feeMonths} Monate, höchstens ${PLACEMENT_TERMS.maxFeeDays} Projekttage`);
    expect(section).toContain('href="/vermittlungsbedingungen"');
  });

  it("does not call the search free: it costs credits", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    const html = renderToStaticMarkup(createElement(FreelancerLanding));
    expect(html).not.toMatch(/Suche, Anfrage|Gespräch, Suche|Kostenlos suchen/u);
    expect(renderToStaticMarkup(createElement(PricingPage))).not.toContain("Kostenlos suchen");
  });

  it("names a real contact person and shows the photo when there is one", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    const without = renderToStaticMarkup(createElement(FreelancerLanding));
    expect(without).toContain("Roman Dering");
    expect(without).toContain(">RD</span>");
    const photo = "/api/freelancer/avatar-image/c314d7c4-4428-45ac-ba54-1a657b9f6b62/avatar-abc.webp";
    const withPhoto = renderToStaticMarkup(createElement(FreelancerLanding, { contactPhotoUrl: photo }));
    expect(withPhoto).toContain(photo);
    expect(withPhoto).toContain('aria-label="Foto von Roman Dering"');
  });
});
