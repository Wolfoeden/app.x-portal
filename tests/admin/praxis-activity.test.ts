import { describe, expect, it } from "vitest";

import { summarizePraxisActivity, type PraxisActivityRow } from "@/lib/admin/praxis-activity-model";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
let id = 0;
const row = (action: string, target: string | null, at: string, metadata: Record<string, unknown> = {}): PraxisActivityRow => ({
  id: String(++id),
  action,
  target_id: target,
  occurred_at: at,
  metadata,
});

describe("praxis activity", () => {
  it("shows per contact when the page was opened, what was marked last and the calendar", () => {
    const activity = summarizePraxisActivity([
      row("praxis_viewed", A, "2026-10-16T12:10:00Z"),
      row("praxis_interest", A, "2026-10-16T12:11:00Z", { interests: "anfragen" }),
      row("praxis_interest", A, "2026-10-16T12:12:00Z", { interests: "anfragen,servicewissen" }),
      row("sales_call_calendar_opened", A, "2026-10-16T12:13:00Z", { via: "praxis", interests: "anfragen,servicewissen" }),
      row("praxis_viewed", A, "2026-10-17T08:00:00Z"),
      row("praxis_viewed", B, "2026-10-16T09:00:00Z"),
      row("praxis_viewed", null, "2026-10-16T09:00:00Z"),
      row("sales_call_calendar_opened", null, "2026-10-16T09:01:00Z", { via: "praxis" }),
    ]);
    expect(activity.contacts).toEqual([
      {
        contactId: A,
        views: 2,
        firstViewedAt: "2026-10-16T12:10:00Z",
        lastViewedAt: "2026-10-17T08:00:00Z",
        interests: ["Anfragen", "Servicewissen"],
        calendarOpenedAt: "2026-10-16T12:13:00Z",
      },
      { contactId: B, views: 1, firstViewedAt: "2026-10-16T09:00:00Z", lastViewedAt: "2026-10-16T09:00:00Z", interests: [], calendarOpenedAt: null },
    ]);
    expect(activity.anonymousViews).toBe(1);
    expect(activity.anonymousCalendar).toBe(1);
  });

  it("ignores calendar clicks from elsewhere and unknown interest keys", () => {
    const activity = summarizePraxisActivity([
      row("sales_call_calendar_opened", A, "2026-10-16T12:00:00Z", { via: "header" }),
      row("praxis_interest", B, "2026-10-16T12:00:00Z", { interests: "anfragen,<script>" }),
    ]);
    expect(activity.contacts).toEqual([
      { contactId: B, views: 0, firstViewedAt: null, lastViewedAt: null, interests: ["Anfragen"], calendarOpenedAt: null },
    ]);
  });

  it("keeps an emptied selection empty", () => {
    const activity = summarizePraxisActivity([
      row("praxis_interest", A, "2026-10-16T12:00:00Z", { interests: "anfragen" }),
      row("praxis_interest", A, "2026-10-16T12:01:00Z", { interests: null }),
    ]);
    expect(activity.contacts[0]?.interests).toEqual([]);
  });
});
