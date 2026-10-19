import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { FreelancerLanding } from "@/components/marketing/FreelancerLanding";

afterEach(() => vi.unstubAllEnvs());

describe("landing page inventory total", () => {
  // Desktop-Entwurf (Oktober 2026): Unter dem Kopf stehen vier Zusagen statt
  // einer Bestandszahl; die Seite nennt keine Profilzahl mehr.
  it("shows commitments instead of an inventory number", () => {
    const html = renderToStaticMarkup(createElement(FreelancerLanding));
    for (const commitment of ["Provisionsfrei", "Analysen kostenlos", "Belege je Anforderung", "Ihre Daten bleiben Ihre"]) expect(html).toContain(commitment);
    expect(html).not.toContain("Profile live");
    expect(html).not.toContain("67 freigegebene Profile");
    expect(html).not.toContain("KI &amp; Agenten: 18 Profile");
    expect(html).not.toContain("Projektbeschreibungen analysiert");
  });

  it("keeps the former workflow block out", () => {
    const html = renderToStaticMarkup(createElement(FreelancerLanding));
    expect(html).not.toContain("Ein Arbeitsablauf für Ihre Mandate");
    expect(html).not.toContain("Von der Ausschreibung zur nachvollziehbaren Auswahl");
  });

  it("offers the sales call next to the self-service path with tracked entries", () => {
    const html = renderToStaticMarkup(createElement(FreelancerLanding));
    for (const entry of ["hero", "closing"]) {
      expect(html).toContain(`href="/contact/freelancer?von=${entry}"`);
    }
    expect(html).toContain("14 Tage kostenlos testen");
  });
});
