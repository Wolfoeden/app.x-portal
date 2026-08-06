import { describe, expect, it } from "vitest";

import {
  mapFreelancerProfileRow,
  type FreelancerProfileRow,
} from "@/lib/data/freelancers";

const row: FreelancerProfileRow = {
  id: "00000000-0000-4000-8000-000000000001",
  display_name: "Anna Keller",
  role_title: "React Engineer",
  skill_tags: ["React", "TypeScript"],
  languages: ["de"],
  location_text: "Berlin",
  work_modes: ["remote"],
  experience_summary: "Eight years building web products.",
  verified_facts: [
    "Skill: React",
    "Language: German",
    "Qualification: IREB CPRE",
    "Contract capability: NDA",
  ],
  self_reported_facts: ["Skill: TypeScript", "Location: Berlin"],
  verification_status: "references_checked",
  hourly_rate_minor: 8500,
  day_rate_minor: 68000,
  currency: "EUR",
  profile_status: "active",
  availability_status: "available",
  availability_from: "2026-08-15",
  availability_updated_at: "2026-08-06T08:00:00.000Z",
  intro_policy: "manual_approval",
  booking_url: null,
  demo_status: "demo",
  version: 3,
};

describe("freelancer database mapping", () => {
  it("does not upgrade facts without verified provenance", () => {
    const profile = mapFreelancerProfileRow(row);

    expect(profile.skillTags).toEqual([
      { value: "React", source: "verified" },
      { value: "TypeScript", source: "self_reported" },
    ]);
    expect(profile.location?.source).toBe("self_reported");
    expect(profile.languages).toContainEqual({
      value: "German",
      source: "verified",
    });
    expect(profile.qualifications).toContainEqual({
      value: "IREB CPRE",
      source: "verified",
    });
    expect(profile.hourlyRate?.amount).toBe(85);
    expect(profile.introPolicy.type).toBe("premium");
  });
});
