import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FreelancerDashboard } from "@/app/bewerber-portal/apply/FreelancerPortal";
import type { EditableFreelancerProfile } from "@/lib/freelancer/portal";

const profile = {
  id: "a10f78f8-e6ec-47d2-aee9-7fd97b86c9d4",
  displayName: "Anna Beispiel",
  roleTitle: "Senior Frontend-Entwicklerin",
  experienceSummary: "Ich baue Frontends für Banken und Versicherungen, zuletzt ein Designsystem für zwölf Teams.",
  skills: ["React", "TypeScript", "Next.js", "Design Systems", "Storybook"],
  languages: ["Deutsch C2"],
  qualifications: [],
  industries: ["Banken"],
  locationText: "Leipzig",
  workModes: ["remote"],
  monthlySalary: null,
  hourlyRate: null,
  dayRate: 760,
  currency: "EUR",
  availabilityStatus: "available",
  availabilityFrom: null,
  bookingUrl: "",
  profileStatus: "active",
  verificationStatus: "operator_verified",
  avatarUrl: null,
  version: 1,
} as unknown as EditableFreelancerProfile;

const metrics = { profileViewsTotal: 12, profileViews30Days: 4, bookingClicksTotal: 2, bookingClicks30Days: 1 };

// Desktop-Entwurf (Oktober 2026): Menü links, Kennzahlen und Testansicht in
// der Mitte, das öffentliche Profil rechts — und die GitHub-/LinkedIn-
// Auswertung auch für bestehende Profile.
describe("freelancer profile workspace", () => {
  const markup = renderToStaticMarkup(createElement(FreelancerDashboard, { initialProfile: profile, metrics, preview: true, githubLogin: "anna-dev" }));

  it("has one heading and the menu to every part of the profile", () => {
    expect(markup.match(/<h1>/gu)).toHaveLength(1);
    expect(markup).toContain("<h1>Ihr Profil</h1>");
    for (const anchor of ["#uebersicht", "#profil-bearbeiten", "#projekte", "#einsatz", "#verbinden", "#anfragen", "#profil-loeschen"]) {
      expect(markup).toContain(`href="${anchor}"`);
      expect(markup).toContain(`id="${anchor.slice(1)}"`);
    }
  });

  it("offers the GitHub and LinkedIn evaluation like the application form", () => {
    expect(markup).toContain("GitHub und LinkedIn auswerten");
    expect(markup).toContain("GitHub auswerten");
    expect(markup).toContain("Verbunden als @anna-dev");
    expect(markup).toContain("LinkedIn verbinden");
  });

  it("shows the test view as cards and the public profile beside it", () => {
    for (const label of ["So sieht das Unternehmen Sie", "Passendstes Referenzprojekt", "So passen Sie besser", "Öffentliches Profil", "Von XPORTAL geprüft", "760"]) {
      expect(markup).toContain(label);
    }
  });
});
