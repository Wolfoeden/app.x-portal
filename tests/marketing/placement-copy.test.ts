import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import PricingPage from "@/app/(marketing)/preise/page";
import { FreelancerLanding } from "@/components/marketing/FreelancerLanding";
import { PLACEMENT_TERMS } from "@/lib/placement/config";
import { PUBLIC_PRICING_PLANS } from "@/lib/billing/plans";
afterEach(() => vi.unstubAllEnvs());
const landing = () => renderToStaticMarkup(createElement(FreelancerLanding));
const pricing = () => renderToStaticMarkup(createElement(PricingPage));
describe("recruiting SaaS commercial contract", () => {
  it.each(["true", "false"])("never revives new commissions with legacy flag %s", flag => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", flag);
    for (const html of [landing(), pricing()]) {
      expect(html).toContain("provisionsfrei");
      expect(html).not.toMatch(/10 % Honorar|Zahlen bei Beauftragung|Kostenlos bis zur Beauftragung/u);
    }
  });
  it("keeps the primary CTA clean in the hero", () => {
    const hero = landing().match(/<header\b[\s\S]*?<\/header>/u)?.[0] ?? "";
    expect(hero).toContain("14 Tage kostenlos testen");
    for (const phrase of ["Karte bei Stripe erforderlich", "Credits insgesamt", "automatischer Verlängerung", "Vor Trial-Ende kündigen"]) expect(hero).not.toContain(phrase);
  });
  it("offers the three monthly plans at their configured prices", () => {
    const html = pricing();
    expect(html).toContain('id="tarife"');
    for (const plan of PUBLIC_PRICING_PLANS.filter(p => p.billingModel === "fixed_monthly")) {
      expect(html).toContain(`/chat?checkout=${plan.id}`);
      expect(html).toContain(`${plan.euro} €`);
      expect(html).toContain(plan.label);
    }
    expect(html).toContain("zzgl. USt.");
    expect(html).toContain("Keine vorzeitige Abbuchung");
  });
  it("addresses recruiters with the established product profile visual", () => {
    const html = landing();
    expect(html.match(/<h1[\s>]/gu)).toHaveLength(1);
    for (const phrase of ["Kundenanfrage rein", "Projektbeschreibung", "Amelie D.", "KI-Entwicklerin", "Profilbeleg", "Offener Punkt"]) expect(html).toContain(phrase);
    expect(html).not.toContain("Freelancer finden für Recruiter und IT-Personaldienstleister");
    expect(html).not.toContain("Nächster Schritt");
    expect(html).not.toMatch(/frei erfunden|Beispielprofil A/u);
  });
  it("shows the illustrations for matching and the conversation at the table", () => {
    const html = landing();
    expect(html).toContain("project-match.webp");
    expect(html).toContain("project-conversation.webp");
    expect(html).toContain("am Tisch");
  });
  it("links the pricing page demo to an anchor the landing page has", () => {
    expect(pricing()).toContain("/freelancer-finden#produktablauf");
    expect(landing()).toContain('id="produktablauf"');
  });
  it("preserves historical fee terms while excluding them from new charges", () => {
    expect(PLACEMENT_TERMS.feePercent).toBe(10);
    expect(PLACEMENT_TERMS.version).toBe("vermittlung-2026-09-1");
    expect(pricing()).toContain("Historische Verträge bleiben unverändert");
    expect(pricing()).toContain("keine Vermittlungsprovision");
  });
  it("keeps the operator call and freelancer signup secondary to self service", () => {
    const html = landing();
    expect(html.indexOf("14 Tage kostenlos testen")).toBeLessThan(html.indexOf("Gespräch buchen"));
    expect(html).toContain('href="/gespraech?von=hero"');
    expect(html).toContain('href="/freelancer/apply"');
    expect(html).not.toContain("Kostenlos suchen");
  });
});
