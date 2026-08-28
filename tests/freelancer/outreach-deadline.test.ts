import { describe, expect, it } from "vitest";

import {
  ART14_DEADLINE_DAYS,
  ART14_WARNING_DAYS,
  byUrgency,
  DAY_IN_MS,
  outreachDeadline,
} from "@/lib/freelancer/outreach-deadline";

const NOW = new Date("2026-08-28T12:00:00.000Z");

function sourcedDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_IN_MS).toISOString();
}

describe("Art. 14 outreach deadline", () => {
  it("leaves a fresh candidate open", () => {
    const deadline = outreachDeadline({
      sourcedAt: sourcedDaysAgo(2),
      outreachSentAt: null,
      now: NOW,
    });

    expect(deadline.state).toBe("open");
    expect(deadline.ageDays).toBe(2);
    expect(deadline.remainingDays).toBe(ART14_DEADLINE_DAYS - 2);
  });

  it("warns before the month is up, not after", () => {
    expect(
      outreachDeadline({
        sourcedAt: sourcedDaysAgo(ART14_WARNING_DAYS - 1),
        outreachSentAt: null,
        now: NOW,
      }).state,
    ).toBe("open");
    expect(
      outreachDeadline({
        sourcedAt: sourcedDaysAgo(ART14_WARNING_DAYS),
        outreachSentAt: null,
        now: NOW,
      }).state,
    ).toBe("warning");
  });

  it("turns overdue exactly at the one-month limit", () => {
    expect(
      outreachDeadline({
        sourcedAt: sourcedDaysAgo(ART14_DEADLINE_DAYS - 1),
        outreachSentAt: null,
        now: NOW,
      }).state,
    ).toBe("warning");

    const overdue = outreachDeadline({
      sourcedAt: sourcedDaysAgo(ART14_DEADLINE_DAYS + 4),
      outreachSentAt: null,
      now: NOW,
    });
    expect(overdue.state).toBe("overdue");
    expect(overdue.remainingDays).toBe(-4);
  });

  it("stops the clock once the information went out", () => {
    const deadline = outreachDeadline({
      sourcedAt: sourcedDaysAgo(90),
      outreachSentAt: sourcedDaysAgo(80),
      now: NOW,
    });

    expect(deadline.state).toBe("informed");
  });

  it("treats a missing collection date as a case to look at, not as fine", () => {
    // Ohne sourced_at lässt sich die Frist nicht rechnen. "Alles in Ordnung"
    // wäre die gefährliche Annahme.
    expect(
      outreachDeadline({ sourcedAt: null, outreachSentAt: null, now: NOW }).state,
    ).toBe("overdue");
    expect(
      outreachDeadline({
        sourcedAt: null,
        outreachSentAt: sourcedDaysAgo(1),
        now: NOW,
      }).state,
    ).toBe("informed");
  });

  it("ignores an unparseable timestamp instead of producing NaN days", () => {
    const deadline = outreachDeadline({
      sourcedAt: "kein datum",
      outreachSentAt: null,
      now: NOW,
    });

    expect(deadline.state).toBe("overdue");
    expect(Number.isNaN(deadline.ageDays)).toBe(false);
  });

  it("sorts the most urgent case to the top", () => {
    const overdue = outreachDeadline({
      sourcedAt: sourcedDaysAgo(40),
      outreachSentAt: null,
      now: NOW,
    });
    const fresh = outreachDeadline({
      sourcedAt: sourcedDaysAgo(1),
      outreachSentAt: null,
      now: NOW,
    });

    expect([fresh, overdue].sort(byUrgency)[0]).toBe(overdue);
  });
});
