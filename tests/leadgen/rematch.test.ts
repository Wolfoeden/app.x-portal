import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  fetchProfiles: vi.fn(),
  buildShortlist: vi.fn(),
  leads: [] as Record<string, unknown>[],
  shortlists: [] as Record<string, unknown>[],
  updates: [] as { id: number; patch: Record<string, unknown> }[],
}));

vi.mock("@/lib/data/freelancers", () => ({
  fetchActiveBookableRealProfiles: mocks.fetchProfiles,
}));

vi.mock("@/lib/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/domain")>();
  return { ...actual, buildShortlist: mocks.buildShortlist };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from(tabelle: string) {
      if (tabelle === "leadgen_queue") {
        const bauer = {
          select: () => bauer,
          eq: () => bauer,
          not: () => bauer,
          is: () => bauer,
          order: () => bauer,
          limit: async () => ({ data: mocks.leads, error: null }),
          update(patch: Record<string, unknown>) {
            return {
              eq: async (_spalte: string, id: number) => {
                mocks.updates.push({ id, patch });
                return { error: null };
              },
            };
          },
        };
        return bauer;
      }
      const listen = {
        select: () => listen,
        in: () => listen,
        order: async () => ({ data: mocks.shortlists, error: null }),
      };
      return listen;
    },
  }),
}));

import { parseFallbackBrief } from "@/lib/domain";
import { runLeadRematchPass } from "@/lib/leadgen/rematch";

const BRIEF = parseFallbackBrief("React und TypeScript, remote.", {
  now: new Date("2026-09-01T10:00:00.000Z"),
});

function lead(patch: Record<string, unknown> = {}) {
  return {
    id: 1,
    company: "Beispiel GmbH",
    recipient_email: "kontakt@beispiel.de",
    stellenanzeige: "React-Entwickler gesucht",
    ...patch,
  };
}

describe("runLeadRematchPass", () => {
  beforeEach(() => {
    mocks.leads = [];
    mocks.shortlists = [];
    mocks.updates = [];
    mocks.fetchProfiles.mockReset();
    mocks.buildShortlist.mockReset();
    mocks.fetchProfiles.mockResolvedValue([{ id: "p1" }]);
    mocks.buildShortlist.mockReturnValue({ status: "no_reliable_match", matches: [] });
  });

  it("holt einen Lead zurück, der jetzt einen Treffer hat", async () => {
    mocks.leads = [lead()];
    mocks.shortlists = [{ lead_id: 1, brief_snapshot: BRIEF, created_at: "2026-09-01" }];
    mocks.buildShortlist.mockReturnValue({
      status: "ranked",
      matches: [{ profile: { displayName: "Nikolai Schankin" } }],
    });

    const ergebnis = await runLeadRematchPass();

    expect(ergebnis.revived).toBe(1);
    expect(ergebnis.leads[0]!.matched).toEqual(["Nikolai Schankin"]);
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0]!.patch).toMatchObject({
      status: "new",
      archived_at: null,
    });
  });

  it("lässt liegen, was weiterhin niemanden findet", async () => {
    mocks.leads = [lead()];
    mocks.shortlists = [{ lead_id: 1, brief_snapshot: BRIEF, created_at: "2026-09-01" }];

    const ergebnis = await runLeadRematchPass();

    expect(ergebnis.stillEmpty).toBe(1);
    expect(ergebnis.revived).toBe(0);
    expect(mocks.updates).toHaveLength(0);
  });

  it("fasst einen Lead ohne gespeicherten Bedarf nicht an", async () => {
    // Ihn erneut vom Modell lesen zu lassen kostete Geld — für ein Archivstück
    // ist das den Aufwand nicht wert.
    mocks.leads = [lead()];
    mocks.shortlists = [];

    const ergebnis = await runLeadRematchPass();

    expect(ergebnis.withoutBrief).toBe(1);
    expect(mocks.buildShortlist).not.toHaveBeenCalled();
    expect(mocks.updates).toHaveLength(0);
  });

  it("übergeht Leads, deren Ausschreibung abgelaufen ist", async () => {
    // Nach dreissig Tagen wird der Text durch einen Vermerk ersetzt. Ein
    // solcher Lead beschreibt keinen Bedarf mehr und wird nicht wiederbelebt.
    mocks.leads = [
      lead({ stellenanzeige: "[Ausschreibung nach 30 Tagen entfernt - veraltet]" }),
    ];
    mocks.shortlists = [{ lead_id: 1, brief_snapshot: BRIEF, created_at: "2026-09-01" }];

    const ergebnis = await runLeadRematchPass();

    expect(ergebnis.examined).toBe(0);
    expect(mocks.updates).toHaveLength(0);
  });

  it("nimmt je Lead den jüngsten Bedarf", async () => {
    mocks.leads = [lead()];
    mocks.shortlists = [
      { lead_id: 1, brief_snapshot: BRIEF, created_at: "2026-09-05" },
      { lead_id: 1, brief_snapshot: { kaputt: true }, created_at: "2026-09-01" },
    ];
    mocks.buildShortlist.mockReturnValue({
      status: "ranked",
      matches: [{ profile: { displayName: "A" } }],
    });

    const ergebnis = await runLeadRematchPass();
    expect(ergebnis.revived).toBe(1);
  });

  it("schreibt im Trockenlauf nichts", async () => {
    mocks.leads = [lead()];
    mocks.shortlists = [{ lead_id: 1, brief_snapshot: BRIEF, created_at: "2026-09-01" }];
    mocks.buildShortlist.mockReturnValue({
      status: "ranked",
      matches: [{ profile: { displayName: "A" } }],
    });

    const ergebnis = await runLeadRematchPass({ dryRun: true });

    expect(ergebnis.revived).toBe(1);
    expect(mocks.updates).toHaveLength(0);
  });
});
