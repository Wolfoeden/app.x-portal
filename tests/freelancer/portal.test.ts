import { describe, expect, it } from "vitest";

import { FreelancerProfileUpdateSchema } from "@/lib/freelancer/portal";

function validProfile(overrides: Record<string, unknown> = {}) {
  return {
    displayName: "Anna Beispiel",
    roleTitle: "Senior Product Consultant",
    experienceSummary:
      "Ich begleite digitale Produktteams von der Discovery bis zur erfolgreichen Markteinführung.",
    skills: ["Product Strategy", "Figma"],
    languages: ["Deutsch C2", "Englisch C1"],
    qualifications: ["CSPO"],
    industries: ["SaaS"],
    locationText: "Berlin",
    workModes: ["remote", "hybrid"],
    hourlyRate: 145,
    dayRate: 1120,
    currency: "EUR",
    availabilityStatus: "available",
    availabilityFrom: "2026-09-01",
    bookingUrl: "https://cal.com/anna-beispiel/30min",
    profileStatus: "active",
    version: 3,
    ...overrides,
  };
}

describe("freelancer self-service profile validation", () => {
  it("accepts the editable profile contract", () => {
    expect(FreelancerProfileUpdateSchema.parse(validProfile())).toMatchObject({
      displayName: "Anna Beispiel",
      profileStatus: "active",
      version: 3,
    });
  });

  it("deduplicates tag values without changing their display spelling", () => {
    const parsed = FreelancerProfileUpdateSchema.parse(
      validProfile({ skills: ["Figma", "figma", "Product Strategy"] }),
    );
    expect(parsed.skills).toEqual(["Figma", "Product Strategy"]);
  });

  it("requires an HTTPS booking link", () => {
    expect(
      FreelancerProfileUpdateSchema.safeParse(
        validProfile({ bookingUrl: "http://cal.com/anna" }),
      ).success,
    ).toBe(false);
  });

  it("requires at least one rate and one work mode", () => {
    const result = FreelancerProfileUpdateSchema.safeParse(
      validProfile({ hourlyRate: null, dayRate: null, workModes: [] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields so ownership cannot be reassigned by the browser", () => {
    expect(
      FreelancerProfileUpdateSchema.safeParse(
        validProfile({ ownerUserId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }),
      ).success,
    ).toBe(false);
  });
});
