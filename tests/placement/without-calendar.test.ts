import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildShortlist, FreelancerProfileSchema, parseFallbackBrief } from "@/lib/domain";
import { fetchActiveBookableRealProfiles, type FreelancerProfileRow } from "@/lib/data/freelancers";
import { profileFixtures } from "../domain/fixtures";

const row: FreelancerProfileRow = {
  id: "00000000-0000-4000-8000-000000000010",
  display_name: "Ohne Kalender",
  role_title: "React Engineer",
  skill_tags: ["Skill: React"],
  languages: ["de"],
  location_text: "Berlin",
  work_modes: ["remote"],
  experience_summary: "Baut React-Anwendungen.",
  verified_facts: [],
  self_reported_facts: ["Skill: React"],
  verification_status: "unverified",
  hourly_rate_minor: null,
  day_rate_minor: 60_000,
  currency: "EUR",
  profile_status: "active",
  availability_status: "available",
  availability_from: null,
  availability_updated_at: "2026-09-30T08:00:00.000Z",
  intro_policy: "manual_approval",
  booking_url: null,
  demo_status: "real",
  version: 1,
};

function client(rows: FreelancerProfileRow[]) {
  const calls: string[] = [];
  const query = {
    select: () => query,
    eq: () => query,
    neq: (column: string, value: string) => (calls.push(`neq ${column} ${value}`), query),
    not: (column: string) => (calls.push(`not ${column}`), query),
    in: async () => ({ data: rows, error: null }),
  };
  return { client: { from: () => query } as unknown as SupabaseClient, calls };
}

afterEach(() => vi.unstubAllEnvs());

describe("profiles without a calendar", () => {
  it("stay out of the catalogue while clients book calendars directly", async () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "false");
    const { client: supabase, calls } = client([row]);
    expect(await fetchActiveBookableRealProfiles(supabase)).toEqual([]);
    expect(calls).toContain("not booking_url");
  });

  it("are found and recommended once clients request through XPORTAL", async () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    const { client: supabase, calls } = client([row, { ...row, id: "00000000-0000-4000-8000-000000000011", booking_url: "http://unsicher.example" }]);
    const profiles = await fetchActiveBookableRealProfiles(supabase);
    expect(profiles.map((profile) => profile.id)).toEqual([row.id]);
    expect(calls).not.toContain("not booking_url");
    expect(calls).toContain("neq seeking employment");

    const shortlist = buildShortlist(parseFallbackBrief("React remote"), profiles);
    expect(shortlist.status).toBe("ranked");
    expect(shortlist.matches[0]?.profile.id).toBe(row.id);
  });

  it("keep the old rule in matching when the model is off", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "false");
    const profile = FreelancerProfileSchema.parse({
      ...profileFixtures[0],
      introPolicy: { ...profileFixtures[0].introPolicy, bookingUrl: null },
    });
    const shortlist = buildShortlist(parseFallbackBrief("React remote"), [profile]);
    expect(shortlist.matches).toHaveLength(0);
  });
});
