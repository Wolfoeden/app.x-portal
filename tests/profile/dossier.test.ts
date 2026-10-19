import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { previewDossiers } from "@/components/chat/preview-fixtures";
import { ProfileDossier } from "@/components/profile/ProfileDossier";
import { ProfileContactCard } from "@/components/profile/ProfileContactCard";
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

describe("the contact box on the profile page", () => {
  const profile = { ...previewDossiers["preview-anna"]!, id: "11111111-1111-4111-8111-111111111111" };
  const render = (action: ProfilePageAction, bookingHref: string | null, cvHref: string | null = null) =>
    renderToStaticMarkup(
      createElement(ProfileContactCard, {
        firstName: "Anna",
        profile: { id: profile.id, displayName: "Anna Keller" } as never,
        action,
        bookingHref,
        shareUrl: `https://x-portal.eu/profil/${profile.id}?via=share`,
        cvHref,
      }),
    );

  it("books directly when the tariff allows it", () => {
    const markup = render(
      { kind: "booking", href: `/api/freelancers/${profile.id}/book`, label: "Termin buchen", hint: "In Ihrem Tarif enthalten" },
      `/api/freelancers/${profile.id}/book`,
    );
    expect(markup).toContain(`href="/api/freelancers/${profile.id}/book"`);
    expect(markup).toContain("Termin buchen");
    expect(markup).toContain("Link kopieren");
    expect(markup).not.toContain("Anfrage über XPORTAL senden");
  });

  // Oktober 2026: Recruiter aus der Lead-Mail sahen nur „Im Arbeitsbereich
  // öffnen“, obwohl ein Kalender hinterlegt war.
  it("offers the calendar and the request side by side for a guest", () => {
    const markup = render(
      { kind: "link", href: `/chat?profil=${profile.id}`, label: "Im Arbeitsbereich öffnen", hint: "Anforderungen hinterlegen" },
      `/api/freelancers/${profile.id}/book?via=lead`,
      `/chat?profil=${profile.id}`,
    );
    expect(markup).toContain(`href="/api/freelancers/${profile.id}/book?via=lead"`);
    expect(markup).toContain("Anfrage über XPORTAL senden");
    expect(markup).not.toContain("Im Arbeitsbereich öffnen");
    expect(markup).toContain(">Lebenslauf</a>");
    expect(markup).toContain("E-Mail-Adresse und Telefonnummer bleiben privat.");
  });

  it("makes the request the main way without a calendar", () => {
    const markup = render({ kind: "link", href: "/chat", label: "Im Arbeitsbereich öffnen", hint: "Kostenlos" }, null);
    expect(markup).not.toContain("Termin buchen");
    expect(markup).toContain("Anfrage über XPORTAL senden");
  });
});
