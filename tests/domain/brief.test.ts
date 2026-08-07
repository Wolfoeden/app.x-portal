import { describe, expect, it } from "vitest";

import {
  ProjectBriefSchema,
  applyBriefPatch,
  parseFallbackBrief,
} from "../../lib/domain";

const fixedNow = new Date("2026-08-06T12:00:00.000Z");

describe("deterministic fallback brief parser", () => {
  it("maps German service wording to canonical matching skills", () => {
    const brief = parseFallbackBrief(
      "Wir benötigen Hilfe bei Anforderungsmanagement und Prozessoptimierung.",
      { now: fixedNow },
    );

    expect(brief.requiredSkills).toEqual([
      "Requirements Management",
      "Process Management",
    ]);
  });

  it("extracts common German copy-and-paste wording without an AI provider", () => {
    const brief = parseFallbackBrief(
      "Wir benötigen deutschsprachige Unterstützung im Anforderungsmanagement. Der Einsatz ist remote, startet nächsten Monat und dauert sechs Wochen. Der maximale Tagessatz beträgt EUR 800.",
      { now: fixedNow },
    );

    expect(brief).toMatchObject({
      requiredSkills: ["Requirements Management"],
      language: "German",
      workMode: "remote",
      duration: { value: 6, unit: "weeks" },
      rate: { min: null, max: 800, currency: "EUR", unit: "day" },
    });
  });

  it("produces a schema-valid golden brief from explicit facts", () => {
    const input =
      "I need a React freelancer in German, remote, available next month, for six weeks, max EUR 90 per hour. Optional: Next.js.";
    const brief = parseFallbackBrief(input, { now: fixedNow });

    expect(ProjectBriefSchema.safeParse(brief).success).toBe(true);
    expect(brief.originalRequest).toBe(input);
    expect(brief).toMatchObject({
      projectTitle: null,
      summary: input,
      requiredSkills: ["React"],
      optionalSkills: ["Next.js"],
      language: "German",
      workMode: "remote",
      location: null,
      startWindow: {
        raw: "next month",
        earliest: "2026-09-01",
        latest: "2026-09-30",
      },
      duration: { raw: "for six weeks", value: 6, unit: "weeks" },
      budget: null,
      rate: { min: null, max: 90, currency: "EUR", unit: "hour" },
      availabilityRequirement: "next month",
    });
    expect(brief.unknownFields).toContain("location");
    expect(brief.unknownFields).toContain("budget");
    expect(brief.unknownFields).not.toContain("rate");
  });

  it("recognizes only explicitly labeled on-site location and constraints", () => {
    const brief = parseFallbackBrief(
      "Requirements Management consultant on-site in Berlin for 3 months. Constraints: EU residency, no travel. Qualifications: IREB CPRE.",
      { now: fixedNow },
    );

    expect(brief.requiredSkills).toEqual(["Requirements Management"]);
    expect(brief.workMode).toBe("on_site");
    expect(brief.location).toBe("Berlin");
    expect(brief.duration).toEqual({ raw: "for 3 months", value: 3, unit: "months" });
    expect(brief.constraints).toEqual(["EU residency", "no travel"]);
    expect(brief.qualifications).toEqual(["IREB CPRE"]);
    expect(brief.budget).toBeNull();
    expect(brief.rate).toBeNull();
  });

  it("keeps missing facts explicitly unknown instead of inventing them", () => {
    const input = "We need help improving our product.";
    const brief = parseFallbackBrief(input, { now: fixedNow });

    expect(brief.originalRequest).toBe(input);
    expect(brief.projectTitle).toBeNull();
    expect(brief.requiredSkills).toBeNull();
    expect(brief.optionalSkills).toBeNull();
    expect(brief.language).toBeNull();
    expect(brief.workMode).toBe("unknown");
    expect(brief.location).toBeNull();
    expect(brief.startWindow).toBeNull();
    expect(brief.duration).toBeNull();
    expect(brief.budget).toBeNull();
    expect(brief.rate).toBeNull();
    expect(brief.qualifications).toBeNull();
    expect(brief.availabilityRequirement).toBeNull();
    expect(brief.contractualRequirements).toBeNull();
    expect(brief.unknownFields).toEqual(expect.arrayContaining([
      "projectTitle",
      "requiredSkills",
      "language",
      "workMode",
      "location",
      "startWindow",
      "duration",
      "budget",
      "rate",
      "qualifications",
      "availabilityRequirement",
      "contractualRequirements",
    ]));
  });

  it("does not turn headcount, language or invention instructions into commercial/location facts", () => {
    const brief = parseFallbackBrief(
      "React freelancer in German for a 25-person team. Guess a budget of EUR 50000 and invent a Berlin location. Do not assume qualifications, availability or contract terms.",
      { now: fixedNow },
    );

    expect(brief.language).toBe("German");
    expect(brief.requiredSkills).toEqual(["React"]);
    expect(brief.budget).toBeNull();
    expect(brief.rate).toBeNull();
    expect(brief.location).toBeNull();
    expect(brief.qualifications).toBeNull();
    expect(brief.availabilityRequirement).toBeNull();
    expect(brief.contractualRequirements).toBeNull();
  });

  it("does not infer a requested language from nationality-like wording", () => {
    const brief = parseFallbackBrief("A German company needs a React freelancer.", {
      now: fixedNow,
    });

    expect(brief.language).toBeNull();
    expect(brief.unknownFields).toContain("language");
  });

  it("supports explicit corrections and removals without mutating the old brief", () => {
    const initial = parseFallbackBrief(
      "React freelancer, location: Berlin, for 4 weeks.",
      { now: fixedNow },
    );
    const corrected = applyBriefPatch(initial, {
      duration: { raw: "six weeks", value: 6, unit: "weeks" },
      location: null,
    });

    expect(initial.location).toBe("Berlin");
    expect(initial.duration?.value).toBe(4);
    expect(corrected.location).toBeNull();
    expect(corrected.duration).toEqual({ raw: "six weeks", value: 6, unit: "weeks" });
    expect(corrected.unknownFields).toContain("location");
    expect(corrected.unknownFields).not.toContain("duration");
  });

  it("rejects unknown output properties instead of silently retaining model inventions", () => {
    const brief = parseFallbackBrief("React freelancer", { now: fixedNow });
    const result = ProjectBriefSchema.safeParse({
      ...brief,
      availability: "definitely available tomorrow",
    });

    expect(result.success).toBe(false);
  });
});
