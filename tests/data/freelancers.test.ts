import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchActiveBookableRealProfiles,
  fetchRealProfilesByIds,
  mapFreelancerProfileRow,
  type FreelancerProfileRow,
} from "@/lib/data/freelancers";

const row: FreelancerProfileRow = {
  id: "00000000-0000-4000-8000-000000000001",
  display_name: "Anna Keller",
  role_title: "React Engineer",
  skill_tags: ["Skill: React", "Skill: TypeScript", "Experience: Web delivery"],
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
  booking_url: "https://calendly.com/example/anna",
  demo_status: "real",
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
    expect(profile.skillTags.map((fact) => fact.value)).not.toContain("Experience: Web delivery");
  });

  it("requests and defensively returns only real, active, securely bookable profiles", async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const query = {
      select(value: string) {
        calls.push(["select", value]);
        return query;
      },
      eq(column: string, value: unknown) {
        calls.push(["eq", column, value]);
        return query;
      },
      not(column: string, operator: string, value: unknown) {
        calls.push(["not", column, operator, value]);
        return query;
      },
      in(column: string, values: unknown[]) {
        calls.push(["in", column, values]);
        return Promise.resolve({
          data: [
            row,
            { ...row, id: "00000000-0000-4000-8000-000000000002", demo_status: "demo" },
            { ...row, id: "00000000-0000-4000-8000-000000000003", booking_url: "http://example.test/book" },
            { ...row, id: "00000000-0000-4000-8000-000000000004", availability_status: "unavailable" },
          ],
          error: null,
        });
      },
    };
    const client = {
      from(table: string) {
        calls.push(["from", table]);
        return query;
      },
    } as unknown as SupabaseClient;

    const profiles = await fetchActiveBookableRealProfiles(client);

    expect(profiles.map((profile) => profile.id)).toEqual([row.id]);
    expect(calls).toContainEqual(["eq", "profile_status", "active"]);
    expect(calls).toContainEqual(["eq", "demo_status", "real"]);
    expect(calls).toContainEqual(["not", "booking_url", "is", null]);
    expect(calls).toContainEqual([
      "in",
      "availability_status",
      ["available", "limited", "unknown"],
    ]);
  });

  it("reloads real historical profiles even when they are no longer bookable", async () => {
    const historical = {
      ...row,
      availability_status: "unavailable" as const,
      booking_url: null,
    };
    const query = {
      select() {
        return query;
      },
      eq() {
        return query;
      },
      in() {
        return Promise.resolve({
          data: [
            historical,
            { ...historical, id: "00000000-0000-4000-8000-000000000099", demo_status: "demo" },
          ],
          error: null,
        });
      },
    };
    const client = {
      from() {
        return query;
      },
    } as unknown as SupabaseClient;

    const profiles = await fetchRealProfilesByIds(client, [row.id]);

    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.availability.status).toBe("unavailable");
    expect(profiles[0]?.introPolicy.bookingUrl).toBeNull();
  });
});
