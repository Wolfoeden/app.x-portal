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
      productCredits: null,
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
