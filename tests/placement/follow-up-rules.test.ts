import { describe, expect, it } from "vitest";

import { followUpDue, outcomeReplaces, type FollowUpCandidate } from "@/lib/placement/follow-up-rules";

const INTRODUCED_AT = "2026-10-01T10:00:00.000Z";
const day = (days: number) => new Date(Date.parse(INTRODUCED_AT) + days * 24 * 60 * 60 * 1000);

function candidate(overrides: Partial<FollowUpCandidate> = {}): FollowUpCandidate {
  return {
    status: "ready_to_book",
    confirmedAt: INTRODUCED_AT,
    outcome: null,
    followUpCount: 0,
    hasEngagement: false,
    ...overrides,
  };
}

describe("follow-ups after an introduction", () => {
  it("asks first after 14 days and again after 45", () => {
    expect(followUpDue(candidate(), day(13))).toBeNull();
    expect(followUpDue(candidate(), day(14))).toBe(1);
    expect(followUpDue(candidate({ followUpCount: 1 }), day(30))).toBeNull();
    expect(followUpDue(candidate({ followUpCount: 1 }), day(45))).toBe(2);
    expect(followUpDue(candidate({ followUpCount: 2 }), day(90))).toBeNull();
  });

  // „Noch im Gespräch“ ist genau der Fall, für den die zweite Nachfrage da ist.
  it("keeps asking while the parties are still talking", () => {
    expect(followUpDue(candidate({ outcome: "talking", followUpCount: 1 }), day(45))).toBe(2);
  });

  it("stops once the outcome is known", () => {
    expect(followUpDue(candidate({ outcome: "engaged" }), day(20))).toBeNull();
    expect(followUpDue(candidate({ outcome: "no_engagement" }), day(20))).toBeNull();
    expect(followUpDue(candidate({ hasEngagement: true }), day(20))).toBeNull();
  });

  it("never asks about a request that was not introduced", () => {
    expect(followUpDue(candidate({ status: "manual_review" }), day(20))).toBeNull();
    expect(followUpDue(candidate({ status: "cancelled" }), day(20))).toBeNull();
    expect(followUpDue(candidate({ confirmedAt: null }), day(20))).toBeNull();
  });
});

describe("which answer counts", () => {
  // Am „beauftragt“ hängt das Honorar; ein späteres „noch im Gespräch“ darf
  // es nicht still überschreiben.
  it("does not let a later answer undo a reported engagement", () => {
    expect(outcomeReplaces("engaged", "talking", false)).toBe(false);
    expect(outcomeReplaces("engaged", "no_engagement", false)).toBe(false);
    expect(outcomeReplaces("talking", "engaged", false)).toBe(true);
    expect(outcomeReplaces("no_engagement", "engaged", false)).toBe(true);
    expect(outcomeReplaces(null, "talking", false)).toBe(true);
  });

  it("leaves a recorded engagement to the operator", () => {
    expect(outcomeReplaces(null, "no_engagement", true)).toBe(false);
  });
});
