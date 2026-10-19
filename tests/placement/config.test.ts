import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PLACEMENT_TERMS,
  clientBookingUrl,
  formatWholeEuro,
  placementExampleFeeCents,
  placementFeeCents,
  placementTermsSummary,
} from "@/lib/placement/config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("placement model settings", () => {
  // Das Beispiel aus dem Plan: 592 € Median-Tagessatz, 60 Projekttage.
  it("charges 10 % of the first three months, capped at 60 project days", () => {
    expect(placementFeeCents(59_200, 60)).toBe(355_200);
    expect(placementFeeCents(59_200, 90)).toBe(355_200);
    expect(placementFeeCents(80_000, 20)).toBe(160_000);
    expect(placementFeeCents(0, 60)).toBe(0);
    expect(placementFeeCents(59_200, -3)).toBe(0);
  });

  it("states subscription payment and freelancer consent without a new fee agreement", () => {
    const text = placementTermsSummary().join(" ");

    expect(text).toContain("Software-Nutzung");
    expect(text).toContain("keine Vermittlungsprovision");
    expect(text).toContain("Freelancer entscheidet selbst");
    expect(text).not.toContain(`${PLACEMENT_TERMS.feePercent} %`);
  });

  it("keeps the freelancer's calendar out of the browser", () => {
    const calendar = "https://calendly.com/beispiel";

    expect(clientBookingUrl("p1", calendar, "https://x-portal.eu")).toBe("https://x-portal.eu/api/freelancers/p1/book");
    expect(clientBookingUrl("p1", calendar, "https://x-portal.eu/")).toBe(
      "https://x-portal.eu/api/freelancers/p1/book",
    );
    expect(clientBookingUrl("p1", null, "https://x-portal.eu")).toBeNull();
  });
});

describe("the worked example", () => {
  it("comes to 900 € net for 15 project days at 600 €", () => {
    expect(placementExampleFeeCents()).toBe(90_000);
    expect(formatWholeEuro(placementExampleFeeCents()).replace(/\s/gu, " ")).toBe("900 €");
  });
});
