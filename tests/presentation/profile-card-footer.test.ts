import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProfileCard } from "@/components/chat/results";
import type { FreelancerProfileResult } from "@/components/chat-contract";

function profile(overrides: Partial<FreelancerProfileResult> = {}): FreelancerProfileResult {
  return {
    id: "profile/footer-test",
    demoStatus: "real",
    bookingUrl: "https://calendar.example/freelancer",
    cvAccess: "available",
    displayName: "Ada Beispiel",
    role: "Data Consultant",
    skillTags: ["Data Migration"],
    languages: ["Deutsch"],
    location: "Berlin",
    remoteMode: "remote",
    experienceSummary: "Beratung und Umsetzung.",
    facts: [],
    referenceStatus: "Verifiziert",
    rate: null,
    availabilityStatus: "available",
    availabilityUpdatedAt: null,
    matchReasons: ["Belegte Projekterfahrung"],
    knownGaps: [],
    recommendationRole: "primary",
    fitScore: 90,
    coreCoverage: 100,
    introPolicy: {
      type: "free",
      label: "Direkt buchbares Erstgespräch",
      manualApprovalRequired: false,
      readyToBook: true,
    },
    ...overrides,
  } as FreelancerProfileResult;
}

function render(value: FreelancerProfileResult) {
  return renderToStaticMarkup(
    createElement(ProfileCard, {
      profile: value,
      position: 1,
      isAccountUser: true,
      projectId: "project/test",
      selected: false,
      onSelect: () => undefined,
      onContact: () => undefined,
      onRequestBooking: () => undefined,
      saved: false,
      onToggleSave: () => undefined,
    }),
  );
}

describe("profile card footer", () => {
  // Die Zeile stand ueber einem Knopf, der genau dasselbe anbot.
  it("no longer repeats the button in a sentence above it", () => {
    const markup = render(profile());

    expect(markup).not.toContain("Bereit für den nächsten Schritt");
    expect(markup).not.toContain("öffnet sich in einem neuen Tab");
  });

  it("keeps the four actions side by side under the profile", () => {
    const markup = render(profile());

    expect(markup).toContain("profile-actions");
    for (const label of ["Lebenslauf herunterladen", "Zur Merkliste", "Kontaktwege anzeigen"]) {
      expect(markup).toContain(label);
    }
  });

  // Dass hier auf eigene Entscheidung gehandelt wird, muss neben den Knoepfen
  // stehen — nicht nur weiter oben in der Begruendung.
  it("keeps the warning next to the buttons on a partial match", () => {
    const markup = render(profile({ recommendationRole: "partial", coreCoverage: 40 }));

    expect(markup).toContain("Kontakt auf eigene Entscheidung");
    expect(markup).toContain("profile-footer-caution");
  });
});

describe("self-reported facts", () => {
  it("shortens a long entry and offers to expand it", () => {
    const markup = render(
      profile({
        facts: [
          {
            label: "Erfahrung",
            value: "Zwoelf Jahre Erfahrung mit React, Next.js und verteilten Systemen im Handel",
            verification: "self-reported",
          },
        ],
      } as Partial<FreelancerProfileResult>),
    );

    expect(markup).toContain("mehr anzeigen");
    expect(markup).toContain("…");
    expect(markup).not.toContain("verteilten Systemen im Handel");
  });

  it("shows a short entry in full, with nothing to expand", () => {
    const markup = render(
      profile({
        facts: [{ label: "Sprache", value: "Deutsch C2", verification: "self-reported" }],
      } as Partial<FreelancerProfileResult>),
    );

    expect(markup).toContain("Deutsch C2");
    expect(markup).not.toContain("mehr anzeigen");
  });
});
