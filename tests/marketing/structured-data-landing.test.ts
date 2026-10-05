import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import DataFlowsPage from "@/app/datenwege/page";
import { GET as llmsText } from "@/app/llms.txt/route";
import { FreelancerLanding } from "@/components/marketing/FreelancerLanding";
import { faqAnswerText, landingFaq } from "@/components/marketing/landing-faq";
import { PROVIDER_ADDRESS } from "@/lib/legal/policy";
import { LLMS_DATA_FACTS } from "@/lib/marketing/llms-facts";
import { PLACEMENT_TERMS } from "@/lib/placement/config";
import { siteStructuredData } from "@/lib/structured-data";

type Node = Record<string, unknown>;

function jsonLd(html: string): Node[] {
  return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gsu)].map((match) => JSON.parse(match[1]!) as Node);
}

function visibleText(html: string): string {
  return html
    .replace(/<script\b[^>]*>.*?<\/script>/gsu, "")
    .replace(/<!-- -->/gu, "")
    .replace(/<[^>]+>/gu, "")
    .replace(/&quot;/gu, "\"")
    .replace(/&amp;/gu, "&")
    .replace(/\s+/gu, " ");
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
    const items = landingFaq(true);
    expect(entities.map((entity) => entity.name)).toEqual(items.map((item) => item.question));
    const text = visibleText(html);
    const normal = (value: string) => value.replace(/\s+/gu, " ");
    for (const entity of entities) {
      expect(text).toContain(normal(entity.name));
      expect(text).toContain(normal(entity.acceptedAnswer.text));
    }
  });

  it("describes the service with the fee from the placement terms and the AI agent role", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    const html = renderToStaticMarkup(createElement(FreelancerLanding));
    const service = jsonLd(html).find((node) => node["@type"] === "Service")!;
    expect(JSON.stringify(service.offers)).toContain(`${PLACEMENT_TERMS.feePercent} %`);
    const catalog = JSON.stringify(service.hasOfferCatalog);
    expect(catalog).toContain("AI-Agent-Entwickler");
    expect(catalog).toContain("KI-Agenten");
    expect(service.provider).toEqual({ "@id": "https://x-portal.eu/#organization" });
  });

  it("offers no fee without the placement model", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "false");
    const html = renderToStaticMarkup(createElement(FreelancerLanding));
    const service = jsonLd(html).find((node) => node["@type"] === "Service")!;
    expect(service).not.toHaveProperty("offers");
    const faq = jsonLd(html).find((node) => node["@type"] === "FAQPage")!;
    expect(JSON.stringify(faq)).not.toContain("Was kostet die Vermittlung?");
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
    for (const item of [...landingFaq(true), ...landingFaq(false)]) {
      expect(faqAnswerText(item)).not.toMatch(/[<>]/u);
    }
  });
});

describe("llms.txt for AI search systems", () => {
  it("only repeats data-flow facts that the data-flow page states", async () => {
    const page = renderToStaticMarkup(createElement(DataFlowsPage))
      .replace(/<!-- -->/gu, "")
      .replace(/<[^>]+>/gu, "")
      .replace(/\s+/gu, " ");
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
