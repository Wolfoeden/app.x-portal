import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import DataFlowsPage from "@/app/datenwege/page";
import { GET as llmsText } from "@/app/llms.txt/route";
import { FreelancerLanding } from "@/components/marketing/FreelancerLanding";
import { faqAnswerText, landingFaq } from "@/components/marketing/landing-faq";
import { PROVIDER_ADDRESS } from "@/lib/legal/policy";
import { LLMS_DATA_FACTS } from "@/lib/marketing/llms-facts";
import { PUBLIC_PRICING_PLANS, TRIAL_CREDITS } from "@/lib/billing/plans";
import { siteStructuredData } from "@/lib/structured-data";

type Node = Record<string, unknown>;

function jsonLd(html: string): Node[] {
  return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gsu)].map((match) => JSON.parse(match[1]!) as Node);
}

/**
 * Text ohne Markup, für den Vergleich mit Sätzen. Wiederholt, bis keine Tags
 * mehr übrig sind; Eingabe ist ausschließlich eigenes Server-Rendering.
 */
function textOf(html: string): string {
  let text = html;
  for (let previous = ""; previous !== text;) {
    previous = text;
    text = text.replace(/<[^>]*>/gu, "");
  }
  return text.replace(/\s+/gu, " ");
}

afterEach(() => vi.unstubAllEnvs());

// Oktober 2026: Für Suchmaschinen und KI-Systeme stehen auf der Startseite
// Leistung und Fragen als strukturierte Daten — nur, was dort auch sichtbar ist.
describe("landing page structured data", () => {
  it("mirrors the visible FAQ question for question", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    const html = renderToStaticMarkup(createElement(FreelancerLanding));
    const faq = jsonLd(html).find((node) => node["@type"] === "FAQPage")!;
    const entities = faq.mainEntity as { name: string; acceptedAnswer: { text: string } }[];
    const items = landingFaq();
    expect(entities.map((entity) => entity.name)).toEqual(items.map((item) => item.question));
    expect(entities.map((entity) => entity.acceptedAnswer.text)).toEqual(items.map(faqAnswerText));
    // Sichtbar steht jede Frage und jedes Textstück ihrer Antwort im
    // FAQ-Abschnitt, nicht nur in den strukturierten Daten.
    const start = html.indexOf('id="fragen"');
    const section = html.slice(start, html.indexOf("</section>", start));
    for (const item of items) {
      expect(section).toContain(`<summary>${item.question}</summary>`);
      for (const part of item.answer) expect(section).toContain(typeof part === "string" ? part : `>${part.label}</a>`);
    }
  });

  it("describes software prices and trial disclosure", () => {
    const html = renderToStaticMarkup(createElement(FreelancerLanding));
    const software = jsonLd(html).find(node => node["@type"] === "SoftwareApplication")!;
    const offers = software.offers as { price: number; description: string }[];
    expect(offers.map(offer => offer.price)).toEqual(PUBLIC_PRICING_PLANS.filter(plan => plan.billingModel === "fixed_monthly").map(plan => plan.euro));
    for (const offer of offers) { expect(offer.description).toContain("Trial mit Karte"); expect(offer.description).toContain(String(TRIAL_CREDITS)); }
    expect(software).not.toHaveProperty("aggregateRating");
  });

  it("cannot reintroduce commission through the legacy flag", () => {
    for (const flag of ["true", "false"]) {
      vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", flag);
      const html = renderToStaticMarkup(createElement(FreelancerLanding));
      expect(JSON.stringify(jsonLd(html))).not.toContain("10 %");
      expect(html).toContain("provisionsfrei");
    }
  });

  it("states the imprint address and the regions without social proof", () => {
    const organization = siteStructuredData()["@graph"][0] as Node;
    const address = organization.address as Record<string, string>;
    expect(`${address.streetAddress}, ${address.postalCode} ${address.addressLocality}`).toBe(PROVIDER_ADDRESS);
    expect(address.addressCountry).toBe("DE");
    expect(JSON.stringify(organization.areaServed)).toContain("Europäische Union");
    expect(organization.knowsAbout).toContain("AI Agents");
    expect(organization).not.toHaveProperty("aggregateRating");
  });

  it("keeps the FAQ answers free of markup", () => {
    for (const item of [...landingFaq(), ...landingFaq()]) {
      expect(faqAnswerText(item)).not.toMatch(/[<>]/u);
    }
  });
});

describe("llms.txt for AI search systems", () => {
  it("only repeats data-flow facts that the data-flow page states", async () => {
    const page = textOf(renderToStaticMarkup(createElement(DataFlowsPage)));
    const text = await llmsText().text();
    for (const fact of LLMS_DATA_FACTS) {
      expect(page, fact).toContain(fact);
      expect(text).toContain(fact);
    }
    // Keine Zusage, die /datenwege nicht macht.
    expect(text).not.toMatch(/vollständig in der EU|AI[- ]Act[- ]konform|DSGVO-zertifiziert/iu);
  });

  it("names AI agents, the regions and the provider in Germany", async () => {
    const text = await llmsText().text();
    expect(text).toContain("Freelancer für KI-Agenten (AI Agents) finden");
    expect(text).toContain("Deutschland, Österreich, der Schweiz und der übrigen EU");
    expect(text).toContain(PROVIDER_ADDRESS);
    expect(text).toContain("keine automatische Auswahl- oder Beauftragungsentscheidung");
  });
});
