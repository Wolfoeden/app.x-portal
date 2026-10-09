import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { metadata as findMetadata } from "@/app/(marketing)/freelancer-finden/page";
import { FreelancerLanding as FindPage } from "@/components/marketing/FreelancerLanding";
import ItPage, { metadata as itMetadata } from "@/app/(marketing)/it-freelancer-finden/page";
import MatchingPage, { metadata as matchingMetadata } from "@/app/(marketing)/ki-freelancer-matching/page";
import PricingPage, { metadata as pricingMetadata } from "@/app/(marketing)/preise/page";
import HowPage, { metadata as howMetadata } from "@/app/(marketing)/wie-funktioniert-xportal/page";
import MarketingLayout from "@/app/(marketing)/layout";
import { CreditSummary } from "@/components/marketing/CreditSummary";
import { CREDIT_PLANS, CREDIT_PRICES } from "@/lib/ai/credit-policy";
import { PUBLIC_PRICING_PLANS } from "@/lib/billing/plans";
import { SKILL_TAXONOMY } from "@/lib/domain/skill-taxonomy";
import { MARKETING_CATEGORIES } from "@/lib/marketing-categories";
import { MARKETING_PAGE, MARKETING_PAGES, absoluteUrl, pageMetadata } from "@/lib/seo";

const routes = [
  { Component: FindPage, page: MARKETING_PAGE.find, metadata: findMetadata, required: ["Kundenanfrage rein", "Projektbeschreibung", "Roman D.", "210", "Profile online", "Familienunternehmen", "51 %", "3 Wochen"] },
  { Component: ItPage, page: MARKETING_PAGE.it, metadata: itMetadata, required: ["IT-Freelancer", "React", "SAP", "Verfügbarkeit"] },
  { Component: MatchingPage, page: MARKETING_PAGE.matching, metadata: matchingMetadata, required: ["regelbasiert", "KI-gestütztes", "Nicht belegt"] },
  { Component: HowPage, page: MARKETING_PAGE.how, metadata: howMetadata, required: ["Requirement Extraction", "Credits", "Informationslücken"] },
  { Component: PricingPage, page: MARKETING_PAGE.pricing, metadata: pricingMetadata, required: ["14 Tage", "Karte bei Stripe", "Credits insgesamt", "keine Vermittlungsprovision"] },
];

describe("marketing pages rendered on the server", () => {
  it("covers every public marketing route", () => {
    expect(routes.map(({ page }) => page.path).sort()).toEqual(MARKETING_PAGES.map((page) => page.path).sort());
    expect(routes).toHaveLength(5);
  });

  for (const { Component, page, metadata, required } of routes) {
    it(page.path + " exposes meaningful German content, navigation and metadata before hydration", () => {
      const html = renderToStaticMarkup(createElement(MarketingLayout, null, createElement(Component)));
      const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/u)?.[1] ?? "";
      const text = main.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gu, "").replace(/<[^>]+>/gu, " ");
      expect(html.match(/<main\b/gu)).toHaveLength(1);
      expect(html.match(/<h1\b/gu)).toHaveLength(1);
      expect(text.length).toBeGreaterThan(1800);
      for (const phrase of required) expect(text).toContain(phrase);
      expect(main).toMatch(/href="(?:\/chat(?:\?checkout=[a-z]+)?|\/preise#tarife|#tarife)"/u);
      expect(metadata).toEqual(pageMetadata(page));
      expect(metadata.alternates?.canonical).toBe(absoluteUrl(page.path));
      for (const related of MARKETING_PAGES.filter((item) => item.path !== page.path)) {
        expect(main).toContain('href="' + related.path + '"');
      }
      const ids = [...html.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
      expect(new Set(ids).size).toBe(ids.length);
      for (const [, target] of html.matchAll(/href="#([^"]+)"/gu)) expect(ids).toContain(target);
      const json = [...main.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gu)];
      const types = json.map((match) => JSON.parse(match[1]!)["@type"]);
      // Die Startseite beschreibt zusätzlich Leistung und sichtbare FAQ
      // (Oktober 2026, für Suchmaschinen und KI-Systeme); die übrigen
      // Ratgeberseiten bleiben bei der Brotkrümelnavigation.
      expect(types).toEqual(page.path === "/freelancer-finden" ? ["BreadcrumbList", "SoftwareApplication", "FAQPage"] : ["BreadcrumbList"]);
      const breadcrumb = JSON.parse(json[0][1]);
      expect(breadcrumb.itemListElement.at(-1).item).toBe(absoluteUrl(page.path));
      expect(html).not.toContain('"@type":"Article"');
    });
  }

  it("only uses skills that exist in the current product taxonomy", () => {
    const skills = new Set(SKILL_TAXONOMY.map((skill) => skill.canonical));
    for (const category of MARKETING_CATEGORIES) {
      expect(category.skills.length).toBeGreaterThan(0);
      for (const skill of category.skills) expect(skills.has(skill), skill).toBe(true);
    }
  });

  it("routes the root through product context and keeps the direct app entry", () => {
    const root = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
    const chat = readFileSync(new URL("../app/chat/page.tsx", import.meta.url), "utf8");
    // Permanent (308), damit die Signale der Domain bei der Landingpage landen.
    expect(root).toContain('permanentRedirect("/freelancer-finden")');
    expect(chat).toContain("return <ChatWorkspace />");
  });
});

describe("costs derived from product policy", () => {
  it("renders every plan and the actual feature prices", () => {
    const html = renderToStaticMarkup(createElement(CreditSummary));
    expect(html).toContain(String(CREDIT_PRICES.project_brief.credits) + " Credits");
    expect(html).toContain(String(CREDIT_PRICES.research.credits) + " Credits");
    expect(html).toContain("90 einmalig");
    for (const plan of PUBLIC_PRICING_PLANS.filter(plan => plan.billingModel === "fixed_monthly")) {
      const row = html.match(new RegExp('<tr data-plan="' + plan.id + '">([\\s\\S]*?)</tr>', "u"))?.[1];
      expect(row).toContain(plan.label);
      if (plan.billingModel === "fixed_monthly") {
        expect(row).toContain(new Intl.NumberFormat("de-DE").format(plan.monthlyCredits));
      } else {
        expect(row).toContain("Nach Verbrauch");
      }
    }
    expect(html).toContain("zzgl. USt.");
    expect(html).toContain("nicht kumuliert");
    expect(html).toContain("Freelancer-Honorare");
  });

  it("follows changed policy values, including cents, without updating the component", () => {
    const oldPrice = CREDIT_PRICES.project_brief.credits;
    const oldPlan = { ...CREDIT_PLANS.business };
    try {
      // A regression test for duplicated literals: alter the source, then render.
      Object.assign(CREDIT_PRICES.project_brief, { credits: 7 });
      Object.assign(CREDIT_PLANS.business, { monthlyCredits: 427, priceNetCents: 4_750 });
      const html = renderToStaticMarkup(createElement(CreditSummary));
      expect(html).toContain("7 Credits");
      const row = html.match(/<tr data-plan="business">([\s\S]*?)<\/tr>/u)?.[1];
      expect(row).toContain("427");
      expect(row).toContain("47,50");
    } finally {
      Object.assign(CREDIT_PRICES.project_brief, { credits: oldPrice });
      Object.assign(CREDIT_PLANS.business, oldPlan);
    }
  });
});
