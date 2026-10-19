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
  it("never revives new commissions", () => {
    for (const html of [landing(), pricing()]) {
      expect(html).toContain("provisionsfrei");
      expect(html).not.toMatch(/10 % Honorar|Zahlen bei Beauftragung|Kostenlos bis zur Beauftragung/u);
    }
  });
  // 14.10.2026: Der Kopf hat eine Hauptaktion; Hinweistext und Ablauf-Link
  // darunter sind weg, das Video steht weiter unten (#produktablauf).
  it("keeps the hero to one action, without walkthrough text or trial terms", () => {
    const hero = landing().match(/<header\b[\s\S]*?<\/header>/u)?.[0] ?? "";
    expect(hero).toContain("Passende Freelancer finden");
    for (const phrase of ["Produktablauf ansehen", "Die Analyse startet", "trainieren keine KI"]) expect(hero).not.toContain(phrase);
    expect(landing()).not.toContain("So funktioniert der Talent Index");
    expect(hero).not.toContain("14 Tage kostenlos testen");
    for (const phrase of ["Karte bei Stripe erforderlich", "Credits insgesamt", "automatischer Verlängerung", "Vor Trial-Ende kündigen"]) expect(hero).not.toContain(phrase);
  });
  it("offers the three monthly plans at their configured prices", () => {
    const html = pricing();
    expect(html).toContain('id="tarife"');
    for (const plan of PUBLIC_PRICING_PLANS.filter(p => p.billingModel === "fixed_monthly")) {
      expect(html).toContain(`/anmelden?checkout=${plan.id}`);
      expect(html).toContain(`${plan.euro} €`);
      expect(html).toContain(plan.label);
    }
    expect(html).toContain("zzgl. USt.");
    expect(html).toContain("Keine vorzeitige Abbuchung");
  });
  it("addresses recruiters with the established product profile visual", () => {
    const html = landing();
    expect(html.match(/<h1[\s>]/gu)).toHaveLength(1);
    for (const phrase of ["Weniger Bewerbungen", "Mehr relevante Gespräche", "Projektbeschreibung", "Roman D.", "Senior Blockchain &amp; AI Automation Specialist", "KI &amp; Agenten", "Profil geprüft", "Muss · belegt", "im Erstgespräch klären", "Experte kontaktieren"]) expect(html).toContain(phrase);
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
    expect(pricing()).toContain("/fuer-unternehmen#produktablauf");
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
    expect(html.indexOf("Projekt abgleichen")).toBeLessThan(html.indexOf("Gespräch vereinbaren"));
    expect(html).toContain('href="/contact/freelancer?von=hero"');
    expect(html).not.toContain("/gespraech");
    expect(html).toContain('href="/bewerber-portal/apply"');
    expect(html).not.toContain("Kostenlos suchen");
  });
});
