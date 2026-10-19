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
  const base = { profileId: ID, hasCalendar: true, isAccountUser: false, projectId: null };

  it("requests through the project the link came from", () => {
    expect(profilePageAction({ ...base, isAccountUser: true, projectId: PROJECT })).toMatchObject({
      kind: "request",
      projectId: PROJECT,
      label: "Freelancer anfragen",
    });
  });

  it("sends a guest through sign-in back to the same profile in that project", () => {
    const action = profilePageAction({ ...base, projectId: PROJECT });

    expect(action.kind).toBe("link");
    const href = new URL(`https://x-portal.eu${action.kind === "link" ? action.href : ""}`);
    expect(href.pathname).toBe("/chat");
    expect(href.searchParams.get("resume")).toBe("book_profile");
    expect(href.searchParams.get("project")).toBe(PROJECT);
    expect(href.searchParams.get("profile")).toBe(ID);
  });

  it("sends users without a project to describe one in the Talent Index", () => {
    expect(profilePageAction({ ...base })).toMatchObject({
      kind: "link",
      href: "/chat",
      label: "Projekt beschreiben",
    });
    expect(profilePageAction({ ...base, isAccountUser: true, directBooking: false })).toMatchObject({
      href: "/chat",
    });
  });

  it("lets paying customers book the calendar directly", () => {
    expect(
      profilePageAction({ ...base, isAccountUser: true, hasCalendar: true, directBooking: true }),
    ).toMatchObject({ kind: "booking", href: `/api/freelancers/${ID}/book`, label: "Termin buchen" });
  });

  it("does not offer direct booking without a calendar or account", () => {
    expect(
      profilePageAction({ ...base, isAccountUser: true, hasCalendar: false, directBooking: true }).kind,
    ).toBe("link");
    expect(
      profilePageAction({ ...base, isAccountUser: false, hasCalendar: true, directBooking: true }).kind,
    ).toBe("link");
  });
});
