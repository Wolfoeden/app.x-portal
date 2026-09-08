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
  saveDraft: vi.fn(),
  listDrafts: vi.fn(),
  claimDraft: vi.fn(),
  discardDraft: vi.fn(),
  existingDrafts: vi.fn(),
  extract: vi.fn(),
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
  savePreparedDraft: mocks.saveDraft,
  listPreparedDrafts: mocks.listDrafts,
  claimPreparedDraft: mocks.claimDraft,
  discardPreparedDraft: mocks.discardDraft,
}));
vi.mock("@/lib/leadgen/demand", () => ({
  recordLeadMatch: mocks.recordMatch,
  catalogVersion: () => "catalog-test",
  demandActorForLead: (email: string) => `pseudonym:${email}`,
}));
vi.mock("@/lib/openai/brief", () => ({
  extractProjectBrief: mocks.extract,
}));
// Zwei Tabellen werden gelesen: die Warteschlange und, beim Vorbereiten, die
// schon vorhandenen Entwürfe. Der Mock unterscheidet sie, damit ein Test nicht
// versehentlich die Antwort der einen für die andere hält.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: (tabelle: string) => ({
      select: () => ({
        eq: () =>
          tabelle === "leadgen_outreach"
            ? mocks.existingDrafts()
            : {
                is: () => ({ order: () => mocks.leads() }),
              },
      }),
    }),
  }),
}));

import { parseFallbackBrief } from "@/lib/domain";
import {
  runLeadPreparePass,
  runLeadSendPass,
} from "@/lib/leadgen/match-run";

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

const ENTWURF = {
  outreach_id: "11111111-1111-4111-8111-aaaaaaaaaaaa",
  lead_id: 1,
  recipient_email: "kontakt1@example.invalid",
  subject: "Ein verfügbarer Freelancer für die Rolle",
  body: "Guten Tag …",
  cta_url: "https://x-portal.eu/chat?q=React+Engineer",
  prepared_profile_id: PROFIL.id,
  prepared_at: "2026-09-07T06:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profiles.mockResolvedValue([PROFIL]);
  mocks.deliver.mockResolvedValue({ delivered: true });
  mocks.recordSent.mockResolvedValue({ recorded: true, outreachId: "outreach-1" });
  mocks.updateLead.mockResolvedValue(null);
  mocks.recordMatch.mockResolvedValue({ recorded: true });
  mocks.recordRun.mockResolvedValue(undefined);
  mocks.sentSince.mockResolvedValue(0);
  mocks.existingDrafts.mockResolvedValue({ data: [], error: null });
  mocks.saveDraft.mockResolvedValue(undefined);
  mocks.claimDraft.mockResolvedValue({ claimed: true, leadId: 1 });
  mocks.discardDraft.mockResolvedValue(true);
  mocks.listDrafts.mockResolvedValue([ENTWURF]);
  mocks.leads.mockResolvedValue({ data: [], error: null });
  // Das Modell liefert denselben Brief, den der deterministische Weg baut.
  // So bleibt die Rangliste im Test dieselbe, und geprüft wird, ob der
  // Abgleich das Modell überhaupt anspricht.
  mocks.extract.mockImplementation(async (input: { originalRequest: string }) => ({
    brief: parseFallbackBrief(input.originalRequest),
    mode: "openai" as const,
    providerAttempted: true,
  }));
});

describe("Vorbereiten: der Abgleich", () => {
  it("legt bei einem Treffer einen Entwurf an und verschickt nichts", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 1, text: TREFFER })], error: null });

    const result = await runLeadPreparePass({ senderEmail: "info@x-portal.eu" });

    expect(result.prepared).toBe(1);
    expect(result.sent).toBe(0);
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 1,
        profileId: PROFIL.id,
        ctaUrl: expect.stringContaining("https://x-portal.eu/chat?q="),
      }),
    );
    // Der Lead bleibt offen: Er ist vorbereitet, nicht erledigt.
    expect(mocks.updateLead).not.toHaveBeenCalled();
  });

  it("nennt in den Eckdaten nur belegte Kompetenzen und keinen Namen", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 1, text: TREFFER })], error: null });

    await runLeadPreparePass({ senderEmail: "info@x-portal.eu" });

    const body = mocks.saveDraft.mock.calls[0][0].body as string;
    expect(body).toContain("React");
    expect(body).not.toContain("Next.js");
    expect(body).not.toContain(PROFIL.displayName);
  });

  it("archiviert ohne Treffer und vermerkt die Nachfrage", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 2, text: OHNE_TREFFER })], error: null });

    const result = await runLeadPreparePass({ senderEmail: "info@x-portal.eu" });

    expect(result.archived).toBe(1);
    expect(result.prepared).toBe(0);
    expect(mocks.saveDraft).not.toHaveBeenCalled();
    expect(mocks.recordMatch).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 2 }),
    );
    expect(mocks.updateLead).toHaveBeenCalledWith({
      id: 2,
      status: "dismissed",
      archived: true,
    });
  });

  it("hält das Ergebnis fest, bevor der Lead verschwindet", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 2, text: OHNE_TREFFER })], error: null });

    await runLeadPreparePass({ senderEmail: "info@x-portal.eu" });

    const abgleich = mocks.recordMatch.mock.invocationCallOrder[0];
    const archiviert = mocks.updateLead.mock.invocationCallOrder[0];
    expect(abgleich).toBeLessThan(archiviert);
  });

  it("übergeht Leads, für die schon ein Entwurf bereitliegt", async () => {
    mocks.existingDrafts.mockResolvedValue({ data: [{ lead_id: 1 }], error: null });
    mocks.leads.mockResolvedValue({
      data: [lead({ id: 1, text: TREFFER }), lead({ id: 3, text: TREFFER })],
      error: null,
    });

    const result = await runLeadPreparePass({ senderEmail: "info@x-portal.eu" });

    expect(result.examined).toBe(1);
    expect(mocks.saveDraft).toHaveBeenCalledTimes(1);
    expect(mocks.saveDraft.mock.calls[0][0].leadId).toBe(3);
  });

  it("kennt kein Tageslimit, weil nichts das Haus verlässt", async () => {
    const viele = Array.from({ length: 40 }, (_, i) =>
      lead({ id: 100 + i, text: TREFFER }),
    );
    mocks.leads.mockResolvedValue({ data: viele, error: null });
    mocks.sentSince.mockResolvedValue(20);

    const result = await runLeadPreparePass({ senderEmail: "info@x-portal.eu" });

    expect(result.prepared).toBe(40);
    expect(mocks.sentSince).not.toHaveBeenCalled();
  });

  it("speichert im Probelauf nichts", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 1, text: TREFFER })], error: null });

    const result = await runLeadPreparePass({
      senderEmail: "info@x-portal.eu",
      dryRun: true,
    });

    expect(result.prepared).toBe(1);
    expect(mocks.saveDraft).not.toHaveBeenCalled();
    expect(mocks.recordMatch).not.toHaveBeenCalled();
  });

  it("protokolliert den Durchgang als Vorbereitung", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 1, text: TREFFER })], error: null });

    await runLeadPreparePass({ senderEmail: "info@x-portal.eu", trigger: "admin" });

    expect(mocks.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "prepare", trigger: "admin", examined: 1 }),
    );
  });
});

describe("Versenden: die vorbereiteten Entwürfe", () => {
  it("stellt einen Entwurf zu und legt den Lead ab", async () => {
    const result = await runLeadSendPass({ senderEmail: "info@x-portal.eu" });

    expect(result.sent).toBe(1);
    expect(mocks.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ENTWURF.recipient_email,
        subject: ENTWURF.subject,
        text: ENTWURF.body,
        kind: "cold_outreach",
      }),
    );
    expect(mocks.recordSent).toHaveBeenCalledWith(ENTWURF.outreach_id);
    expect(mocks.updateLead).toHaveBeenCalledWith({
      id: 1,
      status: "contacted",
      archived: true,
    });
  });

  it("gleicht nicht erneut ab, denn der Abgleich ist gelaufen", async () => {
    await runLeadSendPass({ senderEmail: "info@x-portal.eu" });

    expect(mocks.recordMatch).not.toHaveBeenCalled();
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it("verwirft den Entwurf, wenn das angebotene Profil nicht mehr buchbar ist", async () => {
    mocks.profiles.mockResolvedValue([]);

    const result = await runLeadSendPass({ senderEmail: "info@x-portal.eu" });

    expect(result.discarded).toBe(1);
    expect(result.sent).toBe(0);
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.discardDraft).toHaveBeenCalledWith({
      outreachId: ENTWURF.outreach_id,
      reason: "profile_gone",
    });
  });

  it("verwirft einen Entwurf, der zu alt geworden ist", async () => {
    mocks.listDrafts.mockResolvedValue([
      { ...ENTWURF, prepared_at: "2026-08-01T06:00:00.000Z" },
    ]);

    const result = await runLeadSendPass({
      senderEmail: "info@x-portal.eu",
      now: new Date("2026-09-07T06:00:00Z"),
    });

    expect(result.discarded).toBe(1);
    expect(mocks.discardDraft).toHaveBeenCalledWith({
      outreachId: ENTWURF.outreach_id,
      reason: "draft_expired",
    });
  });

  it("gibt den Anspruch frei, wenn die Zustellung scheitert", async () => {
    mocks.deliver.mockResolvedValue({ delivered: false, reason: "smtp_error" });

    const result = await runLeadSendPass({ senderEmail: "info@x-portal.eu" });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mocks.release).toHaveBeenCalledWith({
      outreachId: ENTWURF.outreach_id,
      reason: "smtp_error",
    });
    expect(mocks.recordSent).not.toHaveBeenCalled();
  });

  it("überspringt einen Entwurf, den ein anderer Lauf schon beansprucht hat", async () => {
    mocks.claimDraft.mockResolvedValue({ claimed: false, reason: "already_sent" });

    const result = await runLeadSendPass({ senderEmail: "info@x-portal.eu" });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("rechnet an, was heute schon rausgegangen ist", async () => {
    mocks.sentSince.mockResolvedValue(20);

    const result = await runLeadSendPass({
      senderEmail: "info@x-portal.eu",
      dailyLimit: 20,
    });

    expect(result.sent).toBe(0);
    expect(result.stoppedBy).toBe("daily_limit");
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("hört nach der Tagesmenge auf und meldet den Rest", async () => {
    mocks.listDrafts.mockResolvedValue([
      ENTWURF,
      { ...ENTWURF, outreach_id: "22222222-2222-4222-8222-bbbbbbbbbbbb", lead_id: 2 },
      { ...ENTWURF, outreach_id: "33333333-3333-4333-8333-cccccccccccc", lead_id: 3 },
    ]);

    const result = await runLeadSendPass({
      senderEmail: "info@x-portal.eu",
      dailyLimit: 2,
    });

    expect(result.sent).toBe(2);
    expect(result.remaining).toBe(1);
    expect(result.stoppedBy).toBe("daily_limit");
    expect(result.dailyBudgetLeft).toBe(0);
  });

  it("meldet einen leeren Vorrat als solchen", async () => {
    mocks.listDrafts.mockResolvedValue([]);

    const result = await runLeadSendPass({ senderEmail: "info@x-portal.eu" });

    expect(result.stoppedBy).toBe("nothing_prepared");
    expect(result.sent).toBe(0);
    expect(mocks.recordRun).not.toHaveBeenCalled();
  });

  it("verschickt im Probelauf nichts", async () => {
    const result = await runLeadSendPass({
      senderEmail: "info@x-portal.eu",
      dryRun: true,
    });

    expect(result.sent).toBe(1);
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.claimDraft).not.toHaveBeenCalled();
  });

  it("zählt das Tagesbudget ab Mitternacht Ortszeit", async () => {
    await runLeadSendPass({
      senderEmail: "info@x-portal.eu",
      now: new Date("2026-09-07T06:00:00Z"),
    });

    // 22 Uhr UTC des Vortags ist Mitternacht in Berlin.
    expect(mocks.sentSince).toHaveBeenCalledWith(new Date("2026-09-06T22:00:00Z"));
  });
});

describe("Das Versandfenster gilt nur für den Versand", () => {
  it("tut außerhalb des Fensters nichts und fragt die Datenbank nicht", async () => {
    const result = await runLeadSendPass({
      senderEmail: "info@x-portal.eu",
      enforceWindow: true,
      // Montag, 7. September 2026, 5:00 UTC — 7 Uhr Ortszeit, eine Stunde zu
      // früh. Genau der Aufruf, den der Zeitgeber im Winter zusätzlich macht.
      now: new Date("2026-09-07T05:00:00Z"),
    });

    expect(result.stoppedBy).toBe("outside_window");
    expect(mocks.sentSince).not.toHaveBeenCalled();
    expect(mocks.listDrafts).not.toHaveBeenCalled();
    expect(mocks.recordRun).not.toHaveBeenCalled();
  });

  it("arbeitet innerhalb des Fensters wie gewohnt", async () => {
    const result = await runLeadSendPass({
      senderEmail: "info@x-portal.eu",
      enforceWindow: true,
      now: new Date("2026-09-07T06:00:00Z"),
    });

    expect(result.stoppedBy).not.toBe("outside_window");
    expect(result.sent).toBe(1);
  });

  it("hält den Abgleich nicht auf, auch nachts nicht", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 1, text: TREFFER })], error: null });

    const result = await runLeadPreparePass({
      senderEmail: "info@x-portal.eu",
      now: new Date("2026-09-07T23:00:00Z"),
    });

    expect(result.prepared).toBe(1);
  });
});

describe("Der Abgleich liest wie im Chat", () => {
  it("gibt die Ausschreibung an das Modell, mit dem Pseudonym als Kennung", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 1, text: TREFFER })], error: null });

    const result = await runLeadPreparePass({ senderEmail: "info@x-portal.eu" });

    expect(mocks.extract).toHaveBeenCalledWith({
      originalRequest: TREFFER,
      safetyIdentifier: "pseudonym:kontakt1@example.invalid",
      allowProvider: true,
    });
    expect(result.extractedByModel).toBe(1);
    expect(result.extractedByFallback).toBe(0);
  });

  it("rechnet weiter, wenn das Modell ausfällt", async () => {
    // `extractProjectBrief()` faellt intern auf den deterministischen Weg
    // zurueck und meldet das als mode "fallback". Ein Lauf darf daran nicht
    // scheitern — er soll nur sagen, wie gerechnet wurde.
    mocks.extract.mockImplementation(async (input: { originalRequest: string }) => ({
      brief: parseFallbackBrief(input.originalRequest),
      mode: "fallback" as const,
      providerAttempted: true,
      fallbackReason: "provider_timeout" as const,
    }));
    mocks.leads.mockResolvedValue({ data: [lead({ id: 1, text: TREFFER })], error: null });

    const result = await runLeadPreparePass({ senderEmail: "info@x-portal.eu" });

    expect(result.prepared).toBe(1);
    expect(result.extractedByModel).toBe(0);
    expect(result.extractedByFallback).toBe(1);
  });

  it("bleibt auf dem deterministischen Weg, wenn das ausdrücklich verlangt ist", async () => {
    mocks.leads.mockResolvedValue({ data: [lead({ id: 1, text: TREFFER })], error: null });

    const result = await runLeadPreparePass({
      senderEmail: "info@x-portal.eu",
      useAi: false,
    });

    expect(mocks.extract).not.toHaveBeenCalled();
    expect(result.extractedByFallback).toBe(1);
    expect(result.prepared).toBe(1);
  });

  it("hält einen Lead für unlesbar, wenn auch das Modell nichts liefert", async () => {
    mocks.extract.mockRejectedValue(new Error("kaputt"));
    mocks.leads.mockResolvedValue({ data: [lead({ id: 1, text: TREFFER })], error: null });

    const result = await runLeadPreparePass({ senderEmail: "info@x-portal.eu" });

    expect(result.prepared).toBe(0);
    expect(result.outcomes[0]).toEqual({ leadId: 1, outcome: "unreadable" });
  });

  it("fragt das Modell im Versandlauf nicht — der Abgleich ist gelaufen", async () => {
    await runLeadSendPass({ senderEmail: "info@x-portal.eu" });

    expect(mocks.extract).not.toHaveBeenCalled();
  });
});
