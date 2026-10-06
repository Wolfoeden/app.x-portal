import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { applyBriefPatch, buildShortlist, parseFallbackBrief } from "@/lib/domain";
import { findShownProfile, partialProfileFromSnapshot } from "@/lib/placement/shown-profile";
import { profileFixtures } from "../domain/fixtures";

const fixedNow = new Date("2026-08-13T12:00:00.000Z");

/** Ein echter Teiltreffer, wie ihn die Suche in `partial_matches_snapshot` schreibt. */
function partialSnapshot() {
  const brief = applyBriefPatch(
    parseFallbackBrief("Muss-Anforderungen:\n- React\n- C++\n100% remote", { now: fixedNow }),
    { requiredSkills: ["React", "C++"], workMode: "remote" },
  );
  const shortlist = buildShortlist(brief, [profileFixtures[0]!]);
  expect(shortlist.partialMatches).toHaveLength(1);
  return shortlist.partialMatches.map((match) => ({
    ...match,
    profile: { ...match.profile, introPolicy: { ...match.profile.introPolicy, bookingUrl: null } },
  }));
}

function admin(rows: { matches: unknown; shortlists: unknown }) {
  const tables: string[] = [];
  return {
    tables,
    client: {
      from(name: string) {
        tables.push(name);
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "eq", "order", "limit"]) chain[method] = () => chain;
        chain.maybeSingle = async () => ({ data: rows[name as keyof typeof rows] ?? null, error: null });
        return chain;
      },
    } as never,
  };
}

const INPUT = { projectId: "p", ownerUserId: "u", profileId: profileFixtures[0]!.id };

// 06.10.2026: Teiltreffer stehen nur im Snapshot der Shortlist, nicht in
// `matches`. Die Anfrage an sie scheiterte deshalb immer.
describe("gezeigtes Profil", () => {
  it("findet einen Teiltreffer im Snapshot, ohne Match-Kennung", async () => {
    const { client, tables } = admin({ matches: null, shortlists: { partial_matches_snapshot: partialSnapshot() } });
    const shown = await findShownProfile(client, INPUT);
    expect(shown?.matchId).toBeNull();
    expect(shown?.profile.id).toBe(profileFixtures[0]!.id);
    expect(tables).toEqual(["matches", "shortlists"]);
  });

  it("nimmt zuerst das empfohlene Profil aus matches", async () => {
    const { client, tables } = admin({
      matches: { id: "m1", profile_snapshot: profileFixtures[0] },
      shortlists: null,
    });
    const shown = await findShownProfile(client, INPUT);
    expect(shown?.matchId).toBe("m1");
    expect(tables).toEqual(["matches"]);
  });

  it("kennt kein Profil, das weder empfohlen noch Teiltreffer war", async () => {
    const { client } = admin({ matches: null, shortlists: { partial_matches_snapshot: partialSnapshot() } });
    expect(await findShownProfile(client, { ...INPUT, profileId: "anderes-profil" })).toBeNull();
  });

  it("liest nur gültige Teiltreffer echter Profile", () => {
    const snapshot = partialSnapshot();
    expect(partialProfileFromSnapshot(snapshot, INPUT.profileId)?.id).toBe(INPUT.profileId);
    expect(partialProfileFromSnapshot(null, INPUT.profileId)).toBeNull();
    expect(partialProfileFromSnapshot([{ profile: { id: INPUT.profileId } }], INPUT.profileId)).toBeNull();
    const demo = snapshot.map((match) => ({ ...match, profile: { ...match.profile, demoStatus: "demo" as const } }));
    expect(partialProfileFromSnapshot(demo, INPUT.profileId)).toBeNull();
    const primary = snapshot.map((match) => ({ ...match, recommendationRole: "primary" as const }));
    expect(partialProfileFromSnapshot(primary, INPUT.profileId)).toBeNull();
  });
});
