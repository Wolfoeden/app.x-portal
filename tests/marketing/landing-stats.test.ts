import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { FreelancerLanding } from "@/components/marketing/FreelancerLanding";
import { MIN_FIELD_PROFILES, summarizeLandingStats } from "@/lib/marketing/landing-stats";

afterEach(() => vi.unstubAllEnvs());

function rows(role: string, count: number) {
  return Array.from({ length: count }, () => ({ role_title: role, skill_tags: [] }));
}

describe("summarizeLandingStats", () => {
  it("counts every active profile and groups them by field, largest first", () => {
    const stats = summarizeLandingStats(
      [...rows("AI Engineer", 5), ...rows("Business Analyst", 4), ...rows("SAP S/4HANA Beraterin", 2), ...rows("", 3)],
      213,
    );
    expect(stats.profiles).toBe(14);
    expect(stats.projects).toBe(213);
    expect(stats.fields.map((field) => [field.field, field.count])).toEqual([
      ["ai", 5],
      ["requirements", 4],
    ]);
  });

  it("leaves out thin fields and the catch-all instead of promising a pool", () => {
    const stats = summarizeLandingStats([...rows("SAP S/4HANA Beraterin", MIN_FIELD_PROFILES - 1), ...rows("IT-Support", 9)], 0);
    expect(stats.fields).toEqual([]);
  });
});

describe("landing page inventory total", () => {
  it("shows the requested concise online total instead of the former breakdown", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    const html = renderToStaticMarkup(
      createElement(FreelancerLanding, {
        stats: { profiles: 67, projects: 1213, fields: [{ field: "ai", label: "KI & Agenten", count: 18 }] },
      }),
    );
    expect(html).toContain(">210</strong><span>Profile online</span>");
    expect(html).not.toContain("67 freigegebene Profile");
    expect(html).not.toContain("KI &amp; Agenten: 18 Profile");
    expect(html).not.toContain("Projektbeschreibungen analysiert");
  });

  it("keeps the total and removes the former workflow block", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    const html = renderToStaticMarkup(createElement(FreelancerLanding));
    expect(html).toContain(">210</strong><span>Profile online</span>");
    expect(html).not.toContain("Ein Arbeitsablauf für Ihre Mandate");
    expect(html).not.toContain("Von der Ausschreibung zur nachvollziehbaren Auswahl");
  });

  it("offers the sales call next to the self-service path with tracked entries", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    const html = renderToStaticMarkup(createElement(FreelancerLanding));
    for (const entry of ["hero"]) {
      expect(html).toContain(`href="/gespraech?von=${entry}"`);
    }
    expect(html).toContain("14 Tage kostenlos testen");
  });
});
