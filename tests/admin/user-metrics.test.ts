import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));

type UserMetricsModule = typeof import("@/lib/admin/user-metrics");
let buildUserMetrics: UserMetricsModule["buildUserMetrics"];

beforeAll(async () => {
  ({ buildUserMetrics } = await import("@/lib/admin/user-metrics"));
});

describe("admin user metrics exclusions", () => {
  it("removes the internal account from every account and activity metric", () => {
    const report = buildUserMetrics({
      now: new Date("2026-09-04T12:00:00.000Z"),
      truncated: false,
      accounts: [
        {
          id: "roman-id",
          email: " ROMAN@DERING.INFO ",
          createdAt: "2026-09-04T08:00:00.000Z",
          lastSignInAt: "2026-09-04T09:00:00.000Z",
          anonymous: false,
        },
        {
          id: "customer-id",
          email: "customer@example.test",
          createdAt: "2026-09-04T08:30:00.000Z",
          lastSignInAt: "2026-09-04T09:30:00.000Z",
          anonymous: false,
        },
      ],
      projects: new Map([
        ["roman-id", { count: 50, last: "2026-09-04T10:00:00.000Z" }],
        ["customer-id", { count: 1, last: "2026-09-04T10:00:00.000Z" }],
      ]),
      messages: new Map([
        ["roman-id", { count: 100, last: "2026-09-04T10:00:00.000Z" }],
        ["customer-id", { count: 2, last: "2026-09-04T10:00:00.000Z" }],
      ]),
    });

    expect(report.excludedAccounts).toBe(1);
    expect(report.totals).toMatchObject({ accounts: 1, registered: 1, guests: 0 });
    expect(report.activity.day.active).toBe(1);
    expect(report.registeredAccounts.map((row) => row.userId)).toEqual(["customer-id"]);
    expect(report.registrationsByDay).toEqual([
      { date: "2026-09-04", registered: 1, guests: 0 },
    ]);
  });
});
