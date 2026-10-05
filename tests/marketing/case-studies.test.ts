import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { FreelancerLanding } from "@/components/marketing/FreelancerLanding";
import { CASE_STUDIES, publishedCaseStudies } from "@/lib/marketing/case-studies";

afterEach(() => vi.unstubAllEnvs());

const approvedAll = CASE_STUDIES.map((entry) => ({ ...entry, approved: true }));

describe("case studies on the landing page", () => {
  it("shows only cases the operator approved", () => {
    expect(publishedCaseStudies(CASE_STUDIES.map((entry) => ({ ...entry, approved: false })))).toEqual([]);
    expect(publishedCaseStudies(approvedAll)).toHaveLength(CASE_STUDIES.length);
  });

  it("leaves the section out while nothing is approved", () => {
    const html = renderToStaticMarkup(createElement(FreelancerLanding, { caseStudies: [] }));
    expect(html).not.toContain('id="fallbeispiele"');
  });

  it("shows requirement, evidence, open point and outcome for each approved case", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    const html = renderToStaticMarkup(createElement(FreelancerLanding, { caseStudies: approvedAll }));
    const section = html.slice(html.indexOf('id="fallbeispiele"'));
    for (const entry of CASE_STUDIES) {
      expect(section).toContain(entry.title);
      expect(section).toContain(entry.open[0]!);
    }
    for (const label of ["Anforderung", "Profilbeleg", "Offener Punkt"]) expect(section).toContain(label);
    expect(section).toContain("Ein Abgleich ist noch keine Vermittlung.");
  });
});

// Die Fälle sind echt; deshalb gelten für ihren Wortlaut feste Regeln.
describe("case study wording", () => {
  const text = JSON.stringify(CASE_STUDIES);

  it("names no company, posting id or person", () => {
    expect(text).not.toMatch(/GmbH|\bAG\b|consulting|percision|Thryve|One Day Ahead|freelancermap|ID0\d|@/iu);
  });

  it("shows open points for every case, not only matches", () => {
    for (const entry of CASE_STUDIES) {
      expect(entry.open.length).toBeGreaterThan(0);
      expect(entry.evidence.length).toBeGreaterThan(0);
      expect(entry.required.length).toBeGreaterThan(0);
    }
  });

  it("claims no placement that is not documented", () => {
    for (const entry of CASE_STUDIES) {
      expect(entry.outcome).not.toMatch(/erfolgreich|wurde beauftragt|vermittelt|eingestellt/iu);
    }
  });

  it("says “geprüft” only for profiles XPORTAL checked", () => {
    const checked = CASE_STUDIES.filter((entry) => /^Profil von XPORTAL geprüft$/u.test(entry.profile.check));
    expect(checked.map((entry) => entry.id)).toEqual(["ki-backend-python-kubernetes"]);
  });
});
