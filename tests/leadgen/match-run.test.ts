import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profiles: vi.fn(),
  deliver: vi.fn(),
  claim: vi.fn(),
  recordSent: vi.fn(),
  release: vi.fn(),
  updateLead: vi.fn(),
  recordMatch: vi.fn(),
  leads: vi.fn(),
  sentSince: vi.fn(),
  recordRun: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/freelancers", () => ({
  fetchActiveBookableRealProfiles: mocks.profiles,
}));
vi.mock("@/lib/email/deliver", () => ({
  deliverEmail: mocks.deliver,
  publicMailOrigin: () => "https://x-portal.eu",
}));
vi.mock("@/lib/email/unsubscribe", () => ({
  unsubscribeUrl: (origin: string, email: string) =>
    `${origin}/unsubscribe?t=${encodeURIComponent(email)}`,
}));
vi.mock("@/lib/leadgen/leads-data", () => ({
  claimOutreach: mocks.claim,
  recordOutreachSent: mocks.recordSent,
  releaseOutreachClaim: mocks.release,
  sentSince: mocks.sentSince,
  updateLead: mocks.updateLead,
  recordLeadRun: mocks.recordRun,
}));
vi.mock("@/lib/leadgen/demand", () => ({
  recordLeadMatch: mocks.recordMatch,
  catalogVersion: () => "catalog-test",
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => mocks.leads(),
          }),
        }),
      }),
    }),
  }),
}));

import { runLeadMatchPass } from "@/lib/leadgen/match-run";

/**
 * Ein Profil, das der Rangliste standhält: aktiv, buchbar, mit belegten
 * Kompetenzen. Weniger geht nicht — `buildShortlist()` prüft das Profil gegen
 * dasselbe Schema wie im Betrieb.
 */
const PROFIL = {
  id: "11111111-1111-4111-8111-111111111111",
  dataVersion: "profile-v9",
  demoStatus: "real" as const,
  profileStatus: "active" as const,
  avatarUrl: null,
  displayName: "Beispiel Person",
  role: "Frontend-Entwicklerin",
  skillTags: [
    { value: "React", source: "verified" as const },
    { value: "Next.js", source: "self_reported" as const },
  ],
  contextEvidence: [],
  languages: [{ value: "German", source: "self_reported" as const }],
  location: { value: "Deutschland", source: "self_reported" as const },
  workModes: ["remote" as const],
  experienceSummary: {
    value: "Baut Oberflaechen mit React.",
    source: "self_reported" as const,
  },
  qualifications: [],
  contractualCapabilities: [],
  referenceStatus: "verified" as const,
  hourlyRate: { amount: 120, currency: "EUR" as const },
  dayRate: null,
  minimumProjectBudget: null,
  availability: {
    status: "available" as const,
    availableFrom: "2026-09-01",
    checkedAt: "2026-09-01T07:00:00.000Z",
  },
  introPolicy: {
    type: "free" as const,
    label: "Direkt buchbar",
    bookingUrl: "https://calendly.com/beispiel",
  },
};

function lead(input: { id: number; text: string }) {
  return {
    id: input.id,
    company: "Beispiel GmbH",
    recipient_name: "Michel Corda",
    recipient_email: `kontakt${input.id}@example.invalid`,
    stellenanzeige: input.text,
  };
}

const TREFFER = "React Engineer — React gesucht, remote — https://example.invalid/p/1";
const OHNE_TREFFER = "SAP Berater — SAP S/4HANA gesucht, remote — https://example.invalid/p/2";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profiles.mockResolvedValue([PROFIL]);
  mocks.deliver.mockResolvedValue({ delivered: true });
  mocks.claim.mockResolvedValue({ claimed: true, outreachId: "outreach-1" });
  mocks.recordSent.mockResolvedValue({ recorded: true, outreachId: "outreach-1" });
  mocks.updateLead.mockResolvedValue(null);
  mocks.recordMatch.mockResolvedValue({ recorded: true });
  mocks.recordRun.mockResolvedValue(undefined);
  mocks.sentSince.mockResolvedValue(0);
});

describe("Tageslauf der Akquise", () => {
  it("verschickt bei einem Treffer und archiviert den Lead als angeschrieben", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 1, text: TREFFER })], error: null });

    const result = await runLeadMatchPass({ senderEmail: "info@x-portal.eu" });

    expect(result.sent).toBe(1);
    expect(result.archived).toBe(0);
    expect(mocks.deliver).toHaveBeenCalledTimes(1);
    const [message] = mocks.deliver.mock.calls[0] as [
      { subject: string; text: string; kind: string; to: string },
    ];
    expect(message.kind).toBe("cold_outreach");
    expect(message.to).toBe("kontakt1@example.invalid");
    expect(mocks.updateLead).toHaveBeenCalledWith({
      id: 1,
      status: "contacted",
      archived: true,
    });
  });

  /**
   * Nur belegte Kompetenzen wandern in die Nachricht. Eine selbst angegebene
   * Fähigkeit ist eine Aussage der Person über sich; sie als Zusage an einen
   * Auftraggeber weiterzureichen wäre eine Behauptung, für die niemand einsteht.
   */
  it("nennt in den Eckdaten nur belegte Kompetenzen", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 1, text: TREFFER })], error: null });

    await runLeadMatchPass({ senderEmail: "info@x-portal.eu" });

    const [message] = mocks.deliver.mock.calls[0] as [{ text: string }];
    expect(message.text).toContain("React");
    expect(message.text).not.toContain("Next.js");
  });

  /** Der Name steht auf dem öffentlichen Profil, aber nicht in dieser Mail. */
  it("nennt den Freelancer nicht beim Namen", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 1, text: TREFFER })], error: null });

    await runLeadMatchPass({ senderEmail: "info@x-portal.eu" });

    const [message] = mocks.deliver.mock.calls[0] as [{ text: string }];
    expect(message.text).not.toContain("Beispiel Person");
  });

  it("archiviert ohne Treffer, verschickt nichts und vermerkt die Nachfrage", async () => {
    mocks.leads.mockResolvedValue({
      data: [lead({ id: 2, text: OHNE_TREFFER })],
      error: null,
    });

    const result = await runLeadMatchPass({ senderEmail: "info@x-portal.eu" });

    expect(result.sent).toBe(0);
    expect(result.archived).toBe(1);
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.recordMatch).toHaveBeenCalledTimes(1);
    expect(mocks.updateLead).toHaveBeenCalledWith({
      id: 2,
      status: "dismissed",
      archived: true,
    });
  });

  /**
   * Die Reihenfolge ist die Zusage: Bricht der Lauf zwischen beidem ab, ist
   * der Lead noch da. Andersherum wäre er aus der Liste verschwunden, ohne
   * dass irgendwo stünde, wonach gefragt worden war.
   */
  it("hält die Nachfrage fest, bevor der Lead verschwindet", async () => {
    mocks.leads.mockResolvedValue({
      data: [lead({ id: 2, text: OHNE_TREFFER })],
      error: null,
    });
    const reihenfolge: string[] = [];
    mocks.recordMatch.mockImplementation(async () => {
      reihenfolge.push("nachfrage");
      return { recorded: true };
    });
    mocks.updateLead.mockImplementation(async () => {
      reihenfolge.push("archiv");
      return null;
    });

    await runLeadMatchPass({ senderEmail: "info@x-portal.eu" });

    expect(reihenfolge).toEqual(["nachfrage", "archiv"]);
  });

  it("gibt den Anspruch frei, wenn die Zustellung scheitert", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 1, text: TREFFER })], error: null });
    mocks.deliver.mockResolvedValue({ delivered: false, reason: "suppressed" });

    const result = await runLeadMatchPass({ senderEmail: "info@x-portal.eu" });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mocks.release).toHaveBeenCalledWith({
      outreachId: "outreach-1",
      reason: "suppressed",
    });
    expect(mocks.recordSent).not.toHaveBeenCalled();
  });

  it("überspringt einen Lead, den ein anderer Lauf schon beansprucht hat", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 1, text: TREFFER })], error: null });
    mocks.claim.mockResolvedValue({ claimed: false, reason: "already_sent" });

    const result = await runLeadMatchPass({ senderEmail: "info@x-portal.eu" });

    expect(result.skipped).toBe(1);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  /**
   * Der Deckel zählt Versendetes, nicht Betrachtetes: Ein Lauf, den zwei
   * unbrauchbare Ausschreibungen aufbrauchen, hätte keine einzige Mail
   * verschickt und trotzdem behauptet, fertig zu sein.
   */
  it("zählt nur Versendetes gegen den Deckel", async () => {
    mocks.leads.mockResolvedValue({
      data: [
        lead({ id: 1, text: OHNE_TREFFER }),
        lead({ id: 2, text: OHNE_TREFFER }),
        lead({ id: 3, text: TREFFER }),
      ],
      error: null,
    });

    const result = await runLeadMatchPass({
      senderEmail: "info@x-portal.eu",
      dailyLimit: 1,
    });

    expect(result.archived).toBe(2);
    expect(result.sent).toBe(1);
  });

  /**
   * Das Tageslimit gehört dem Tag und nicht dem Aufruf. Seit der Durchgang
   * mehrmals am Morgen läuft, wäre ein Deckel je Aufruf die Summe aller
   * Aufrufe — und die hätte das Postfach überschritten, um das es geht.
   */
  it("rechnet an, was heute schon rausgegangen ist", async () => {
    mocks.sentSince.mockResolvedValue(20);
    mocks.leads.mockResolvedValue({
      data: [lead({ id: 1, text: TREFFER })],
      error: null,
    });

    const result = await runLeadMatchPass({
      senderEmail: "info@x-portal.eu",
      dailyLimit: 20,
    });

    expect(result.sent).toBe(0);
    expect(result.stoppedBy).toBe("daily_limit");
    expect(result.dailyBudgetLeft).toBe(0);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  /**
   * Der Grund, warum es diese Grenze gibt: Die Funktion läuft hinter einem
   * Gateway, das nach gut dreißig Sekunden abbricht. Ein Durchgang über 247
   * offene Leads lief genau da hinein.
   */
  it("hört nach dem Ansehbudget auf und meldet den Rest", async () => {
    mocks.leads.mockResolvedValue({
      data: [1, 2, 3, 4, 5].map((id) => lead({ id, text: OHNE_TREFFER })),
      error: null,
    });

    const result = await runLeadMatchPass({
      senderEmail: "info@x-portal.eu",
      examineBudget: 2,
    });

    expect(result.examined).toBe(2);
    expect(result.remaining).toBe(3);
    expect(result.stoppedBy).toBe("examined");
  });

  /**
   * Die Uhr wird gestellt, nicht abgewartet. Ein Test, der eine Sekunde
   * schläft, hält einen Arbeiter besetzt und treibt fremde Tests in
   * parallelen Läufen über ihre eigene Zeitgrenze.
   */
  it("hört auf, wenn die Zeit weg ist", async () => {
    mocks.leads.mockResolvedValue({
      data: [1, 2, 3].map((id) => lead({ id, text: OHNE_TREFFER })),
      error: null,
    });

    const start = Date.now();
    let verstrichen = 0;
    const uhr = vi.spyOn(Date, "now").mockImplementation(() => start + verstrichen);
    mocks.recordMatch.mockImplementation(async () => {
      verstrichen += 800;
      return { recorded: true };
    });

    try {
      const result = await runLeadMatchPass({
        senderEmail: "info@x-portal.eu",
        timeBudgetMs: 1_000,
      });
      expect(result.stoppedBy).toBe("time");
      expect(result.examined).toBe(2);
      expect(result.remaining).toBe(1);
    } finally {
      uhr.mockRestore();
    }
  });

  it("meldet einen fertigen Durchgang als leere Warteschlange", async () => {
    mocks.leads.mockResolvedValue({
      data: [lead({ id: 1, text: OHNE_TREFFER })],
      error: null,
    });

    const result = await runLeadMatchPass({ senderEmail: "info@x-portal.eu" });

    expect(result.stoppedBy).toBe("queue_empty");
    expect(result.remaining).toBe(0);
  });

  it("verschickt und speichert im Probelauf nichts", async () => {
    mocks.leads.mockResolvedValue({
      data: [lead({ id: 1, text: TREFFER }), lead({ id: 2, text: OHNE_TREFFER })],
      error: null,
    });

    const result = await runLeadMatchPass({
      senderEmail: "info@x-portal.eu",
      dryRun: true,
    });

    expect(result.sent).toBe(1);
    expect(result.archived).toBe(1);
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.updateLead).not.toHaveBeenCalled();
    expect(mocks.recordMatch).not.toHaveBeenCalled();
  });
});

describe("Versandfenster des Tageslaufs", () => {
  it("tut außerhalb des Fensters nichts und fragt die Datenbank nicht", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 1, text: TREFFER })], error: null });

    const result = await runLeadMatchPass({
      senderEmail: "info@x-portal.eu",
      enforceWindow: true,
      // Montag, 7. September 2026, 5:00 UTC — 7 Uhr Ortszeit, eine Stunde
      // zu früh. Genau der Aufruf, den der Zeitgeber im Winter zusätzlich
      // macht.
      now: new Date("2026-09-07T05:00:00Z"),
    });

    expect(result.stoppedBy).toBe("outside_window");
    expect(result.examined).toBe(0);
    expect(result.sent).toBe(0);
    expect(mocks.sentSince).not.toHaveBeenCalled();
    expect(mocks.profiles).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("arbeitet innerhalb des Fensters wie gewohnt", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 1, text: TREFFER })], error: null });

    const result = await runLeadMatchPass({
      senderEmail: "info@x-portal.eu",
      enforceWindow: true,
      // 8 Uhr Ortszeit.
      now: new Date("2026-09-07T06:00:00Z"),
    });

    expect(result.stoppedBy).not.toBe("outside_window");
    expect(result.sent).toBe(1);
    expect(mocks.deliver).toHaveBeenCalledTimes(1);
  });

  it("bindet einen Lauf ohne die Vorgabe nicht an die Uhrzeit", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 1, text: TREFFER })], error: null });

    const result = await runLeadMatchPass({
      senderEmail: "info@x-portal.eu",
      now: new Date("2026-09-07T22:00:00Z"),
    });

    expect(result.sent).toBe(1);
  });

  it("zählt das Tagesbudget ab Mitternacht Ortszeit", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 1, text: TREFFER })], error: null });
    mocks.sentSince.mockResolvedValue(0);

    await runLeadMatchPass({
      senderEmail: "info@x-portal.eu",
      now: new Date("2026-09-07T06:00:00Z"),
    });

    // 22 Uhr UTC des Vortags ist Mitternacht in Berlin.
    expect(mocks.sentSince).toHaveBeenCalledWith(new Date("2026-09-06T22:00:00Z"));
  });
});

describe("Was ein Lauf hinterlässt", () => {
  it("hält auch einen Treffer fest, und zwar bevor die Nachricht rausgeht", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 7, text: TREFFER })], error: null });

    await runLeadMatchPass({ senderEmail: "info@x-portal.eu" });

    expect(mocks.recordMatch).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 7, profileCatalogVersion: "catalog-test" }),
    );
    // Die Reihenfolge trägt die Aussage: Steht der Abgleich erst nach dem
    // Versand fest, weiß nach einem Abbruch niemand mehr, warum verschickt
    // wurde.
    const abgleichAufruf = mocks.recordMatch.mock.invocationCallOrder[0];
    const versandAufruf = mocks.deliver.mock.invocationCallOrder[0];
    expect(abgleichAufruf).toBeLessThan(versandAufruf);
  });

  it("legt den Portal-Link und die Herkunft in den Beleg", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 8, text: TREFFER })], error: null });

    await runLeadMatchPass({ senderEmail: "info@x-portal.eu", trigger: "scheduler" });

    expect(mocks.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: "scheduler",
        ctaUrl: expect.stringContaining("https://x-portal.eu/chat?q="),
      }),
    );
  });

  it("protokolliert den Durchgang mit seinem Abbruchgrund", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 9, text: OHNE_TREFFER })], error: null });

    await runLeadMatchPass({ senderEmail: "info@x-portal.eu", trigger: "admin" });

    expect(mocks.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: "admin",
        examined: 1,
        sent: 0,
        archived: 1,
        stopped_by: "queue_empty",
      }),
    );
  });

  it("protokolliert einen übergangenen Aufruf nicht", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 10, text: TREFFER })], error: null });

    await runLeadMatchPass({
      senderEmail: "info@x-portal.eu",
      enforceWindow: true,
      now: new Date("2026-09-07T05:00:00Z"),
    });

    expect(mocks.recordRun).not.toHaveBeenCalled();
  });
});
