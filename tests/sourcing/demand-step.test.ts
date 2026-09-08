import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  source: vi.fn(),
  importCandidates: vi.fn(),
  resolveBatch: vi.fn(),
  invite: vi.fn(),
  rows: [] as Record<string, unknown>[],
  updates: [] as { id: string; patch: Record<string, unknown> }[],
}));

vi.mock("@/lib/sourcing/freelancermap", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/sourcing/freelancermap")>();
  return { ...actual, sourceFromFreelancermap: mocks.source };
});
vi.mock("@/lib/freelancer/sourced-candidate-import", () => ({
  importSourcedCandidates: mocks.importCandidates,
}));
vi.mock("@/lib/sourcing/resolve-batch", () => ({
  resolveAddressesBatch: mocks.resolveBatch,
}));
vi.mock("@/lib/sourcing/run", () => ({ inviteSourcedCandidate: mocks.invite }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from() {
      const bauer: Record<string, unknown> = {};
      const kette = () => bauer;
      Object.assign(bauer, {
        select: kette,
        eq: kette,
        is: kette,
        not: kette,
        in: async () => ({ data: mocks.rows, error: null }),
        update(patch: Record<string, unknown>) {
          return {
            eq: async (_spalte: string, id: string) => {
              mocks.updates.push({ id, patch });
              return { error: null };
            },
          };
        },
      });
      return bauer;
    },
  }),
}));

import { initialCursor, runDemandStep, STEP_BUDGET_MS } from "@/lib/sourcing/demand-step";

const BASIS = {
  demandProfileKey: "react|typescript",
  demandProfileLabel: "React + TypeScript",
  skills: ["React", "TypeScript", "PostgreSQL"],
  workMode: "remote" as const,
  location: null,
  adminId: "3b85b09e-ea85-48dc-9eac-10f03bc39199",
  resolveAddresses: true,
  sendInvites: false,
};

function verzoegerteQuelle(ms: number) {
  return async () => {
    await new Promise((fertig) => setTimeout(fertig, ms));
    return {
      skill: "x",
      listUrl: "x",
      skillPageFound: true,
      rateRange: null,
      profiles: [profil("a")],
      failed: [],
    };
  };
}

function profil(name: string) {
  return {
    profileUrl: `https://www.freelancermap.de/profil/${name}`,
    displayName: "Vorname Nachname",
    role: "Entwickler",
    location: "Berlin",
    countryCode: "DE",
    hourlyRate: { amount: 90, currency: "EUR" },
    skills: ["React", "TypeScript"],
    languages: ["Deutsch (Muttersprache)"],
    about: "Ein hinreichend langer Text über die eigene Arbeit als Entwickler.",
  };
}

describe("runDemandStep", () => {
  beforeEach(() => {
    mocks.source.mockReset();
    mocks.importCandidates.mockReset();
    mocks.resolveBatch.mockReset();
    mocks.invite.mockReset();
    mocks.rows = [];
    mocks.updates = [];
    mocks.source.mockResolvedValue({
      skill: "x",
      listUrl: "https://www.freelancermap.de/freelancer/x",
      skillPageFound: true,
      rateRange: null,
      profiles: [profil("a")],
      failed: [],
    });
    mocks.importCandidates.mockResolvedValue({ created: 1, skipped: [] });
  });

  it("nimmt in einem Schritt nur einen Skill, wenn einer das Budget fuellt", async () => {
    // Der Kern der Reparatur: Der erste Anlauf packte alle Skills plus
    // Adressen plus Versand in einen Aufruf und lief in die Zeitgrenze.
    // Ein Durchgang dauert in Wirklichkeit 7,8 s; hier 200 ms bei einem
    // Budget, das nach dem ersten Durchgang keinen zweiten mehr zulaesst.
    mocks.source.mockImplementation(verzoegerteQuelle(200));
    const ergebnis = await runDemandStep({ ...BASIS, timeBudgetMs: 9_100 });

    expect(mocks.source).toHaveBeenCalledTimes(1);
    expect(ergebnis.done).toBe(false);
    expect(ergebnis.cursor.phase).toBe("source");
    expect(ergebnis.cursor.pendingSkills).toEqual(["TypeScript", "PostgreSQL"]);
  });

  it("fängt keinen Skill an, der das Budget reißen würde", async () => {
    // Ein Durchgang dauert gemessen 7,8 s. Bei einem Budget von 9 s darf
    // keiner mehr beginnen, sobald die Uhr läuft.
    mocks.source.mockImplementation(verzoegerteQuelle(200));

    const ergebnis = await runDemandStep({ ...BASIS, timeBudgetMs: 9_100 });
    // 9_100 laesst genau einen Durchgang zu (0 + 9_000 < 9_100); danach steht
    // die Uhr bei 200 ms und 200 + 9_000 > 9_100.
    expect(mocks.source).toHaveBeenCalledTimes(1);
    expect(ergebnis.cursor.pendingSkills).toHaveLength(2);
  });

  it("geht erst zu den Adressen, wenn kein Skill mehr offen ist", async () => {
    mocks.source.mockImplementation(verzoegerteQuelle(200));
    let cursor = initialCursor(BASIS.skills);
    for (let runde = 0; runde < 3; runde += 1) {
      const ergebnis = await runDemandStep({ ...BASIS, cursor, timeBudgetMs: 9_100 });
      cursor = ergebnis.cursor;
      // Solange Skills offen sind, bleibt die Phase stehen.
      if (runde < 2) expect(cursor.phase).toBe("source");
    }
    expect(cursor.pendingSkills).toEqual([]);
    expect(cursor.phase).toBe("address");
  });

  it("überspringt Skills, zu denen es keine Liste gibt", async () => {
    mocks.source.mockResolvedValue({
      skill: "Ticketbearbeitung",
      listUrl: "x",
      skillPageFound: false,
      rateRange: null,
      profiles: [],
      failed: [],
    });
    const ergebnis = await runDemandStep({ ...BASIS, skills: ["Ticketbearbeitung"] });
    expect(ergebnis.cursor.skippedSkills).toEqual(["Ticketbearbeitung"]);
    expect(mocks.importCandidates).not.toHaveBeenCalled();
  });

  it("springt ohne Adressensuche direkt ans Ende", async () => {
    const cursor = initialCursor(["React"]);
    const ergebnis = await runDemandStep({
      ...BASIS,
      skills: ["React"],
      resolveAddresses: false,
      cursor,
    });
    expect(ergebnis.cursor.phase).toBe("done");
    expect(ergebnis.done).toBe(true);
  });

  it("bearbeitet Adressen in Stapeln und zählt die bezahlten Suchen", async () => {
    mocks.rows = [
      { id: "11111111-1111-4111-8111-111111111111", full_name: "A", role_title: "R", skills: [], source_profile_url: null, contact_email: null, location_text: null },
      { id: "22222222-2222-4222-8222-222222222222", full_name: "B", role_title: "R", skills: [], source_profile_url: null, contact_email: null, location_text: null },
    ];
    mocks.resolveBatch.mockResolvedValue({
      searchCalls: 1,
      freeHits: 1,
      results: [
        { ref: mocks.rows[0]!.id, displayName: "A", address: { email: "a@a.de", verdict: "usable", reason: "", kind: "personal" }, via: "derived_domain", reason: null, imprintUrl: "x", considered: [] },
        { ref: mocks.rows[1]!.id, displayName: "B", address: null, via: null, reason: "no_site_found", imprintUrl: null, considered: [] },
      ],
    });

    const cursor = {
      ...initialCursor([]),
      phase: "address" as const,
      pendingIds: [String(mocks.rows[0]!.id), String(mocks.rows[1]!.id)],
    };
    const ergebnis = await runDemandStep({ ...BASIS, cursor });

    expect(ergebnis.cursor.searchCalls).toBe(1);
    expect(ergebnis.cursor.freeAddressHits).toBe(1);
    expect(ergebnis.cursor.addressed).toBe(1);
    // Beide bekommen einen Vermerk, auch der ohne Adresse — sonst versucht es
    // der naechste Lauf noch einmal und bezahlt dieselbe Suche erneut.
    expect(mocks.updates).toHaveLength(2);
    expect(ergebnis.cursor.pendingIds).toEqual([]);
    expect(ergebnis.done).toBe(true);
  });

  it("hält den Zustand über Schritte hinweg zusammen", async () => {
    mocks.source.mockImplementation(verzoegerteQuelle(200));
    let cursor = initialCursor(["React", "TypeScript"]);
    const erst = await runDemandStep({ ...BASIS, skills: ["React", "TypeScript"], cursor, timeBudgetMs: 9_100 });
    cursor = erst.cursor;
    const zweit = await runDemandStep({ ...BASIS, skills: ["React", "TypeScript"], cursor, timeBudgetMs: 9_100 });

    // Gezählt wird über beide Schritte, nicht je Schritt neu.
    expect(zweit.cursor.imported).toBe(2);
    expect(zweit.cursor.found).toBe(2);
  });

  it("hat ein Budget, das nicht unter zwei Sekunden fällt", async () => {
    // Ein Aufrufer, der versehentlich 0 uebergibt, soll nicht jeden Schritt
    // leer zurueckgeben.
    const ergebnis = await runDemandStep({ ...BASIS, timeBudgetMs: 0 });
    expect(ergebnis.cursor.phase).toBe("source");
    expect(STEP_BUDGET_MS).toBeGreaterThan(2_000);
  });
});
