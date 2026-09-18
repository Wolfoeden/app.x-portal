import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
import { normalizeChatResponse, normalizeProjectDetail } from "@/components/ChatWorkspace";
import { profilePresentation } from "@/components/chat/profile-presentation";
import {
  automationBrief,
  automationPartialProfiles,
  automationProfiles,
  automationStrictBrief,
} from "@/components/chat/preview-fixtures";
import { ProfileCard } from "@/components/chat/results";
import type { FreelancerProfileResult, StructuredBrief } from "@/components/chat-contract";

const [strategist, integrator] = automationProfiles;
const [workflows, developer] = automationPartialProfiles;

function card(profile: FreelancerProfileResult, brief: StructuredBrief | null, collapsed = true) {
  return renderToStaticMarkup(createElement(ProfileCard, {
    profile, brief, position: 1,
    isAccountUser: false, projectId: "preview", selected: false,
    onSelect: vi.fn(), onContact: vi.fn(), onRequestBooking: vi.fn(),
    saved: false, onToggleSave: vi.fn(), collapsed, onToggleCollapsed: vi.fn(),
  }));
}

describe("profile evidence for the request", () => {
  // Im Live-Audit stand n8n beim Hauptvorschlag erst hinter zwei Aufklappstufen,
  // vorne Strategie und Coaching.
  it("names the requested n8n competency first, in the client's wording", () => {
    const result = profilePresentation(strategist, automationBrief);

    expect(result.highlights).toEqual(["n8n", "Large Language Models"]);
    expect(result.evidence.map((row) => [row.requirement, row.status])).toEqual([
      ["n8n", "listed"],
      ["Large Language Models", "listed"],
      ["RAG", "listed"],
    ]);
    expect(result.skills.slice(0, 3)).toEqual(["N8n", "Large Language Models", "RAG"]);
    expect(result.additional).toEqual(["KI-Strategie", "KI-Roadmap", "AI consulting"]);
  });

  it("orders must, core and optional requirements regardless of the profile's tag order", () => {
    const result = profilePresentation(
      { ...strategist, skillTags: ["RAG", "Large Language Models", "N8n"] },
      automationStrictBrief,
    );

    expect(result.evidence.map((row) => `${row.priority}:${row.requirement}`)).toEqual([
      "hard:n8n",
      "core:Large Language Models",
      "optional:RAG",
    ]);
    expect(result.highlights[0]).toBe("n8n");
  });

  it("keeps the profile's own term where only an alias matches", () => {
    const row = profilePresentation(integrator, automationBrief).evidence
      .find((candidate) => candidate.requirement === "Large Language Models");

    expect(row).toMatchObject({ status: "listed", profileTerm: "LLM" });
  });

  it("marks a missing must as missing without claiming the freelancer lacks it", () => {
    const result = profilePresentation(developer, automationStrictBrief);
    const markup = card(developer, automationStrictBrief);

    expect(result.evidence[0]).toMatchObject({ requirement: "n8n", priority: "hard", status: "missing" });
    expect(markup).toContain("Nicht im Profil aufgeführt");
    expect(markup).not.toContain("Erfahrung in den Profilangaben nicht belegt");
    expect(markup).not.toMatch(/keine (?:n8n-)?Erfahrung/iu);
  });

  it("reports context evidence instead of a gap when the matcher found it outside the skill list", () => {
    const result = profilePresentation(
      { ...developer, matchReasons: [...developer.matchReasons, "Ergänzend belegt über Branche, Zertifikat oder Projekterfahrung: n8n."] },
      automationStrictBrief,
    );

    expect(result.evidence[0]).toMatchObject({ requirement: "n8n", status: "context" });
  });

  it("only calls a skill checked when XPORTAL verified that very competency", () => {
    const verified = profilePresentation(
      { ...integrator, facts: [{ label: "Geprüft", value: "Kompetenz: n8n", verification: "verified" }] },
      automationBrief,
    );
    const elsewhere = profilePresentation(
      { ...integrator, facts: [{ label: "Geprüft", value: "Referenzprojekt mit n8n", verification: "verified" }] },
      automationBrief,
    );

    expect(verified.evidence[0].verified).toBe(true);
    expect(elsewhere.evidence[0].verified).toBe(false);
  });

  it("does not turn missing optional or satisfied alternative skills into deficiencies", () => {
    const result = profilePresentation(integrator, {
      ...automationBrief,
      requirementGroups: [
        { id: "choice", category: "skill", priority: "core", operator: "any_of", values: ["n8n", "Make"] },
        { id: "optional", category: "skill", priority: "optional", operator: "all_of", values: ["Python", "RAG"] },
      ],
    });

    expect(result.evidence.map((row) => [row.requirement, row.status])).toEqual([
      ["n8n oder Make", "listed"],
      ["Python", "listed"],
    ]);
    expect(result.openPoints.some((point) => /RAG/u.test(point))).toBe(false);
  });

  it("falls back to the flat skill lists of historical briefs", () => {
    const result = profilePresentation(integrator, { ...automationBrief, requirementGroups: [] });

    expect(result.evidence.map((row) => `${row.priority}:${row.requirement}`)).toEqual([
      "core:n8n",
      "core:Large Language Models",
    ]);
  });
});

describe("open points on the card", () => {
  it("drops what a skill line, the rate or the start already shows", () => {
    const result = profilePresentation(developer, automationStrictBrief);

    expect(result.openPoints).toEqual([
      "Projektverfügbarkeit ist begrenzt; den genauen Zeitraum beim Termin abstimmen.",
      "Tagessatz noch nicht bestätigt; Preisgrenze vor der Buchung abstimmen.",
    ]);
    expect(result.start).toEqual({ text: "Start kurzfristig: noch zu klären", conflict: false });
  });

  it("removes old snapshot duplicates but keeps different, substantive conflicts", () => {
    const result = profilePresentation({ ...strategist, knownGaps: [
      "Weitere Rahmenbedingung ist im Profil nicht bestätigt: Remote.",
      "Weitere Rahmenbedingung ist im Profil nicht bestätigt: kurzfristig.",
      "Vor-Ort-Termine in Berlin sind nicht bestätigt.",
      "Explizit zwingender Arbeitsmodus wird nicht unterstützt: on-site.",
    ] }, automationBrief);

    expect(result.openPoints).toEqual([
      "Vor-Ort-Termine in Berlin sind nicht bestätigt.",
      "Explizit zwingender Arbeitsmodus wird nicht unterstützt: on-site.",
    ]);
  });

  it("keeps a skill gap once the edited brief no longer shows that skill as a line", () => {
    const gap = "Weitere Kernkompetenz ist im Profil nicht belegt: Kubernetes.";
    const result = profilePresentation({ ...workflows, knownGaps: [gap] }, automationBrief);

    expect(result.openPoints).toContain(gap);
  });

  it("shows a later confirmed availability as a conflict with the requested start", () => {
    const later = profilePresentation({
      ...strategist,
      knownGaps: ["Bestätigte Verfügbarkeit beginnt nach dem gewünschten Startfenster; im Erstgespräch abstimmen."],
    }, automationBrief);
    const confirmed = profilePresentation({
      ...strategist,
      knownGaps: [],
      matchReasons: ["Verfügbarkeit ist im angegebenen Startfenster bestätigt."],
    }, { ...automationBrief, startWindow: "Start im Oktober" });

    expect(later.start).toEqual({ text: "Start kurzfristig: laut Profil später verfügbar", conflict: true });
    expect(later.openPoints).toEqual([]);
    expect(confirmed.start).toEqual({ text: "Start im Oktober bestätigt", conflict: false });
  });
});

describe("profile card first reading level", () => {
  it("shows evidence, price, mode and start before the full profile is opened", () => {
    const markup = card(integrator, automationBrief);

    expect(markup).toContain("n8n und Large Language Models im Profil genannt");
    expect(markup).toContain("Zusätzlich im Profil: Make, API integration, Python");
    expect(markup).toContain("Als „LLM“ angegeben");
    expect(markup).toContain("Im Erstgespräch klären");
    expect(markup).toContain("850 € / Tag");
    expect(markup).toContain("Start kurzfristig: noch zu klären");
    expect(markup).toContain("Erstgespräch vereinbaren");
    expect(markup).not.toContain(integrator.experienceSummary);
    expect(markup).not.toContain("Kontaktwege anzeigen");
    expect(markup).not.toContain("Verfügbarkeit bestätigt");
  });

  it("keeps must violations of a partial match visible next to the booking action", () => {
    const markup = card(developer, automationStrictBrief);

    expect(markup).toContain("Teilpassung");
    expect(markup).toContain("Vor einem Gespräch prüfen");
    expect(markup).toMatch(/is-missing[^]*n8n[^]*Muss/u);
    expect(markup).toContain("Kontakt auf eigene Entscheidung");
  });

  it("puts the meeting before Merken, as it is read and tabbed", () => {
    const markup = card(integrator, automationBrief);

    expect(markup.indexOf("Erstgespräch mit Jo Beispiel vereinbaren")).toBeLessThan(markup.indexOf(">Merken<"));
    expect(markup.indexOf("Vollständiges Profil und Belege")).toBeLessThan(markup.indexOf("Erstgespräch mit Jo Beispiel vereinbaren"));
  });

  it("lists the competencies plainly when there is no request to relate them to", () => {
    const markup = card(integrator, null, false);

    expect(markup).not.toContain("profile-project-fit");
    expect(markup).not.toContain("Das bringt das Profil für Ihr Projekt mit");
    expect(markup).toContain("<span>Make</span>");
    expect(markup).not.toContain("Start ");
  });
});

describe("partial result transport", () => {
  for (const bookingUrl of ["https://example.com/calendar", null]) {
    it(`retains partial profiles in responses and history with booking URL ${bookingUrl}`, () => {
      const partial = { ...developer, demoStatus: "real", bookingUrl, recommendationRole: "partial" };
      const chat = normalizeChatResponse({ brief: automationStrictBrief, matches: [], partialMatches: [partial], matchingStatus: "no_reliable_match" }, "Test");
      const stored = normalizeProjectDetail({ brief: automationStrictBrief, profiles: [], partialProfiles: [partial], matchingStatus: "no_reliable_match" });
      expect(chat.partialMatches).toHaveLength(1);
      expect(stored.partialProfiles).toHaveLength(1);
      expect(chat.partialMatches[0].bookingUrl).toBe(bookingUrl);
      expect(stored.partialProfiles[0].recommendationRole).toBe("partial");
    });
  }
});
