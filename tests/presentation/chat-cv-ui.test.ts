import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  cvActionState,
  navigateToCvDownload,
  ProfileCard,
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
): string {
  return renderToStaticMarkup(createElement(ProfileCard, {
    profile: value,
    position: 1,
    isAccountUser,
    projectId: "project 123",
    selected: false,
    onSelect: () => undefined,
    onContact: () => undefined,
    onRequestBooking: () => undefined,
      saved: false,
      onToggleSave: () => undefined,
  }));
}

describe("recommended profile CV affordance", () => {
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

    const markup = renderProfile(profile("missing"), false);
    expect(markup).toContain("Lebenslauf nur mit Konto");
    expect(markup).not.toContain("Kein Lebenslauf hinterlegt");
  });

  it("enables an available CV only for account users", () => {
    const markup = renderProfile(profile("available"), true);
    expect(cvActionState(profile("available"), true).disabled).toBe(false);
    expect(markup).toContain("Lebenslauf herunterladen");
    expect(markup).not.toMatch(/cv-action[^>]*disabled/u);
  });

  it("keeps an otherwise available CV blocked without a project context", () => {
    const markup = renderToStaticMarkup(createElement(ProfileCard, {
      profile: profile("available"),
      position: 1,
      isAccountUser: true,
      projectId: null,
      selected: false,
      onSelect: () => undefined,
      onContact: () => undefined,
      onRequestBooking: () => undefined,
      saved: false,
      onToggleSave: () => undefined,
    }));
    expect(markup).toMatch(/cv-action[^>]*disabled/u);
  });

  it("shows the explicit missing state to account users", () => {
    const markup = renderProfile(profile("missing"), true);
    expect(markup).toContain("Kein Lebenslauf hinterlegt");
    expect(markup).not.toMatch(/cv-action[^>]*disabled/u);
  });

  it("renders the CV control on a partial card too", () => {
    const markup = renderProfile(profile("available", "partial"), true);
    // Shown as not recommended, but the reader can still read the CV and
    // decide for themselves.
    expect(markup).toContain("Lebenslauf herunterladen");
    expect(markup).toContain("Nicht empfohlen");
    expect(markup).toContain("Kontakt auf eigene Entscheidung");
    expect(markup).toContain("Kontaktwege anzeigen");
  });

  it("labels coverage as evidence rather than an outcome probability", () => {
    const markup = renderProfile(profile("available"), true);
    expect(markup).toContain("der Kernanforderungen belegt");
    // Die Zahl steht direkt neben einem Namen und wuerde sonst als Prognose
    // gelesen. Der Vorbehalt muss auf derselben Karte stehen.
    expect(markup).toContain("keine Aussage über den Projekterfolg");
    expect(markup).not.toContain("Passung 90 %");
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
