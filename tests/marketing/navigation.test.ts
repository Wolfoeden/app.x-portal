import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicFooter, PublicHeader } from "@/components/public/PublicChrome";
import nextConfig from "@/next.config";
import { MARKETING_PAGE } from "@/lib/seo";

// 16.10.2026 (Entwurf 3): oben nur Live-Demo, Leistungen, Preise, Über uns;
// rechts Anmelden, Telefon und „Erstgespräch buchen“ (weiß, keine Limette).
describe("public navigation", () => {
  const header = renderToStaticMarkup(createElement(PublicHeader));
  const framed = renderToStaticMarkup(createElement(PublicHeader, { framed: true }));
  const footer = renderToStaticMarkup(createElement(PublicFooter));
  const bar = header.slice(header.indexOf('aria-label="Hauptnavigation"'), header.indexOf("</nav>"));

  it("shows four ways in the bar, all leading into the start page or the prices", () => {
    expect([...bar.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)</gu)].map((match) => [match[2], match[1]])).toEqual([
      ["Live-Demo", "/#demo"],
      ["Leistungen", "/#leistungen"],
      ["Preise", "/preise"],
      ["Über uns", "/#ueber"],
    ]);
    expect(header).not.toContain("Für Unternehmen");
    expect(header).not.toContain("Kostenlos starten");
  });

  it("books the first call from the header and shows the phone number", () => {
    expect(header).toMatch(/href="https:\/\/calendly\.com\/romandering\/30min\?utm_source=x-portal"[^>]*>Erstgespräch buchen</u);
    expect(header).toContain('href="tel:+491758934338"');
    expect(header).toMatch(/href="\/anmelden"[^>]*>Anmelden</u);
    expect(framed).toContain('data-framed="true"');
  });

  it("keeps Talent Index, Kontakt and Bewerber-Portal in the phone menu and the footer", () => {
    for (const html of [header, footer]) {
      expect(html).toMatch(/href="\/fuer-unternehmen"[^>]*>Talent Index</u);
      expect(html).toMatch(/href="\/contact"[^>]*>Kontakt</u);
      expect(html).toMatch(/href="\/bewerber-portal\/apply"[^>]*>Bewerber-Portal</u);
    }
    expect(header).not.toContain("Freelancer-Portal");
  });

  it("brands every page with a link to the start page", () => {
    expect(header).toMatch(/aria-label="XPORTAL – Startseite" href="\/"/u);
  });

  it("serves the Talent Index landing page at /fuer-unternehmen", () => {
    expect(MARKETING_PAGE.find.path).toBe("/fuer-unternehmen");
  });

  it("keeps old links working with permanent redirects", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "/home", destination: "/", permanent: true }),
      expect.objectContaining({ source: "/freelancer-finden", destination: "/fuer-unternehmen", permanent: true }),
      expect.objectContaining({ source: "/freelancer/apply", destination: "/bewerber-portal/apply", permanent: true }),
    ]));
  });
});
