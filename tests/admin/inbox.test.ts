import { describe, expect, it } from "vitest";

import { adminInboxPreview } from "@/components/admin/inbox-preview-fixtures";
import {
  buildInboxQueue,
  buildIntroductionUpdate,
  canTransitionIntroduction,
  primaryIntroductionAction,
  summarizeInbox,
  type IntroductionStatus,
} from "@/lib/admin/inbox";

describe("admin inbox workflow", () => {
  it("combines both sources and puts the oldest actionable work first", () => {
    const queue = buildInboxQueue(adminInboxPreview);

    expect(queue).toHaveLength(6);
    expect(queue[0]).toMatchObject({
      kind: "introduction",
      status: "manual_review",
    });
    expect(queue.at(-1)).toMatchObject({
      kind: "introduction",
      status: "completed",
    });
  });

  it("derives counters from the same items shown in the queue", () => {
    expect(summarizeInbox(adminInboxPreview)).toMatchObject({
      total: 6,
      open: 4,
      archived: 2,
      contacts: 2,
      introductions: 4,
      decisions: 1,
      oldestOpenAt: "2026-09-01T09:00:00.000Z",
    });
  });

  it("allows only explicit forward transitions or cancellation", () => {
    const allowed: Record<IntroductionStatus, IntroductionStatus[]> = {
      requested: ["manual_review", "ready_to_book", "cancelled"],
      manual_review: ["ready_to_book", "cancelled"],
      ready_to_book: ["booked", "cancelled"],
      booked: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    };
    const statuses = Object.keys(allowed) as IntroductionStatus[];

    for (const current of statuses) {
      for (const next of statuses) {
        expect(canTransitionIntroduction(current, next)).toBe(
          allowed[current].includes(next),
        );
      }
    }
  });

  it("offers one unambiguous primary action for every active stage", () => {
    expect(primaryIntroductionAction("requested")).toBe("start_review");
    expect(primaryIntroductionAction("manual_review")).toBe("approve");
    expect(primaryIntroductionAction("ready_to_book")).toBe("mark_booked");
    expect(primaryIntroductionAction("booked")).toBe("complete");
    expect(primaryIntroductionAction("completed")).toBeNull();
    expect(primaryIntroductionAction("cancelled")).toBeNull();
  });

  it("sets operator timestamps instead of accepting them from the browser", () => {
    const ready = adminInboxPreview.introductions.find(
      (item) => item.status === "ready_to_book",
    );
    expect(ready).toBeDefined();
    const booked = buildIntroductionUpdate(
      ready!,
      "mark_booked",
      "2026-09-03T11:00:00.000Z",
    );
    expect(booked).toMatchObject({
      status: "booked",
      confirmedAt: "2026-09-03T11:00:00.000Z",
      cancelledAt: null,
    });

    const cancelled = buildIntroductionUpdate(
      ready!,
      "cancel",
      "2026-09-03T11:05:00.000Z",
    );
    expect(cancelled).toMatchObject({
      status: "cancelled",
      confirmedAt: null,
      cancelledAt: "2026-09-03T11:05:00.000Z",
    });
  });

  it("requires a valid HTTPS destination before manual approval", () => {
    const review = adminInboxPreview.introductions.find(
      (item) => item.status === "manual_review",
    );
    expect(review).toBeDefined();

    expect(() =>
      buildIntroductionUpdate(
        review!,
        "approve",
        "2026-09-03T11:00:00.000Z",
        "javascript:alert(1)",
      ),
    ).toThrow("invalid_booking_url");
  });
});
