import { afterEach, describe, expect, it } from "vitest";

import {
  isExcludedAnalyticsUser,
  isPlatformAnalyticsExcludedEmail,
  platformAnalyticsExcludedUserIds,
} from "@/lib/admin/analytics-exclusions";

const originalConfiguredEmails = process.env.PLATFORM_ANALYTICS_EXCLUDED_EMAILS;

afterEach(() => {
  if (originalConfiguredEmails === undefined) {
    delete process.env.PLATFORM_ANALYTICS_EXCLUDED_EMAILS;
  } else {
    process.env.PLATFORM_ANALYTICS_EXCLUDED_EMAILS = originalConfiguredEmails;
  }
});

describe("platform analytics exclusions", () => {
  it("excludes no address unless one is configured", () => {
    delete process.env.PLATFORM_ANALYTICS_EXCLUDED_EMAILS;
    expect(isPlatformAnalyticsExcludedEmail("admin@example.test")).toBe(false);
    expect(isPlatformAnalyticsExcludedEmail(null)).toBe(false);
  });

  it("normalizes configured internal addresses", () => {
    process.env.PLATFORM_ANALYTICS_EXCLUDED_EMAILS =
      " qa@example.test, OPS@example.test ";
    expect(isPlatformAnalyticsExcludedEmail("  QA@example.test ")).toBe(true);
    expect(isPlatformAnalyticsExcludedEmail("ops@example.test")).toBe(true);
    expect(isPlatformAnalyticsExcludedEmail("customer@example.test")).toBe(false);
  });

  it("resolves admin accounts and configured addresses to stable user IDs", () => {
    process.env.PLATFORM_ANALYTICS_EXCLUDED_EMAILS = "qa@example.test";
    const excluded = platformAnalyticsExcludedUserIds(
      new Map([
        ["admin-id", "admin@example.test"],
        ["qa-id", "qa@example.test"],
        ["customer-id", "customer@example.test"],
        ["guest-id", null],
      ]),
      new Set(["admin-id"]),
    );
    expect([...excluded].sort()).toEqual(["admin-id", "qa-id"]);
    expect(isExcludedAnalyticsUser("admin-id", excluded)).toBe(true);
    expect(isExcludedAnalyticsUser("customer-id", excluded)).toBe(false);
    expect(isExcludedAnalyticsUser(null, excluded)).toBe(false);
  });
});
