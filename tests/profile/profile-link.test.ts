import { describe, expect, it } from "vitest";

import {
  isProfileLinkSource,
  profilePageAction,
  profilePath,
  profileUrl,
} from "@/lib/profile/profile-link";

const ID = "11111111-1111-4111-8111-111111111111";
const PROJECT = "33333333-3333-4333-8333-333333333333";

describe("profile links", () => {
  it("points at the profile page, with where the click came from", () => {
    expect(profilePath(ID)).toBe(`/profil/${ID}`);
    expect(profileUrl("https://x-portal.eu/", ID, "lead")).toBe(`https://x-portal.eu/profil/${ID}?via=lead`);
    expect(isProfileLinkSource("intro")).toBe(true);
    expect(isProfileLinkSource("newsletter")).toBe(false);
  });
});

describe("the button on the profile page", () => {
  const base = { profileId: ID, hasCalendar: true, isAccountUser: false, projectId: null, via: null };

  // Wie in der Lead-Mail: ohne Anmeldung zum Kalender, mit Zuordnung zur Mail.
  it("books directly while the placement model is off", () => {
    expect(profilePageAction({ ...base, placement: false, via: "lead" })).toMatchObject({
      kind: "booking",
      href: `/api/freelancers/${ID}/book?via=lead`,
      label: "Erstgespräch vereinbaren",
    });
    expect(profilePageAction({ ...base, placement: false, hasCalendar: false }).kind).toBe("none");
  });

  it("requests through the project the link came from", () => {
    expect(profilePageAction({ ...base, placement: true, isAccountUser: true, projectId: PROJECT })).toMatchObject({
      kind: "request",
      projectId: PROJECT,
      label: "Freelancer anfragen",
    });
  });

  it("sends a guest through sign-in back to the same profile in that project", () => {
    const action = profilePageAction({ ...base, placement: true, projectId: PROJECT });

    expect(action.kind).toBe("link");
    const href = new URL(`https://x-portal.eu${action.kind === "link" ? action.href : ""}`);
    expect(href.pathname).toBe("/chat");
    expect(href.searchParams.get("resume")).toBe("book_profile");
    expect(href.searchParams.get("project")).toBe(PROJECT);
    expect(href.searchParams.get("profile")).toBe(ID);
  });

  it("starts with the project description when no project is known", () => {
    expect(profilePageAction({ ...base, placement: true })).toMatchObject({
      kind: "link",
      href: "/chat",
      label: "Projekt beschreiben und anfragen",
    });
  });
});
