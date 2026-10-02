import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { previewDossiers } from "@/components/chat/preview-fixtures";
import { ProfileDossier } from "@/components/profile/ProfileDossier";
import { ProfilePageActions } from "@/components/profile/ProfilePageActions";
import { FreelancerProfileSchema } from "@/lib/domain";
import { buildProfileDossier } from "@/lib/profile/dossier";
import type { ProfilePageAction } from "@/lib/profile/profile-link";

import { profileFixtures } from "../domain/fixtures";

const NOW = new Date("2026-10-02T10:00:00.000Z");

const anna = FreelancerProfileSchema.parse({
  ...profileFixtures[0],
  contextEvidence: [
    { value: "Industry: Versicherungen", source: "verified" },
    { value: "Industry: Handel", source: "self_reported" },
    { value: "Focus: Designsysteme", source: "self_reported" },
  ],
});

describe("building the dossier", () => {
  const dossier = buildProfileDossier(
    anna,
    { avatarUrl: null, field: "frontend", rate: "680 € / Tag", referencesSummary: "  Zwei Projekte für einen Versicherer.  " },
    { placement: true },
  );

  it("keeps verified and stated apart, verified first", () => {
    expect(dossier.skills).toEqual([
      { value: "React", verified: true },
      { value: "TypeScript", verified: true },
      { value: "Next.js", verified: false },
    ]);
    expect(dossier.verified).toBe(true);
    expect(dossier.verificationText).toBe("Profilprüfung durch XPORTAL abgeschlossen");
  });

  it("groups context facts by kind without their prefix", () => {
    expect(dossier.facts.map((group) => group.label)).toEqual(["Branchen", "Schwerpunkte", "Qualifikationen", "Vertragliches"]);
    expect(dossier.facts[0]!.items).toEqual([
      { value: "Versicherungen", verified: true },
      { value: "Handel", verified: false },
    ]);
  });

  it("names the contact path of the model and trims the reference note", () => {
    expect(dossier.contact).toBe("request");
    expect(buildProfileDossier(anna, { avatarUrl: null, field: null, rate: null }, { placement: false }).contact).toBe("calendar");
    expect(dossier.referencesSummary).toBe("Zwei Projekte für einen Versicherer.");
    expect(dossier.projects).toEqual([]);
  });
});

describe("the dossier view", () => {
  const render = (dossier = previewDossiers["preview-showcase-1"]!) =>
    renderToStaticMarkup(createElement(ProfileDossier, { dossier, now: NOW }));

  it("shows projects as a timeline with their source", () => {
    const markup = render();
    expect(markup).toContain("Service-Agent für Schadenmeldungen");
    expect(markup).toContain("Lead Developer · Versicherer, 4.000 Mitarbeitende · seit 03/2025");
    expect(markup).toContain("dossier-timeline");
    expect(render(previewDossiers["preview-showcase-2"]!)).toContain("aus öffentlicher Quelle");
  });

  it("marks only checked skills with a tick and says so", () => {
    const markup = render();
    expect(markup).toContain('<li class="is-verified">');
    expect(markup).toContain("Mit Haken: von XPORTAL geprüft (2). Ohne Haken: Angabe des Freelancers.");
    expect(render(previewDossiers["preview-showcase-3"]!)).toContain("noch keine davon von XPORTAL geprüft");
  });

  it("lists online profiles and key facts, without a fit claim", () => {
    const markup = render();
    expect(markup).toContain("LinkedIn");
    expect(markup).toContain('rel="noopener noreferrer nofollow"');
    expect(markup).toContain("Honorar");
    expect(markup).not.toMatch(/\d+\s?%|passt|garantiert/iu);
  });

  it("uses the page heading on the profile page", () => {
    const markup = renderToStaticMarkup(createElement(ProfileDossier, { dossier: previewDossiers["preview-anna"]!, now: NOW, headingLevel: 1 }));
    expect(markup).toContain('<h1 id="dossier-preview-anna">Anna Keller</h1>');
  });
});

describe("the actions on the profile page", () => {
  const profile = { ...previewDossiers["preview-anna"]!, id: "11111111-1111-4111-8111-111111111111" };
  const render = (action: ProfilePageAction) =>
    renderToStaticMarkup(
      createElement(ProfilePageActions, {
        profile: { id: profile.id, displayName: "Anna Keller" } as never,
        action,
        shareUrl: `https://x-portal.eu/profil/${profile.id}?via=share`,
      }),
    );

  it("links to the calendar, or to the request, depending on the model", () => {
    expect(
      render({ kind: "booking", href: `/api/freelancers/${profile.id}/book`, label: "Erstgespräch vereinbaren", hint: "Termin selbst wählen" }),
    ).toContain(`href="/api/freelancers/${profile.id}/book"`);
    const request = render({ kind: "link", href: "/chat", label: "Projekt beschreiben und anfragen", hint: "Kostenlos" });
    expect(request).toContain("Projekt beschreiben und anfragen");
    expect(request).not.toContain("/book");
    expect(request).toContain("Link kopieren");
  });
});
