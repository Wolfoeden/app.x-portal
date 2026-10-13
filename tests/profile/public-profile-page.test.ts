import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { previewDossiers, previewProfiles } from "@/components/chat/preview-fixtures";
import { PublicProfilePage } from "@/components/profile/PublicProfilePage";
import type { PublicProfileView } from "@/lib/freelancer/public-profile";
import { presentationFromOutput } from "@/lib/openai/profile-presentation";

const NOW = new Date("2026-10-13T10:00:00.000Z");
const dossier = previewDossiers["preview-anna"]!;
const action = { kind: "link", href: "/chat", label: "Im Arbeitsbereich öffnen", hint: "Kostenlos" } as const;

function render(view: Partial<PublicProfileView>) {
  return renderToStaticMarkup(
    createElement(PublicProfilePage, {
      view: { profile: previewProfiles[0]!, dossier, ...view } as PublicProfileView,
      action,
      bookingHref: null,
      shareUrl: "https://x-portal.eu/profil/x?via=share",
      now: NOW,
    }),
  );
}

// Oktober 2026: Die Profilseite für Recruiter, nach dem Entwurf.
describe("public profile page", () => {
  it("shows what the person does at a glance when the presentation is ready", () => {
    const markup = render({
      presentation: {
        stale: false,
        input: { role: dossier.role, summary: dossier.summary, skills: [], industries: [], qualifications: [] },
        presentation: {
          headline: "Frontends für Banken, vom Designsystem bis zur Barrierefreiheit.",
          summaryDe: null,
          focusAreas: [{ title: "Frontend", skills: [dossier.skills[0]!.value] }],
          industries: ["Banken"],
          educationShort: "M.Sc., TU Ilmenau",
        },
      },
    });
    expect(markup).toContain("Frontends für Banken, vom Designsystem bis zur Barrierefreiheit.");
    expect(markup).toContain("<h3>Frontend</h3>");
    expect(markup).toContain("M.Sc., TU Ilmenau");
    expect(markup).toContain(`Das kann ${dossier.displayName.split(" ")[0]}`);
  });

  it("falls back to the raw skills and the original text without a presentation", () => {
    const markup = render({});
    expect(markup).toContain("<h3>Kompetenzen</h3>");
    expect(markup).toContain(dossier.summary!.slice(0, 40));
    expect(markup).not.toContain("automatisch übersetzt");
  });

  it("lists CV, LinkedIn and GitHub only when they exist, through XPORTAL", () => {
    const markup = render({ documents: { cv: true, links: { linkedin: true, github: false } } });
    expect(markup).toContain("Lebenslauf (PDF)");
    expect(markup).toContain(`/api/freelancers/${dossier.id}/link?kind=linkedin`);
    expect(markup).not.toContain("kind=github");
    expect(markup).not.toContain("linkedin.com");
  });

  it("checks the visitor's project against this profile", () => {
    const markup = render({});
    expect(markup).toContain('action="/chat"');
    expect(markup).toContain('name="q"');
    expect(markup).toContain(`name="profil" value="${dossier.id}"`);
  });
});

describe("presentation output check", () => {
  const input = { role: "Analyst", summary: "Works on SAP.", skills: ["SAP FI/CO", "Business Analysis", "Business-Analyse"], industries: [], qualifications: [] };

  it("keeps only skills from the profile, once each, in its spelling", () => {
    const presentation = presentationFromOutput(
      {
        headline: "SAP-Projekte von der Anforderung bis zum Rollout.",
        summaryDe: "Arbeitet an SAP.",
        focusAreas: [
          { title: "SAP", skills: ["sap fi/co", "Kubernetes", "SAP FI/CO"] },
          { title: "Analyse", skills: ["Business-Analyse"] },
          { title: "Erfunden", skills: ["Rust"] },
        ],
        industries: ["Finanzen", "Finanzen"],
        educationShort: null,
      },
      input,
    );
    expect(presentation.focusAreas).toEqual([
      { title: "SAP", skills: ["SAP FI/CO"] },
      { title: "Analyse", skills: ["Business-Analyse"] },
    ]);
    expect(presentation.industries).toEqual(["Finanzen"]);
    expect(presentation.summaryDe).toBe("Arbeitet an SAP.");
  });

  // Oktober 2026: Das Modell gab die englische Zusammenfassung als
  // „Übersetzung“ zurück; die Seite hätte sie als übersetzt ausgewiesen.
  it("drops a translation that is just the original text", () => {
    const presentation = presentationFromOutput(
      { headline: null, summaryDe: "Works on SAP. ", focusAreas: [], industries: [], educationShort: null },
      input,
    );
    expect(presentation.summaryDe).toBeNull();
  });

  it("drops a translation when the profile has no summary", () => {
    const presentation = presentationFromOutput(
      { headline: null, summaryDe: "Erfunden.", focusAreas: [], industries: [], educationShort: null },
      { ...input, summary: null },
    );
    expect(presentation.summaryDe).toBeNull();
  });
});
