import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ApplicantLanding } from "@/app/bewerber-portal/apply/ApplicantLanding";
import { ApplyForm } from "@/app/bewerber-portal/apply/ApplyForm";
import {
  availabilityFields,
  parseApplyDraft,
  serializeApplyDraft,
  type ApplyDraft,
} from "@/app/bewerber-portal/apply/apply-draft";

const DRAFT: ApplyDraft = {
  fullName: "Lena Berger",
  roleTitle: "KI-Engineer (LLM, RAG)",
  rateKind: "daily",
  rate: "950",
  currency: "EUR",
  skills: ["RAG", "Python"],
  languages: ["Deutsch"],
  workModes: ["remote"],
  availability: "from",
  availabilityFrom: "2026-11-01",
  locationText: "München",
  experienceSummary: "Ich baue RAG-Systeme für Versicherer.",
  consent: true,
  consentSearchIndex: true,
  consentMarketStats: false,
};

// Das Formular vor der Anmeldung (21.10.2026): Die Angaben warten im Browser,
// bis das Konto bestätigt ist.
describe("the remembered application", () => {
  const now = Date.parse("2026-10-21T10:00:00Z");

  it("comes back exactly as it was left", () => {
    expect(parseApplyDraft(serializeApplyDraft(DRAFT, now), now + 60_000)).toEqual(DRAFT);
  });

  it("expires after a day and ignores anything malformed", () => {
    expect(parseApplyDraft(serializeApplyDraft(DRAFT, now), now + 25 * 60 * 60 * 1_000)).toBeNull();
    expect(parseApplyDraft("{", now)).toBeNull();
    expect(parseApplyDraft(JSON.stringify({ at: now, draft: { ...DRAFT, fullName: "" } }), now)).toBeNull();
  });

  it("drops values the form does not offer", () => {
    const tampered = JSON.stringify({ at: now, draft: { ...DRAFT, rateKind: "yearly", workModes: ["remote", "moon"], availabilityFrom: "bald", consent: "yes" } });
    expect(parseApplyDraft(tampered, now)).toMatchObject({ rateKind: "daily", workModes: ["remote"], availabilityFrom: "", consent: false });
  });

  it("maps the availability choice to status and date", () => {
    expect(availabilityFields("now", "2026-11-01")).toEqual({ availabilityStatus: "available", availabilityFrom: "" });
    expect(availabilityFields("from", "2026-11-01")).toEqual({ availabilityStatus: "available", availabilityFrom: "2026-11-01" });
    expect(availabilityFields("limited", "")).toEqual({ availabilityStatus: "limited", availabilityFrom: "" });
  });
});

describe("the form for signed-out visitors", () => {
  const markup = renderToStaticMarkup(
    createElement(ApplicantLanding, { form: createElement(ApplyForm, { guest: true }) }),
  );

  it("sits right below the first screen, where the sign-up button points", () => {
    expect(markup.indexOf('id="profil"')).toBeGreaterThan(markup.indexOf("</header>"));
    expect(markup.indexOf('id="profil"')).toBeLessThan(markup.indexOf("Gut zu wissen"));
    expect(markup).toContain('href="#profil"');
  });

  it("asks for role, skills, languages, availability and work mode, without a CV upload", () => {
    for (const label of ["Rolle", "Kompetenzen", "Sprachen", "Verfügbar", "Arbeitsform", "Über mich"]) expect(markup).toContain(label);
    expect(markup).toContain("+ RAG");
    expect(markup).toContain("+ Deutsch");
    expect(markup).not.toContain("PDF hochladen");
    expect(markup).toContain("Ein Lebenslauf ist nicht nötig.");
    expect(markup).toContain("Danach bestätigen Sie Ihr Konto mit Google, LinkedIn oder E-Mail.");
  });

  it("keeps search engines and market statistics as separate opt-ins", () => {
    expect(markup).toContain("in Suchmaschinen wie Google erscheinen");
    expect(markup).toContain("anonymisiert in Marktstatistiken");
    expect(markup.match(/type="checkbox" checked=""/gu)?.length ?? 0).toBe(1);
  });
});
