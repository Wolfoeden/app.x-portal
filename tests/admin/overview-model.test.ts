import { describe, expect, it } from "vitest";

import {
  activityLabel,
  berlinDayKey,
  countBetween,
  dailySeries,
  deltaLabel,
  explainHttpFailure,
  jobTone,
  leadSearchTone,
  parseOverviewRange,
  rangeWindow,
  relativeTime,
} from "@/lib/admin/overview-model";
import {
  isLeadAutomationPaused,
  leadAutomationSummary,
  scheduledPrepareAllowed,
  scheduledSendAllowed,
} from "@/lib/leadgen/automation-model";

const NOW = new Date("2026-10-02T10:30:00.000Z"); // 12:30 Uhr in Berlin

describe("overview ranges", () => {
  it("defaults to seven days and accepts only the offered ranges", () => {
    expect(parseOverviewRange(undefined)).toBe(7);
    expect(parseOverviewRange("1")).toBe(1);
    expect(parseOverviewRange("30")).toBe(30);
    expect(parseOverviewRange("365")).toBe(7);
  });

  it("starts today at midnight in Berlin and compares with yesterday", () => {
    const { start, previousStart } = rangeWindow(1, NOW);
    expect(start.toISOString()).toBe("2026-10-01T22:00:00.000Z");
    expect(previousStart.toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  it("compares a rolling window with the same length before it", () => {
    const { start, previousStart } = rangeWindow(7, NOW);
    expect(start.toISOString()).toBe("2026-09-25T10:30:00.000Z");
    expect(previousStart.toISOString()).toBe("2026-09-18T10:30:00.000Z");
  });

  it("counts timestamps inside a half-open window", () => {
    const from = new Date("2026-10-01T00:00:00Z");
    const to = new Date("2026-10-02T00:00:00Z");
    expect(countBetween(["2026-10-01T00:00:00Z", "2026-10-01T23:59:59Z", "2026-10-02T00:00:00Z", "kaputt"], from, to)).toBe(2);
  });

  it("buckets by Berlin day, including the last hours before midnight UTC", () => {
    expect(berlinDayKey("2026-10-01T22:30:00Z")).toBe("2026-10-02");
    const series = dailySeries(["2026-10-01T22:30:00Z", "2026-10-02T09:00:00Z", "2026-09-30T12:00:00Z"], 3, NOW);
    expect(series).toEqual([
      { day: "2026-09-30", count: 1 },
      { day: "2026-10-01", count: 0 },
      { day: "2026-10-02", count: 2 },
    ]);
  });
});

describe("deltas", () => {
  it("names direction and judges it", () => {
    expect(deltaLabel(12, 10)).toEqual({ text: "+20 % zum Vorzeitraum", tone: "good" });
    expect(deltaLabel(5, 10)).toEqual({ text: "-50 % zum Vorzeitraum", tone: "bad" });
    expect(deltaLabel(3, 0)).toEqual({ text: "+3 zum Vorzeitraum", tone: "good" });
    expect(deltaLabel(4, 4).tone).toBe("neutral");
    expect(deltaLabel(2, 1, false).tone).toBe("bad");
  });
});

describe("system health", () => {
  const job = { name: "x", schedule: "* * * * *", active: true, lastRunAt: null, lastStatus: "succeeded", lastMessage: null, runs24h: 10, failures24h: 0 };

  it("rates jobs by their failures", () => {
    expect(jobTone(job)).toBe("good");
    expect(jobTone({ ...job, failures24h: 2 })).toBe("warning");
    expect(jobTone({ ...job, failures24h: 2, lastStatus: "failed" })).toBe("critical");
    expect(jobTone({ ...job, active: false, failures24h: 5 })).toBe("neutral");
  });

  it("explains the known failures in words", () => {
    expect(explainHttpFailure({ status: 503, lastBody: '{"error":"cron_secret_unconfigured"}', lastError: null }).title).toBe(
      "Edge Function outreach-agent",
    );
    expect(explainHttpFailure({ status: 401, lastBody: '{"error":"Ungültiges Token."}', lastError: null }).hint).toMatch(
      /PLACEMENT_RUN_SECRET/u,
    );
    expect(explainHttpFailure({ status: 0, lastBody: null, lastError: "Timeout" })).toEqual({ title: "Keine Antwort", hint: "Timeout" });
  });

  it("sees whether the lead search routine is alive, allowing for a weekend", () => {
    expect(leadSearchTone("2026-10-02T04:25:00Z", NOW)).toBe("good");
    expect(leadSearchTone("2026-09-30T04:25:00Z", NOW)).toBe("warning");
    expect(leadSearchTone("2026-09-20T04:25:00Z", NOW)).toBe("critical");
    expect(leadSearchTone(null, NOW)).toBe("critical");
  });
});

describe("activity feed", () => {
  it("shows what people did and hides empty runs", () => {
    expect(activityLabel("intro_requested", null)).toBe("Freelancer angefragt");
    expect(activityLabel("leadgen_match_run", { mode: "prepare", examined: 0, prepared: 0, sent: 0 })).toBeNull();
    expect(activityLabel("leadgen_match_run", { mode: "prepare", examined: 2, prepared: 1 })).toBe(
      "Lead-Abgleich: 2 geprüft, 1 Entwürfe",
    );
    expect(activityLabel("project_accessed", null)).toBeNull();
  });

  it("says how long ago", () => {
    expect(relativeTime("2026-10-02T10:29:40Z", NOW)).toBe("gerade eben");
    expect(relativeTime("2026-10-02T10:00:00Z", NOW)).toBe("vor 30 Min.");
    expect(relativeTime("2026-10-02T07:30:00Z", NOW)).toBe("vor 3 Std.");
    expect(relativeTime("2026-09-30T07:30:00Z", NOW)).toBe("30.09., 09:30");
  });
});

describe("lead automation rules", () => {
  const base = { prepareMode: "scheduled", sendMode: "manual", pausedUntil: null, dailyLimit: null } as const;

  it("sends on schedule only when switched on and not paused", () => {
    expect(scheduledSendAllowed(base, NOW)).toBe(false);
    expect(scheduledSendAllowed({ ...base, sendMode: "scheduled" }, NOW)).toBe(true);
    expect(scheduledSendAllowed({ ...base, sendMode: "scheduled", pausedUntil: "2026-10-03T04:00:00Z" }, NOW)).toBe(false);
    expect(isLeadAutomationPaused({ pausedUntil: "2026-10-01T04:00:00Z" }, NOW)).toBe(false);
  });

  it("prepares on schedule unless set to manual", () => {
    expect(scheduledPrepareAllowed(base, NOW)).toBe(true);
    expect(scheduledPrepareAllowed({ ...base, prepareMode: "on_arrival" }, NOW)).toBe(true);
    expect(scheduledPrepareAllowed({ ...base, prepareMode: "manual" }, NOW)).toBe(false);
  });

  it("summarises the state in one sentence", () => {
    expect(leadAutomationSummary(base, 160, NOW)).toBe("Abgleich nach Zeitplan · Versand nur nach Freigabe.");
    expect(leadAutomationSummary({ ...base, sendMode: "scheduled", dailyLimit: 20 }, 160, NOW)).toBe(
      "Abgleich nach Zeitplan · Versand automatisch Mo–Fr 8–12 Uhr, höchstens 20 am Tag.",
    );
    expect(leadAutomationSummary({ ...base, pausedUntil: "2026-10-03T04:00:00Z" }, 160, NOW)).toBe(
      "Angehalten bis 03.10., 06:00 Uhr.",
    );
  });
});
