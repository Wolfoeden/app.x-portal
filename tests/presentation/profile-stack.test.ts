import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResultSection } from "@/components/chat/results";
import {
  automationPartialProfiles,
  automationStrictBrief,
  previewBrief,
  previewProfiles,
} from "@/components/chat/preview-fixtures";
import type { FreelancerProfileResult } from "@/components/chat-contract";

type SectionProps = ComponentProps<typeof ResultSection>;

function section(overrides: Partial<SectionProps> = {}) {
  return renderToStaticMarkup(
    createElement(ResultSection, {
      brief: previewBrief,
      projectId: "project/test",
      profiles: previewProfiles,
      partialProfiles: [],
      matchingStatus: "ranked",
      analysis: null,
      analysisMode: "ai",
      externalSearch: null,
      externalSearchState: "idle",
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
      profileFocus: false,
      onToggleProfileFocus: () => undefined,
      onRefineSearch: () => undefined,
      onSaveSearch: () => undefined,
      onUpdateBrief: () => undefined,
      ...overrides,
    }),
  );
}

function render(profiles: FreelancerProfileResult[], profileFocus = false) {
  return section({ profiles, profileFocus });
}

function occurrences(markup: string, text: string) {
  return markup.split(text).length - 1;
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

  it("keeps every suggestion discoverable without hidden carousel cards", () => {
    const markup = render(previewProfiles);

    expect(previewProfiles.length).toBeGreaterThan(1);
    expect(markup).toContain("profile-shortlist");
    expect(markup).not.toContain("Nächstes Profil");
    expect(markup).not.toContain('inert=""');
    for (const profile of previewProfiles) expect(markup).toContain(profile.displayName);
  });

  it("states the number of profiles once", () => {
    expect(occurrences(render(previewProfiles), "2 Profile für Ihr Projekt")).toBe(1);
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

  it("keeps the matching method one click away instead of above the profiles", () => {
    const markup = render(previewProfiles);

    expect(markup).toContain("Wie kommt diese Auswahl zustande?");
    expect(markup).toContain("Vom Projekttext zur prüfbaren Auswahl");
    expect(markup.indexOf("Vom Projekttext zur prüfbaren Auswahl")).toBeGreaterThan(markup.lastIndexOf("profile-card"));
  });
});

describe("collapsed profiles", () => {
  it("keeps the decision summary visible and the biography behind one control", () => {
    const markup = render(previewProfiles);

    expect(markup).toContain("Vollständiges Profil und Belege");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain(previewProfiles[0].displayName);
    expect(markup).toContain("Das bringt das Profil für Ihr Projekt mit");
    expect(markup).toContain("Im Erstgespräch klären");
    expect(markup).toContain(previewProfiles[0].rate);
    expect(markup).not.toContain(previewProfiles[0].experienceSummary);
  });

  it("keeps the meeting and Merken reachable while collapsed", () => {
    const markup = render(previewProfiles);

    expect(markup).toContain("Erstgespräch vereinbaren");
    expect(markup).toContain("Zur Merkliste");
    // CV und weitere Kontaktwege gehoeren zum vollstaendigen Profil.
    expect(markup).not.toContain("Kontaktwege anzeigen");
  });
});

describe("comparing side by side", () => {
  // Nebeneinander ist der Platz gerade der Zweck — dort waere ein zusaetzlich
  // zusammengefaltetes Profil widersinnig.
  it("shows every profile in full", () => {
    const markup = render(previewProfiles, true);

    expect(markup).toContain("profile-compare-grid");
    expect(markup).not.toContain("Vollständiges Profil und Belege");
    expect(markup).toContain("Im Profil belegt");
    expect(markup).toContain("Kontaktwege anzeigen");
  });
});

describe("results without a recommendation", () => {
  const partial = (overrides: Partial<SectionProps> = {}) => section({
    brief: automationStrictBrief,
    profiles: [],
    partialProfiles: automationPartialProfiles,
    matchingStatus: "no_reliable_match",
    isAccountUser: false,
    ...overrides,
  });

  it("shows partial matches first, marked as not recommended, then the ways on", () => {
    const markup = partial();

    expect(markup).toContain("2 Profile mit Überschneidungen – wichtige Punkte offen");
    expect(markup).toContain("Keine Empfehlung");
    expect(occurrences(markup, "Teilpassung")).toBe(2);
    expect(markup.lastIndexOf("profile-card")).toBeLessThan(markup.indexOf("Suchkriterien prüfen"));
    expect(markup).toContain("Passt keines dieser Profile? Ihre Anfrage bleibt erhalten.");
  });

  it("uses the singular for a single partial match", () => {
    expect(partial({ partialProfiles: automationPartialProfiles.slice(0, 1) }))
      .toContain("1 Profil mit Überschneidungen – wichtige Punkte offen");
  });

  it("offers checking the criteria without starting a search or loosening a limit", () => {
    const markup = partial({ partialProfiles: [] });

    expect(markup).toContain("Noch kein passendes Profil für diese Kombination");
    expect(occurrences(markup, "Ihre Anfrage bleibt erhalten")).toBe(1);
    expect(markup).toMatch(/aria-expanded="false"[^>]*>Suchkriterien prüfen/u);
    // Der Editor oeffnet erst auf Klick; bis dahin laeuft und aendert nichts.
    expect(markup).not.toContain("recovery-field-");
    expect(markup).toContain("Suche speichern");
  });

  it("does not offer saving a search an account already keeps", () => {
    expect(partial({ isAccountUser: true })).not.toContain("Suche speichern");
  });

  it("keeps the paid research behind the free ways, with its price on the line", () => {
    const markup = partial({ partialProfiles: [] });

    expect(markup).toMatch(/<details class="recovery-research"><summary>Öffentlich weitersuchen · 30 Credits<\/summary>/u);
    expect(markup.indexOf("Suche speichern")).toBeLessThan(markup.indexOf("Öffentlich weitersuchen"));
  });

  it("asks for a missing requirement in the chat when the request needs clarification", () => {
    const markup = partial({ partialProfiles: [], matchingStatus: "needs_clarification" });

    expect(markup).toContain("Anfrage ergänzen");
    expect(markup).not.toContain("Suchkriterien prüfen");
    expect(markup).not.toContain("Öffentlich weitersuchen");
  });
});
