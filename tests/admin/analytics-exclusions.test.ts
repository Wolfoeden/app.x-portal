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
  it("normalizes the built-in internal email", () => {
    expect(isPlatformAnalyticsExcludedEmail("  ROMAN@DERING.INFO ")).toBe(true);
    expect(isPlatformAnalyticsExcludedEmail("customer@example.test")).toBe(false);
    expect(isPlatformAnalyticsExcludedEmail(null)).toBe(false);
  });

  it("supports additional configured internal accounts", () => {
    process.env.PLATFORM_ANALYTICS_EXCLUDED_EMAILS =
      " qa@example.test, OPS@example.test ";
    expect(isPlatformAnalyticsExcludedEmail("qa@example.test")).toBe(true);
    expect(isPlatformAnalyticsExcludedEmail("ops@example.test")).toBe(true);
  });

  it("resolves only matching auth identities to stable user IDs", () => {
    const excluded = platformAnalyticsExcludedUserIds(
      new Map([
        ["roman-id", "roman@dering.info"],
        ["customer-id", "customer@example.test"],
        ["guest-id", null],
      ]),
    );
    expect([...excluded]).toEqual(["roman-id"]);
    expect(isExcludedAnalyticsUser("roman-id", excluded)).toBe(true);
    expect(isExcludedAnalyticsUser("customer-id", excluded)).toBe(false);
    expect(isExcludedAnalyticsUser(null, excluded)).toBe(false);
  });
});
