import { describe, expect, it, vi } from "vitest";

import {
  authIntentCopy,
  continuationFromSearch,
  continuationPath,
  createAuthContinuation,
  parseAuthContinuation,
} from "@/components/chat/auth-continuation";

describe("auth continuation", () => {
  it("round-trips a bounded internal continuation", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const continuation = createAuthContinuation(
      "contact_profile",
      "project-1",
      "profile-1",
    );
    expect(continuationFromSearch(continuationPath(continuation).split("?")[1]!)).toMatchObject({
      intent: "contact_profile",
      projectId: "project-1",
      profileId: "profile-1",
    });
  });

  it("rejects expired and unsafe values", () => {
    expect(parseAuthContinuation({
      version: 1,
      intent: "save_profile",
      projectId: "../project",
      profileId: null,
      createdAt: 1_000,
    }, 2_000)).toBeNull();
    expect(parseAuthContinuation({
      version: 1,
      intent: "save_profile",
      projectId: "project-1",
      profileId: null,
      createdAt: 1_000,
    }, 3_700_001)).toBeNull();
  });

  it("states that paid research never starts automatically", () => {
    expect(authIntentCopy("external_research").body).toContain("startet erst");
    expect(authIntentCopy("external_research").body).toContain("30 Credits");
  });
});
