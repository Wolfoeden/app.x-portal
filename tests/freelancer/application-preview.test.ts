import { describe, expect, it } from "vitest";

import {
  applicationPreviewProfile,
  EMPLOYMENT_RATE_LABEL,
  exampleApplicationPreview,
  previewRate,
  type ApplicationPreviewInput,
} from "@/lib/freelancer/application-preview";

const NOW = new Date("2026-10-02T10:00:00.000Z");

const input = (overrides: Partial<ApplicationPreviewInput> = {}): ApplicationPreviewInput => ({
  fullName: "  Kim Muster ",
  roleTitle: "Data Engineer",
  skills: ["Python", "dbt", "Airflow", "Snowflake", "Kafka"],
  locationText: "Köln",
  workModes: ["remote", "on_site"],
  hourlyRate: "",
  dayRate: "",
  currency: "EUR",
  availabilityStatus: "available",
  availabilityFrom: "2026-11-01",
  bookingUrl: "",
  seeking: "projects",
  ...overrides,
});

describe("the live preview of an application", () => {
  it("builds the customer card from what was typed, unchecked", () => {
    const card = applicationPreviewProfile(input({ dayRate: "760" }), NOW);
    expect(card).toMatchObject({
      displayName: "Kim Muster",
      role: "Data Engineer",
      location: "Köln",
      workModes: ["remote", "on_site"],
      verified: false,
      availability: { status: "available", updatedAt: NOW.toISOString(), availableFrom: "2026-11-01" },
    });
    expect(card.evidence).toHaveLength(4);
    expect(card.evidence.every((entry) => !entry.verified && !entry.required)).toBe(true);
    expect(card.rate).toMatch(/^760\s€ \/ Tag$/u);
  });

  it("uses placeholders until name and role are filled in", () => {
    const card = applicationPreviewProfile(input({ fullName: " ", roleTitle: "", locationText: "" }), NOW);
    expect(card.displayName).toBe("Ihr Name");
    expect(card.role).toBe("Ihre Rolle");
    expect(card.location).toBeNull();
  });

  it("prefers the day rate, accepts a comma and ignores nonsense", () => {
    expect(previewRate({ dayRate: "", hourlyRate: "95,5", currency: "EUR", seeking: "projects" })).toMatch(/^96\s€ \/ Stunde$/u);
    expect(previewRate({ dayRate: "800", hourlyRate: "95", currency: "EUR", seeking: "both" })).toMatch(/\/ Tag$/u);
    expect(previewRate({ dayRate: "abc", hourlyRate: "-3", currency: "EUR", seeking: "projects" })).toBeNull();
  });

  it("shows no fee for someone looking for a permanent job", () => {
    expect(previewRate({ dayRate: "800", hourlyRate: "", currency: "EUR", seeking: "employment" })).toBe(EMPLOYMENT_RATE_LABEL);
  });

  it("shows an entered monthly salary instead of the employment fallback", () => {
    expect(previewRate({ monthlySalary: "6500", dayRate: "", hourlyRate: "", currency: "EUR", seeking: "employment" })).toMatch(/^6\.500\s€ \/ Monat$/u);
  });

  it("has a made-up example for the entry page", () => {
    const example = exampleApplicationPreview(NOW);
    expect(example.displayName).toBe("Anna Beispiel");
    expect(example.verified).toBe(false);
    expect(example.rate).not.toBeNull();
  });
});
