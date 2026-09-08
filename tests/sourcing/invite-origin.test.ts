import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  herkunft: null as string | null,
  herkunftFehler: null as { message: string } | null,
  belege: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/freelancer/outreach-send", () => ({
  sendFreelancerOutreach: mocks.send,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from(tabelle: string) {
      if (tabelle === "sourcing_outreach") {
        return {
          insert: async (zeile: Record<string, unknown>) => {
            mocks.belege.push(zeile);
            return { error: null };
          },
        };
      }
      const kette: Record<string, unknown> = {};
      Object.assign(kette, {
        select: () => kette,
        eq: () => kette,
        maybeSingle: async () => ({
          data: mocks.herkunftFehler
            ? null
            : { sourcing_origin: mocks.herkunft },
          error: mocks.herkunftFehler,
        }),
      });
      return kette;
    },
  }),
}));

import { inviteSourcedCandidate } from "@/lib/sourcing/run";

const KANDIDAT = {
  fullName: "Nikolai Schankin",
  roleTitle: "IT-Berater",
  sourceUrls: ["https://www.freelancermap.de/profil/nikolai-schankin"],
};
const ID = "11111111-1111-4111-8111-111111111111";

describe("inviteSourcedCandidate — Herkunftssperre", () => {
  beforeEach(() => {
    mocks.send.mockReset();
    mocks.belege = [];
    mocks.herkunft = null;
    mocks.herkunftFehler = null;
    mocks.send.mockResolvedValue({ sent: true, subject: "Betreff", body: "Text" });
  });

  it("lädt ein, wer aus einer bezahlten Nutzersuche stammt", async () => {
    mocks.herkunft = "user_search";
    const ergebnis = await inviteSourcedCandidate({
      candidate: KANDIDAT,
      contactEmail: "kontakt@nikolai-schankin.de",
      demandProfileLabel: "React + TypeScript",
      applicationId: ID,
    });
    expect(ergebnis.status).toBe("sent");
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.belege).toHaveLength(1);
  });

  it("lädt niemanden aus einem Beschaffungslauf ein", async () => {
    // Die Nachricht behauptet einen konkreten Anlass. Bei einem Kandidaten aus
    // einem Nachfrageprofil gibt es den nicht — dort haben wir aus alten
    // Anfragen geschlossen, dass jemand gebraucht werden koennte.
    mocks.herkunft = "demand_run";
    const ergebnis = await inviteSourcedCandidate({
      candidate: KANDIDAT,
      contactEmail: "kontakt@nikolai-schankin.de",
      demandProfileLabel: "React + TypeScript",
      applicationId: ID,
    });

    expect(ergebnis.status).toBe("wrong_origin");
    expect(mocks.send).not.toHaveBeenCalled();
    // Kein Beleg: Eine Zeile in `sourcing_outreach` hiesse fuer jeden spaeteren
    // Leser, jemand sei angeschrieben worden.
    expect(mocks.belege).toEqual([]);
  });

  it("lädt niemanden ohne vermerkte Herkunft ein", async () => {
    mocks.herkunft = null;
    const ergebnis = await inviteSourcedCandidate({
      candidate: KANDIDAT,
      contactEmail: "a@b.de",
      demandProfileLabel: null,
      applicationId: ID,
    });
    expect(ergebnis.status).toBe("wrong_origin");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("lädt niemanden ein, dessen Zeile nicht gelesen werden kann", async () => {
    // Ein Datenbankfehler darf nicht dazu fuehren, dass mehr rausgeht als
    // erlaubt. Im Zweifel nicht schreiben.
    mocks.herkunftFehler = { message: "Verbindung weg" };
    const ergebnis = await inviteSourcedCandidate({
      candidate: KANDIDAT,
      contactEmail: "a@b.de",
      demandProfileLabel: null,
      applicationId: ID,
    });
    expect(ergebnis.status).toBe("wrong_origin");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("lädt niemanden ohne Kandidatenzeile ein", async () => {
    const ergebnis = await inviteSourcedCandidate({
      candidate: KANDIDAT,
      contactEmail: "a@b.de",
      demandProfileLabel: null,
      applicationId: null,
    });
    expect(ergebnis.status).toBe("wrong_origin");
    expect(ergebnis.reason).toContain("Herkunft");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
