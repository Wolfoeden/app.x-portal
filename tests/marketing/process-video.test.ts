import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { EXAMPLE_BRIEFS, exampleBrief, exampleBriefPath } from "@/components/chat/example-briefs";
import { FreelancerLanding } from "@/components/marketing/FreelancerLanding";
import { ProcessVideo, stepAt } from "@/components/marketing/ProcessVideo";
import { buildDeterministicBrief } from "@/lib/openai/brief";

const steps = [
  { title: "Kopieren", text: "a", icon: null, startsAt: 0 },
  { title: "Einfügen", text: "b", icon: null, startsAt: 3.5 },
  { title: "Buchen", text: "c", icon: null, startsAt: 8.7 },
];

describe("the process video", () => {
  it("maps a point in the video to its chapter", () => {
    expect(stepAt(steps, 0)).toBe(0);
    expect(stepAt(steps, 3.49)).toBe(0);
    expect(stepAt(steps, 3.5)).toBe(1);
    expect(stepAt(steps, 8.69)).toBe(1);
    expect(stepAt(steps, 13.4)).toBe(2);
  });

  it("loads nothing before it is seen and keeps the steps as text", () => {
    const html = renderToStaticMarkup(createElement(ProcessVideo, { steps }));
    expect(html).toContain('preload="none"');
    expect(html).toContain("muted");
    expect(html).toContain('poster="/images/landing/ablauf-poster.webp"');
    expect(html.indexOf("/videos/ablauf.webm")).toBeLessThan(html.indexOf("/videos/ablauf.mp4"));
    expect(html).not.toContain("autoplay");
    for (const step of steps) expect(html).toContain(`>${step.title}</strong>`);
    expect(html.match(/<button type="button"/gu)).toHaveLength(3);
    expect(html).toContain('aria-current="step"');
  });

  it("sits in the landing section „Einfügen. Buchen.“ with the three real steps", () => {
    const html = renderToStaticMarkup(createElement(FreelancerLanding));
    const section = html.slice(html.indexOf('id="ablauf"'), html.indexOf('id="begruendung"'));
    expect(section).toContain("Einfügen. Buchen.");
    expect(section).toContain("/videos/ablauf.webm");
    for (const title of ["Projekttext kopieren", "Bei XPORTAL einfügen", "Erstgespräch buchen"]) {
      expect(section).toContain(title);
    }
  });
});

describe("example briefs shared by chat and landing page", () => {
  it("opens each theme on the landing page as a chat example", () => {
    const html = renderToStaticMarkup(createElement(FreelancerLanding));
    for (const example of EXAMPLE_BRIEFS) {
      expect(html).toContain(`href="${exampleBriefPath(example.key)}"`);
    }
    // SAP stays reachable through the own text, but is no longer promised
    // as a theme next to AI: five bookable profiles, none self-registered.
    expect(EXAMPLE_BRIEFS.map((example) => example.label)).not.toContain("SAP");
    expect(html).not.toContain("SAP &amp; Integration");
  });

  it("finds an example only by its key", () => {
    expect(exampleBrief("ki-automatisierung")?.label).toBe("KI & Automatisierung");
    expect(exampleBrief("anforderungen")?.label).toBe("Anforderungen & Prozesse");
    expect(exampleBrief("sap")).toBeNull();
    expect(exampleBrief(null)).toBeNull();
    expect(exampleBriefPath("anforderungen")).toBe("/chat?beispiel=anforderungen");
  });

  it("parses the requirements example to requirements management as its core", () => {
    const brief = buildDeterministicBrief({ originalRequest: exampleBrief("anforderungen")!.draftPrefix });
    expect(brief.requiredSkills).toEqual(["Requirements Management"]);
  });
});
