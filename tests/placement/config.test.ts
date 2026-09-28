import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PLACEMENT_TERMS,
  clientBookingUrl,
  placementFeeCents,
  placementRequestsEnabled,
  placementTermsSummary,
} from "@/lib/placement/config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("placement model settings", () => {
  it("is off unless the switch is set to exactly true", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "");
    expect(placementRequestsEnabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "1");
    expect(placementRequestsEnabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    expect(placementRequestsEnabled()).toBe(true);
  });

  // Das Beispiel aus dem Plan: 592 € Median-Tagessatz, 60 Projekttage.
  it("charges 10 % of the first three months, capped at 60 project days", () => {
    expect(placementFeeCents(59_200, 60)).toBe(355_200);
    expect(placementFeeCents(59_200, 90)).toBe(355_200);
    expect(placementFeeCents(80_000, 20)).toBe(160_000);
    expect(placementFeeCents(0, 60)).toBe(0);
    expect(placementFeeCents(59_200, -3)).toBe(0);
  });

  it("states fee, period, cap and protection in the consent text", () => {
    const text = placementTermsSummary().join(" ");

    expect(text).toContain("kostenlos");
    expect(text).toContain(`${PLACEMENT_TERMS.feePercent} %`);
    expect(text).toContain(`ersten ${PLACEMENT_TERMS.feeMonths} Monate`);
    expect(text).toContain(`${PLACEMENT_TERMS.maxFeeDays} Projekttage`);
    expect(text).toContain(`${PLACEMENT_TERMS.protectionMonths} Monaten`);
  });

  it("keeps the freelancer's calendar out of the browser once the switch is on", () => {
    const calendar = "https://calendly.com/beispiel";

    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "false");
    expect(clientBookingUrl("p1", calendar, "https://x-portal.eu")).toBe(calendar);

    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    expect(clientBookingUrl("p1", calendar, "https://x-portal.eu/")).toBe(
      "https://x-portal.eu/api/freelancers/p1/book",
    );
    expect(clientBookingUrl("p1", null, "https://x-portal.eu")).toBeNull();
  });
});
