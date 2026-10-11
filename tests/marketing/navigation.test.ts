import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicHeader } from "@/components/public/PublicChrome";
import nextConfig from "@/next.config";
import { MARKETING_PAGE } from "@/lib/seo";

// Oktober 2026: „Für Unternehmen“ als Menü (Talent Index, Compliance Check,
// KI-Webinar), „Bewerber-Portal“ statt „Freelancer-Portal“, neue Adressen.
describe("public navigation", () => {
  const header = renderToStaticMarkup(createElement(PublicHeader));

  it("groups the company offers under one menu", () => {
    expect(header).toContain("Für Unternehmen");
    expect(header).toContain('href="/chat"');
    expect(header).toMatch(/href="\/chat"[^>]*>Talent Index</u);
    expect(header).toMatch(/href="\/contact\?betreff=Compliance%20Check"[^>]*>Compliance Check</u);
    expect(header).toMatch(/href="\/contact\?betreff=KI-Webinar"[^>]*>KI-Webinar</u);
    expect(header).not.toContain("Freelancer Index");
  });

  it("calls the applicant side Bewerber-Portal at its new address", () => {
    expect(header).toMatch(/href="\/bewerber-portal\/apply"[^>]*>Bewerber-Portal</u);
    expect(header).not.toContain("Freelancer-Portal");
  });

  it("serves the company landing page at /fuer-unternehmen", () => {
    expect(MARKETING_PAGE.find.path).toBe("/fuer-unternehmen");
  });

  it("keeps old links working with permanent redirects", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "/freelancer-finden", destination: "/fuer-unternehmen", permanent: true }),
      expect.objectContaining({ source: "/freelancer/apply", destination: "/bewerber-portal/apply", permanent: true }),
    ]));
  });
});
