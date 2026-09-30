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

  it("puts the placement fee with a worked example above the credit plans", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    const html = renderToStaticMarkup(createElement(PricingPage));
    expect(html).toContain("Kostenlos suchen.");
    expect(html).toContain("Zahlen bei Beauftragung.");
    // 600 € × 60 Tage × 10 %
    expect(html).toMatch(/3\.600\s€ netto/u);
    expect(html.indexOf("placement-title")).toBeLessThan(html.indexOf('aria-label="Tarife"'));
    expect(PLACEMENT_TERMS.status).toBe("approved");
  });
});
