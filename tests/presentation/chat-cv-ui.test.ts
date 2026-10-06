import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  bookingActionState,
  cvActionState,
  DirectBookingContext,
  navigateToCvDownload,
  ProfileCard,
  profileShortcutStates,
  requestFreelancerCvDownload,
} from "@/components/chat/results";
import { normalizeCvAccess } from "@/components/ChatWorkspace";
import type { FreelancerProfileResult } from "@/components/chat-contract";

function profile(
  cvAccess: FreelancerProfileResult["cvAccess"],
  recommendationRole: FreelancerProfileResult["recommendationRole"] = "primary",
): FreelancerProfileResult {
  return {
    id: "profile/cv-test",
    demoStatus: "real",
    bookingUrl: "https://calendar.example/freelancer",
    cvAccess,
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
    recommendationRole,
    fitScore: 90,
    coreCoverage: 100,
    introPolicy: {
      type: "free",
      label: "Direkt buchbares Erstgespräch",
      manualApprovalRequired: false,
      readyToBook: true,
    },
  };
}

function renderProfile(
  value: FreelancerProfileResult,
  isAccountUser: boolean,
  options: { paid?: boolean; projectId?: string | null } = {},
): string {
  const card = createElement(ProfileCard, {
    profile: value,
    position: 1,
    isAccountUser,
    projectId: options.projectId === undefined ? "project 123" : options.projectId,
    selected: false,
    onSelect: () => undefined,
    onContact: () => undefined,
    onRequestBooking: () => undefined,
    saved: false,
    onToggleSave: () => undefined,
  });
  return renderToStaticMarkup(
    createElement(DirectBookingContext.Provider, { value: options.paid ?? false }, card),
  );
}

/** Nur die Kurzlinks rechts neben „Freelancer anfragen“. */
function shortcuts(markup: string): string {
  const start = markup.indexOf('<div class="profile-shortcuts"');
  expect(start).toBeGreaterThan(-1);
  return markup.slice(start, markup.indexOf("</div>", start));
}

/** Produktion: Vermittlungsmodell an, die Kurzlinks brauchen ein Abo. */
function inPlacementModel() {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());
}

describe("recommended profile CV affordance", () => {
  inPlacementModel();

  it("keeps historical responses safely backward compatible", () => {
    expect(normalizeCvAccess(undefined)).toBe("forbidden");
    expect(cvActionState({}, true)).toEqual({
      kind: "forbidden",
      label: "Lebenslauf nicht verfügbar",
      disabled: true,
    });
  });

  it("does not reveal CV existence to guests", () => {
    expect(cvActionState(profile("available"), false)).toEqual({
      kind: "login_required",
      label: "Lebenslauf nur mit Konto",
      disabled: true,
    });
    expect(cvActionState(profile("missing"), false)).toEqual({
      kind: "login_required",
      label: "Lebenslauf nur mit Konto",
      disabled: true,
    });

    // Selbst mit Abo-Kontext: Ein Gast erfährt nicht, ob es einen gibt.
    const markup = shortcuts(renderProfile(profile("missing"), false, { paid: true }));
    expect(markup).toContain("Lebenslauf: Mit Abo direkt erreichbar");
    expect(markup).not.toContain("Nicht hinterlegt");
  });

  it("enables an available CV only for paying account users", () => {
    expect(cvActionState(profile("available"), true).disabled).toBe(false);
    const paid = shortcuts(renderProfile(profile("available"), true, { paid: true }));
    expect(paid).toContain('aria-label="Lebenslauf von Ada Beispiel herunterladen"');
    const free = shortcuts(renderProfile(profile("available"), true));
    expect(free).toContain("Lebenslauf: Mit Abo direkt erreichbar");
    expect(free).not.toContain("herunterladen");
  });

  it("keeps an otherwise available CV blocked without a project context", () => {
    const markup = shortcuts(renderProfile(profile("available"), true, { paid: true, projectId: null }));
    expect(markup).toContain("Lebenslauf: Im Projekt verfügbar");
  });

  it("shows the explicit missing state to paying account users", () => {
    const markup = shortcuts(renderProfile(profile("missing"), true, { paid: true }));
    expect(markup).toContain("Lebenslauf: Nicht hinterlegt");
  });

  it("renders the CV control on a partial card too", () => {
    const markup = renderProfile(profile("available", "partial"), true, { paid: true });
    // Shown as not recommended, but the reader can still read the CV and
    // decide for themselves.
    expect(markup).toContain("Lebenslauf von Ada Beispiel herunterladen");
    expect(markup).toContain("Nicht empfohlen");
    expect(markup).toContain("Kontakt auf eigene Entscheidung");
    expect(markup).toContain("Kontaktwege anzeigen");
  });

  // Die Karte nennt keine Abdeckungszahl mehr — die Eignung zeigt sich am
  // Puls und an der Rolle. Damit faellt auch der Vorbehalt weg, der nur diese
  // Zahl einordnete. Was bleiben muss: keine Prozentzahl neben dem Namen, die
  // sich als Erfolgsaussicht lesen laesst.
  it("states no score that could read as an outcome probability", () => {
    const markup = renderProfile(profile("available"), true);

    expect(markup).not.toContain("Passung 90 %");
    expect(markup).not.toContain("der Kernanforderungen belegt");
    expect(markup).not.toMatch(/\d+\s*%/u);
  });

  it("marks a strong match for the eye instead of in words", () => {
    const strong = renderProfile(profile("available"), true);
    expect(strong).toContain("is-highlight");

    // Ein Teiltreffer steht ausdruecklich als "nicht empfohlen" da; ein
    // gruener Puls daneben saegte genau das wieder ab.
    expect(renderProfile(profile("available", "partial"), true)).not.toContain("is-highlight");
  });
});

// Oktober 2026: LinkedIn, GitHub, Lebenslauf und Kalender rechts neben
// „Freelancer anfragen“. Ohne Abo ausgegraut, mit Abo anklickbar.
describe("Kurzlinks auf der Profilkarte", () => {
  inPlacementModel();
  const withLinks = { ...profile("available"), contactLinks: { linkedin: true, github: false } };

  it("zeigt ohne Abo alle vier ausgegraut und ohne Ziel", () => {
    for (const markup of [shortcuts(renderProfile(withLinks, true)), shortcuts(renderProfile(withLinks, false))]) {
      expect(markup.match(/class="profile-shortcut"/gu)).toHaveLength(4);
      expect(markup.match(/aria-disabled="true"/gu)).toHaveLength(4);
      expect(markup).not.toContain("href=");
      for (const label of ["LinkedIn", "GitHub", "Lebenslauf", "Kalender"]) {
        expect(markup).toContain(`${label}: Mit Abo direkt erreichbar`);
      }
    }
  });

  it("macht mit Abo anklickbar, was hinterlegt ist, und verrät keine Adresse", () => {
    const markup = shortcuts(renderProfile(withLinks, true, { paid: true }));
    expect(markup).toContain('href="/api/freelancers/profile/cv-test/link?kind=linkedin"');
    expect(markup).toContain('href="/api/freelancers/profile/cv-test/book"');
    expect(markup).toContain("GitHub: Nicht hinterlegt");
    expect(markup.match(/aria-disabled="true"/gu)).toHaveLength(1);
    expect(markup).not.toContain("linkedin.com");
  });

  it("öffnet ohne Vermittlungsmodell, wie bisher Kalender und Lebenslauf, mit Konto", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "false");
    expect(shortcuts(renderProfile(withLinks, true))).toContain('href="/api/freelancers/profile/cv-test/link?kind=linkedin"');
    expect(shortcuts(renderProfile(withLinks, false))).toContain("LinkedIn: Nur mit Konto");
  });

  it("leitet die Zustände nur aus Abo und Vorhandensein ab", () => {
    const states = profileShortcutStates({
      unlocked: true,
      lockedHint: "Mit Abo direkt erreichbar",
      contactLinks: undefined,
      hasCalendar: false,
      cvAccess: "forbidden",
      hasProject: true,
    });
    expect(states.map((state) => [state.kind, state.enabled, state.hint])).toEqual([
      ["linkedin", false, "Nicht hinterlegt"],
      ["github", false, "Nicht hinterlegt"],
      ["cv", false, "Nicht verfügbar"],
      ["calendar", false, "Nicht hinterlegt"],
    ]);
  });
});

describe("CV download request", () => {
  it("requests the protected endpoint and accepts a secure signed URL", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedInit = init;
      return new Response(JSON.stringify({
        downloadUrl: "https://storage.example/signed/cv.pdf?token=test",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await expect(requestFreelancerCvDownload("profile/cv-test", "project 123", fetcher)).resolves.toBe(
      "https://storage.example/signed/cv.pdf?token=test",
    );
    expect(requestedUrl).toBe("/api/freelancers/profile%2Fcv-test/cv");
    expect(requestedInit).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ projectId: "project 123" }),
    });
  });

  it("rejects unsafe URLs and reports authorization failures", async () => {
    const unsafeFetcher = vi.fn(async () => new Response(
      JSON.stringify({ downloadUrl: "javascript:alert(1)" }),
      { status: 200 },
    )) as typeof fetch;
    const forbiddenFetcher = vi.fn(async () => new Response(null, { status: 403 })) as typeof fetch;

    await expect(requestFreelancerCvDownload("test", "project", unsafeFetcher)).rejects.toThrow(
      "keinen sicheren CV-Download",
    );
    await expect(requestFreelancerCvDownload("test", "project", forbiddenFetcher)).rejects.toThrow(
      "fehlt die Berechtigung",
    );
  });

  it("navigates to the returned signed URL", () => {
    const assign = vi.fn();
    navigateToCvDownload("https://storage.example/signed/cv.pdf", { assign });
    expect(assign).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith("https://storage.example/signed/cv.pdf");
  });
});

describe("booking button in the placement model", () => {
  it("asks for an introduction instead of opening a calendar, with or without an account", () => {
    const account = bookingActionState({ bookingUrl: null }, true, true);
    const guest = bookingActionState({ bookingUrl: "https://x-portal.eu/api/freelancers/p/book" }, false, true);

    expect(account).toEqual({
      kind: "request",
      label: "Freelancer anfragen",
      hint: "Kostenlos bis zur Beauftragung · XPORTAL stellt Sie vor",
      disabled: false,
    });
    expect(guest.kind).toBe("request");
    expect(guest.hint).toContain("kein Passwort");
  });

  it("keeps the direct booking when the switch is off", () => {
    expect(bookingActionState({ bookingUrl: "https://calendly.com/x" }, true, false).kind).toBe("bookable");
  });
});
