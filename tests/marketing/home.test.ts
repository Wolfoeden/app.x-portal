import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeLanding } from "@/components/home/HomeLanding";
import { PraxisView } from "@/components/praxis/PraxisView";
import { DEMO_FACES, DEMO_SCENARIOS } from "@/lib/marketing/live-demo";
import { praxisCases } from "@/lib/marketing/praxis-cases";
import { PROOF_SOURCES } from "@/lib/marketing/proof-sources";

// 16.10.2026 (Entwurf 3): die Startseite zeigt zuerst die Live-Demo, dann
// dieselbe Technik für die eigenen Abläufe, den Ansprechpartner mit
// Belegen, die Leistungen und den Termin.
describe("start page", () => {
  const html = renderToStaticMarkup(createElement(HomeLanding, { profiles: 68 }));

  it("opens with one headline, the live demo and the first call", () => {
    expect(html.match(/<h1\b/gu)).toHaveLength(1);
    expect(html).toContain("Mit KI effizienter arbeiten.");
    expect(html).toContain("Demo mit 68 echten Profilen");
    expect(html).toMatch(/href="https:\/\/calendly\.com\/romandering\/30min\?utm_source=x-portal"[^>]*>Erstgespräch buchen</u);
    expect(html).toContain('href="tel:+491758934338"');
    for (const scenario of DEMO_SCENARIOS) expect(html).toContain(`>${scenario.tab}</button>`);
    expect(html).toContain("68 Profile geprüft");
  });

  it("links every anchor of the header to a section here", () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const target of ["demo", "leistungen", "ueber", "termin"]) expect(ids).toContain(target);
    for (const [, target] of html.matchAll(/href="#([^"]+)"/gu)) expect(ids).toContain(target);
  });

  it("names the sources as links, without tracking parameters", () => {
    for (const source of PROOF_SOURCES) {
      expect(html).toContain(`href="${source.href}"`);
      expect(source.href).not.toMatch(/[?&](?:gclid|gbraid|utm_|gad_)/u);
    }
    expect(html).not.toContain("GARTNER");
  });

  it("shows the agent graphic and the four services", () => {
    expect(html).toContain("Was hereinkommt");
    expect(html).toContain("Am Ende entscheidet Ihr Team.");
    for (const title of ["KI-Agenten", "KI-Schulungen", "Informationssicherheit", "Talent Index"]) expect(html).toContain(`<strong>${title}</strong>`);
    expect(html).toContain("Seit Februar 2025 Pflicht (EU AI Act, Art. 4)");
  });

  it("works without a database", () => {
    const fallback = renderToStaticMarkup(createElement(HomeLanding, { profiles: null }));
    expect(fallback).toContain("Demo mit echten Profilen");
    expect(fallback).toContain("Alle Profile geprüft");
    expect(fallback).not.toContain("null");
  });
});

describe("live demo data", () => {
  it("uses shortened names and drawn pictures that exist", () => {
    const people = DEMO_SCENARIOS.flatMap((scenario) => scenario.people);
    expect(people.length).toBeGreaterThanOrEqual(8);
    for (const person of people) {
      expect(person.name).toMatch(/^\p{Lu}\p{Ll}+ \p{Lu}\.$/u);
      expect(existsSync(new URL(`../../public${person.avatar}`, import.meta.url))).toBe(true);
    }
    for (const face of DEMO_FACES) expect(existsSync(new URL(`../../public${face}`, import.meta.url))).toBe(true);
  });
});

// Die Seite nach dem Anruf: für alle Firmen gleich (Rückmeldung 16.10.:
// „den Namen rausnehmen, damit ich das an alle senden kann“).
describe("praxis page", () => {
  const slots = [
    { start: "2026-10-20T10:00:00+02:00", label: "Di, 20.10., 10:00" },
    { start: "2026-10-21T10:00:00+02:00", label: "Mi, 21.10., 10:00" },
  ];
  const html = renderToStaticMarkup(createElement(PraxisView, {
    cases: praxisCases(68),
    slots,
    calendarBase: "https://calendly.com/romandering/30min",
    token: null,
  }));

  it("greets without a company or a person", () => {
    expect(html).toContain("Guten Tag,");
    expect(html).toContain("so arbeiten andere Unternehmen schon mit KI.");
    expect(html).not.toMatch(/Huber|Frau |Herr /u);
  });

  it("offers the free times and books the first one by default", () => {
    expect(html).toContain("Di, 20.10., 10:00 Uhr");
    expect(html).toContain("Mi, 21.10., 10:00 Uhr");
    expect(html).toContain('href="https://calendly.com/romandering/30min/2026-10-20T10:00:00+02:00?');
    expect(html).toContain("Termin bestätigen");
  });

  it("shows three real cases with sources and a way to mark each", () => {
    expect(html.match(/Das will ich auch/gu)).toHaveLength(3);
    expect(html).toContain("5.000 Personentage gespart.");
    expect(html).toContain("Jede Anfrage gegen 68 geprüfte Profile abgeglichen.");
    expect(html).toContain("Selbst kleinere Unternehmen können und sollten Agenten einsetzen");
    expect(html).toContain('href="https://n8n.io/case-studies/vodafone/"');
    expect(html).toContain('href="https://www.lufthansa-industry-solutions.com/de-de/studien/whitepaper-agentic-ai-2025"');
    expect(html.match(/Übertragen auf Ihr Unternehmen/gu)).toHaveLength(3);
  });

  it("falls back to the calendar when no free times are known", () => {
    const fallback = renderToStaticMarkup(createElement(PraxisView, {
      cases: praxisCases(null),
      slots: [],
      calendarBase: "https://calendly.com/romandering/30min",
      token: null,
    }));
    expect(fallback).toContain("Termin wählen");
    expect(fallback).toContain("Alle freien Zeiten ansehen");
    expect(fallback).toContain("Jede Anfrage gegen alle geprüften Profile abgeglichen.");
  });
});
