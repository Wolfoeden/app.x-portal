import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicHeader } from "@/components/public/PublicChrome";
import nextConfig from "@/next.config";
import { MARKETING_PAGE } from "@/lib/seo";

// Oktober 2026: „Für Unternehmen“ als Menü in zwei Gruppen (selbst finden:
// Talent Index; mit uns umsetzen: KI-Agenten, KI-Schulungen, Cybersecurity &
// ISO 27001), „Bewerber-Portal“ statt „Freelancer-Portal“, neue Adressen.
describe("public navigation", () => {
  const header = renderToStaticMarkup(createElement(PublicHeader));

  it("groups the company offers under one menu", () => {
    expect(header).toContain("Für Unternehmen");
    expect(header).toContain('href="/chat"');
    expect(header).toMatch(/href="\/chat"[^>]*>Talent Index</u);
    expect(header).toContain("Selbst finden");
    expect(header).toContain("Mit uns umsetzen");
    expect(header).toMatch(/href="\/contact#ki-agenten"[^>]*><strong>KI-Agenten</u);
    expect(header).toMatch(/href="\/contact#ki-schulungen"[^>]*><strong>KI-Schulungen</u);
    expect(header).toMatch(/href="\/contact#informationssicherheit"[^>]*><strong>Cybersecurity &amp; ISO 27001</u);
    expect(header).not.toContain("Freelancer Index");
  });

  it("puts Kontakt into the main navigation, not only into the footer", () => {
    expect(header).toMatch(/href="\/contact"[^>]*>Kontakt</u);
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
