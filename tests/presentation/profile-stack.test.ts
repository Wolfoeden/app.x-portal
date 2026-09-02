import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResultSection } from "@/components/chat/results";
import { previewBrief, previewProfiles } from "@/components/chat/preview-fixtures";
import type { FreelancerProfileResult } from "@/components/chat-contract";

function render(profiles: FreelancerProfileResult[], profileFocus = false) {
  return renderToStaticMarkup(
    createElement(ResultSection, {
      brief: previewBrief,
      projectId: "project/test",
      profiles,
      partialProfiles: [],
      matchingStatus: "ranked" as const,
      analysis: null,
      analysisMode: "ai" as const,
      externalSearch: null,
      externalSearchState: "idle" as const,
      onExternalSearch: () => undefined,
      isAccountUser: true,
      creditsRemaining: 300,
      onNeedCredits: () => undefined,
      onRequireLogin: () => undefined,
      selectedProfileId: null,
      onSelect: () => undefined,
      onContact: () => undefined,
      onRequestBooking: () => undefined,
      expandedProfileUrl: null,
      onToggleExpand: () => undefined,
      savedFreelancerIds: [],
      onToggleSave: () => undefined,
      profileFocus,
      onToggleProfileFocus: () => undefined,
      detailsOpen: false,
    }),
  );
}

describe("result section", () => {
  // Der Steckbrief ist die Voraussetzung des Ergebnisses, nicht sein Anhang.
  it("puts the brief above the result as a single line", () => {
    const markup = render(previewProfiles);

    expect(markup).toContain("brief-line");
    expect(markup).toContain(previewBrief.projectTitle);
    expect(markup.indexOf("brief-line")).toBeLessThan(markup.indexOf("profile-card"));
    // Die alte Karte mit Ueberschrift und Zusammenfassung ist weg.
    expect(markup).not.toContain("brief-card");
    expect(markup).not.toContain("Strukturierte Projektanalyse");
  });

  it("stacks several profiles behind one another with a way to page through", () => {
    const markup = render(previewProfiles);

    expect(previewProfiles.length).toBeGreaterThan(1);
    expect(markup).toContain("profile-stack");
    expect(markup).toContain("Nächstes Profil");
    expect(markup).toContain("Vorheriges Profil");
    expect(markup).toContain(`1 von ${previewProfiles.length}`);
  });

  // Ein einzelner Treffer braucht weder Pfeile noch eine Zaehlung — die
  // wuerden eine Auswahl vortaeuschen, die es nicht gibt.
  it("shows a lone profile without stack controls", () => {
    const markup = render(previewProfiles.slice(0, 1));

    expect(markup).toContain("profile-card");
    expect(markup).not.toContain("profile-stack");
    expect(markup).not.toContain("Nächstes Profil");
  });

  it("renders every profile side by side once the view is expanded", () => {
    const markup = render(previewProfiles, true);

    expect(markup).toContain("profile-compare-grid");
    expect(markup).toContain("Ansicht verkleinern");
    // Im Vergleich ist jede Karte sichtbar, nicht nur die oberste.
    const cells = markup.match(/profile-compare-cell/g) ?? [];
    expect(cells).toHaveLength(previewProfiles.length);
    expect(markup).not.toContain("profile-stack-deck");
  });

  it("offers the expand control only when there is something to compare", () => {
    expect(render(previewProfiles)).toContain("Nebeneinander vergleichen");
    expect(render(previewProfiles.slice(0, 1))).not.toContain("Nebeneinander vergleichen");
  });
});

describe("collapsing profiles beside the open panel", () => {
  function renderWithPanel(profileFocus = false) {
    return renderToStaticMarkup(
      createElement(ResultSection, {
        brief: previewBrief,
        projectId: "project/test",
        profiles: previewProfiles,
        partialProfiles: [],
        matchingStatus: "ranked" as const,
        analysis: null,
        analysisMode: "ai" as const,
        externalSearch: null,
        externalSearchState: "idle" as const,
        onExternalSearch: () => undefined,
        isAccountUser: true,
        creditsRemaining: 300,
        onNeedCredits: () => undefined,
        onRequireLogin: () => undefined,
        selectedProfileId: null,
        onSelect: () => undefined,
        onContact: () => undefined,
        onRequestBooking: () => undefined,
        expandedProfileUrl: null,
        onToggleExpand: () => undefined,
        savedFreelancerIds: [],
        onToggleSave: () => undefined,
        profileFocus,
        onToggleProfileFocus: () => undefined,
        detailsOpen: true,
      }),
    );
  }

  // Steht die Projektuebersicht offen, bleibt fuer die Karten wenig Breite.
  it("collapses the text and offers a way to open it", () => {
    const markup = renderWithPanel();

    expect(markup).toContain("Profil ausklappen");
    expect(markup).toContain('aria-expanded="false"');
    // Der Kopf bleibt lesbar, der Text ist zu.
    expect(markup).toContain(previewProfiles[0].displayName);
    expect(markup).not.toContain("Das ist belegt");
  });

  it("keeps the actions reachable while collapsed", () => {
    const markup = renderWithPanel();

    expect(markup).toContain("Zur Merkliste");
    expect(markup).toContain("Kontaktwege anzeigen");
  });

  it("leaves the card open when the panel is closed", () => {
    const markup = render(previewProfiles);

    expect(markup).not.toContain("Profil ausklappen");
    expect(markup).toContain("Das ist belegt");
  });
});

describe("comparing side by side", () => {
  // Nebeneinander ist der Platz gerade der Zweck — dort waere ein zusaetzlich
  // zusammengefaltetes Profil widersinnig.
  it("shows every profile in full, even with the panel open", () => {
    const markup = renderWithPanelSideBySide();

    expect(markup).toContain("profile-compare-grid");
    expect(markup).not.toContain("Profil ausklappen");
    expect(markup).toContain("Das ist belegt");
  });
});

function renderWithPanelSideBySide() {
  return renderToStaticMarkup(
    createElement(ResultSection, {
      brief: previewBrief,
      projectId: "project/test",
      profiles: previewProfiles,
      partialProfiles: [],
      matchingStatus: "ranked" as const,
      analysis: null,
      analysisMode: "ai" as const,
      externalSearch: null,
      externalSearchState: "idle" as const,
      onExternalSearch: () => undefined,
      isAccountUser: true,
      creditsRemaining: 300,
      onNeedCredits: () => undefined,
      onRequireLogin: () => undefined,
      selectedProfileId: null,
      onSelect: () => undefined,
      onContact: () => undefined,
      onRequestBooking: () => undefined,
      expandedProfileUrl: null,
      onToggleExpand: () => undefined,
      savedFreelancerIds: [],
      onToggleSave: () => undefined,
      profileFocus: true,
      onToggleProfileFocus: () => undefined,
      detailsOpen: true,
    }),
  );
}
