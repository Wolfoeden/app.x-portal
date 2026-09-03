import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  requireAdmin: vi.fn(),
  deliver: vi.fn(),
  configured: vi.fn(),
  getLead: vi.fn(),
  getDraft: vi.fn(),
  claim: vi.fn(),
  recordSent: vi.fn(),
  release: vi.fn(),
  rejectDraft: vi.fn(),
  createDraft: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/auth/current-user", () => ({
  requireAdminUser: mocks.requireAdmin,
}));
vi.mock("@/lib/email/deliver", () => ({
  deliverEmail: mocks.deliver,
  emailDeliveryConfigured: mocks.configured,
}));
vi.mock("@/lib/leadgen/leads-data", () => ({
  getLead: mocks.getLead,
  getOutreachDraft: mocks.getDraft,
  claimOutreach: mocks.claim,
  recordOutreachSent: mocks.recordSent,
  releaseOutreachClaim: mocks.release,
  rejectOutreachDraft: mocks.rejectDraft,
}));
vi.mock("@/lib/leadgen/draft-service", () => ({
  createDraftForLead: mocks.createDraft,
}));

import { POST } from "@/app/api/admin/leads/[id]/send/route";

const ADMIN = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "roman@dering.info",
  isAnonymous: false,
  isAdmin: true,
};

const LEAD = {
  id: 42,
  recipient_email: "kontakt@example.invalid",
  recipient_name: "Michel Corda",
  company: "Krongaard GmbH",
  stellenanzeige: "Projektmanager — Beschreibung — https://example.invalid/p/1",
  status: "new" as const,
  category: null,
  notes: null,
  archived_at: null,
  last_contacted_at: null,
  created_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-01T10:00:00.000Z",
};

function sendRequest(body: Record<string, unknown>): Request {
  return new Request("https://x-portal.eu/api/admin/leads/42/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://x-portal.eu",
    },
    body: JSON.stringify(body),
  });
}

const CONTEXT = { params: Promise.resolve({ id: "42" }) };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.EMAIL_FROM = "info@x-portal.eu";
  mocks.requireAdmin.mockResolvedValue(ADMIN);
  mocks.audit.mockResolvedValue("audit-id");
  mocks.configured.mockReturnValue(true);
  mocks.getLead.mockResolvedValue(LEAD);
  mocks.getDraft.mockResolvedValue({
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    lead_id: 42,
    state: "draft",
    subject: "Freelancer für Projektmanager",
    body: "Sie haben eine Rolle ausgeschrieben. Darf ich Ihnen ein Profil schicken?",
    model: "gpt-5.4-nano",
    credits: 2,
    created_by: ADMIN.id,
    created_at: "2026-09-02T08:00:00.000Z",
    sent_at: null,
    failure_reason: null,
  });
  mocks.deliver.mockResolvedValue({ delivered: true });
  mocks.claim.mockResolvedValue({
    claimed: true,
    outreachId: "bbbbbbbb-0000-4000-8000-000000000002",
  });
  mocks.recordSent.mockResolvedValue({
    recorded: true,
    outreachId: "bbbbbbbb-0000-4000-8000-000000000002",
  });
});

describe("Versandroute für Leads", () => {
  it("weist eine fremde Herkunft ab, bevor irgendetwas gelesen wird", async () => {
    const response = await POST(
      new Request("https://x-portal.eu/api/admin/leads/42/send", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://boese.example",
        },
        body: JSON.stringify({ requestId: "abcdefgh" }),
      }),
      CONTEXT,
    );

    expect(response.status).toBe(403);
    expect(mocks.getLead).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("verschickt den abgelegten Entwurf und protokolliert ihn", async () => {
    const response = await POST(sendRequest({ requestId: "abcdefgh" }), CONTEXT);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "sent" });
    expect(mocks.deliver).toHaveBeenCalledTimes(1);
    expect(mocks.recordSent).toHaveBeenCalledTimes(1);
  });

  it("hängt Anrede und Pflichtangaben an den Entwurf an", async () => {
    await POST(sendRequest({ requestId: "abcdefgh" }), CONTEXT);

    const [message] = mocks.deliver.mock.calls[0] as [
      { to: string; subject: string; text: string },
    ];
    expect(message.to).toBe(LEAD.recipient_email);
    expect(message.text.startsWith("Guten Tag Michel Corda,")).toBe(true);
    expect(message.text).toContain("Heilig-Kreuz-Straße 18");
    expect(message.text).toContain("https://example.invalid/p/1");
  });

  it("nennt im Fuß dieselbe Adresse, unter der die Mail rausgeht", async () => {
    // Eine Widerspruchsadresse, an die keine Antwort zurückliefe, wäre die
    // schlimmste Art von Zusage. Der Absender kommt aus EMAIL_FROM, und
    // genau der muss im Fuß stehen.
    await POST(sendRequest({ requestId: "abcdefgh" }), CONTEXT);

    const [message] = mocks.deliver.mock.calls[0] as [{ text: string }];
    expect(message.text).toContain("Eine formlose Antwort an info@x-portal.eu");
  });

  it("schreibt weder Adresse noch Text ins Protokoll der Ereignisse", async () => {
    await POST(sendRequest({ requestId: "abcdefgh" }), CONTEXT);

    const serialisiert = JSON.stringify(mocks.audit.mock.calls);
    expect(serialisiert).not.toContain(LEAD.recipient_email);
    expect(serialisiert).not.toContain("Guten Tag");
  });

  it("nutzt die bigint-Kennung nie als targetId", async () => {
    await POST(sendRequest({ requestId: "abcdefgh" }), CONTEXT);

    for (const [event] of mocks.audit.mock.calls as [
      { targetId?: string | null; metadata?: Record<string, unknown> },
    ][]) {
      expect(event.targetId).not.toBe(42);
      expect(event.targetId).not.toBe("42");
    }
  });

  it("lehnt einen bereits angeschriebenen Lead ab, ohne zu senden", async () => {
    mocks.getLead.mockResolvedValue({
      ...LEAD,
      last_contacted_at: "2026-09-01T12:00:00.000Z",
    });

    const response = await POST(sendRequest({ requestId: "abcdefgh" }), CONTEXT);

    expect(response.status).toBe(409);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("protokolliert einen gescheiterten Versand und archiviert nicht", async () => {
    mocks.deliver.mockResolvedValue({
      delivered: false,
      reason: "send_failed",
    });

    const response = await POST(sendRequest({ requestId: "abcdefgh" }), CONTEXT);

    expect(response.status).toBe(503);
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.recordSent).not.toHaveBeenCalled();
  });

  it("verschickt nichts, solange der Mailversand nicht eingerichtet ist", async () => {
    mocks.configured.mockReturnValue(false);

    const response = await POST(sendRequest({ requestId: "abcdefgh" }), CONTEXT);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      reason: "provider_not_configured",
    });
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("verlangt einen Entwurf, statt einen leeren Text zu verschicken", async () => {
    mocks.getDraft.mockResolvedValue(null);

    const response = await POST(sendRequest({ requestId: "abcdefgh" }), CONTEXT);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: "no_draft" });
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("erzeugt im Stapelbetrieb selbst einen Entwurf", async () => {
    mocks.getDraft.mockResolvedValue(null);
    mocks.createDraft.mockResolvedValue({
      status: "created",
      draft: {
        subject: "Freelancer für Projektmanager",
        body: "Ein Text, der lang genug ist, um verschickt zu werden.",
      },
      mode: "openai",
      model: "gpt-5.4-nano",
      creditsCharged: 2,
      credits: null,
    });

    const response = await POST(
      sendRequest({ requestId: "abcdefgh", autoDraft: true }),
      CONTEXT,
    );

    expect(response.status).toBe(200);
    expect(mocks.createDraft).toHaveBeenCalledTimes(1);
    expect(mocks.deliver).toHaveBeenCalledTimes(1);
  });

  it("stellt gar nicht erst zu, wenn ein anderer Lauf den Lead hält", async () => {
    // Der entscheidende Punkt: der Anspruch scheitert VOR deliverEmail.
    // Zwei gleichzeitige Läufe dürfen nicht beide zustellen.
    mocks.claim.mockResolvedValue({
      claimed: false,
      reason: "already_sent",
    });

    const response = await POST(sendRequest({ requestId: "abcdefgh" }), CONTEXT);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: "already_sent" });
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
});

describe("Stapelversand ohne menschliche Sicht", () => {
  beforeEach(() => {
    mocks.getDraft.mockResolvedValue(null);
  });

  it("verschickt keinen Text, dem ein Inserat einen fremden Link untergeschoben hat", async () => {
    mocks.createDraft.mockResolvedValue({
      status: "created",
      draft: {
        subject: "Freelancer für Projektmanager",
        body: "Bitte bestätigen Sie Ihre Daten unter https://boese.example/login, dann melde ich mich.",
      },
      mode: "openai",
      model: "gpt-5.4-nano",
      creditsCharged: 2,
      credits: null,
    });

    const response = await POST(
      sendRequest({ requestId: "abcdefgh", autoDraft: true }),
      CONTEXT,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      reason: "unattended_content",
    });
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.recordSent).not.toHaveBeenCalled();
  });

  it("verschickt keinen Text mit einer fremden Antwortadresse", async () => {
    mocks.createDraft.mockResolvedValue({
      status: "created",
      draft: {
        subject: "Freelancer für Projektmanager",
        body: "Antworten Sie bitte direkt an abrechnung@boese.example, dort wird alles geklärt.",
      },
      mode: "openai",
      model: "gpt-5.4-nano",
      creditsCharged: 2,
      credits: null,
    });

    const response = await POST(
      sendRequest({ requestId: "abcdefgh", autoDraft: true }),
      CONTEXT,
    );

    expect(response.status).toBe(409);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("lässt einen sauberen Stapeltext durch", async () => {
    mocks.createDraft.mockResolvedValue({
      status: "created",
      draft: {
        subject: "Freelancer für Projektmanager",
        body: "Sie haben eine Rolle ausgeschrieben. Darf ich Ihnen ein passendes Profil schicken?",
      },
      mode: "openai",
      model: "gpt-5.4-nano",
      creditsCharged: 2,
      credits: null,
    });

    const response = await POST(
      sendRequest({ requestId: "abcdefgh", autoDraft: true }),
      CONTEXT,
    );

    expect(response.status).toBe(200);
    expect(mocks.deliver).toHaveBeenCalledTimes(1);
  });

  it("prüft den Text des Betreibers nicht — den hat er selbst geschrieben", async () => {
    const response = await POST(
      sendRequest({
        requestId: "abcdefgh",
        subject: "Mein eigener Betreff",
        body: "Schauen Sie gern auf https://freelancermap.de/projekt/123, das meinte ich.",
      }),
      CONTEXT,
    );

    expect(response.status).toBe(200);
    expect(mocks.deliver).toHaveBeenCalledTimes(1);
  });
});

describe("Was das Protokoll über den Preis festhält", () => {
  it("übernimmt Modell und Credits aus dem Entwurf, auch wenn der Text aus dem Formular kommt", async () => {
    // Der Normalfall: der Betreiber lässt einen Entwurf erzeugen, sieht ihn im
    // Formular und schickt ihn von dort ab. Bezahlt wurde er trotzdem, und das
    // muss im Protokoll stehen.
    await POST(
      sendRequest({
        requestId: "abcdefgh",
        subject: "Freelancer für Projektmanager",
        body: "Sie haben eine Rolle ausgeschrieben. Darf ich Ihnen ein Profil schicken?",
      }),
      CONTEXT,
    );

    expect(mocks.claim).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-5.4-nano", credits: 2 }),
    );
  });

  it("lässt Modell und Credits leer, wenn es nie einen Entwurf gab", async () => {
    mocks.getDraft.mockResolvedValue(null);

    await POST(
      sendRequest({
        requestId: "abcdefgh",
        subject: "Selbst getippt",
        body: "Ein Text, den ich selbst geschrieben habe, ohne jedes Modell.",
      }),
      CONTEXT,
    );

    expect(mocks.claim).toHaveBeenCalledWith(
      expect.objectContaining({ model: null, credits: null }),
    );
  });
});

describe("Ein beanstandeter Entwurf bleibt beanstandet", () => {
  it("hält ihn auch im zweiten Anlauf auf, wenn er schon gespeichert ist", async () => {
    // Der erste Stapellauf hat den Text abgelehnt. Läge er weiter als Entwurf
    // bereit, würde ihn der nächste Lauf laden — und der Zweig, der ihn
    // aufhält, liefe gar nicht mehr an.
    mocks.getDraft.mockResolvedValue({
      id: "aaaaaaaa-0000-4000-8000-000000000001",
      lead_id: 42,
      state: "draft",
      subject: "Freelancer für Projektmanager",
      body: "Bitte bestätigen Sie Ihre Daten unter https://boese.example/login.",
      model: "gpt-5.4-nano",
      credits: 2,
      created_by: ADMIN.id,
      created_at: "2026-09-02T08:00:00.000Z",
      sent_at: null,
      failure_reason: null,
    });

    const response = await POST(
      sendRequest({ requestId: "abcdefgh", autoDraft: true }),
      CONTEXT,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      reason: "unattended_content",
    });
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("räumt den bezahlten, unbrauchbaren Entwurf weg, statt ihn liegen zu lassen", async () => {
    mocks.getDraft.mockResolvedValue(null);
    mocks.createDraft.mockResolvedValue({
      status: "created",
      draft: {
        subject: "Freelancer für Projektmanager",
        body: "Antworten Sie an abrechnung@boese.example, dort wird alles geklärt.",
      },
      mode: "openai",
      model: "gpt-5.4-nano",
      creditsCharged: 2,
      credits: null,
    });

    await POST(
      sendRequest({ requestId: "abcdefgh", autoDraft: true }),
      CONTEXT,
    );

    expect(mocks.rejectDraft).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 42, reason: "unattended_content" }),
    );
  });
});

describe("Text des Betreibers bleibt unangetastet", () => {
  it("schneidet einen selbst getippten Text nicht an einer Grußformel ab", async () => {
    // „beste Grüße nach München" mitten im Absatz hätte vorher alles
    // Nachfolgende stillschweigend entfernt.
    await POST(
      sendRequest({
        requestId: "abcdefgh",
        subject: "Mein Betreff",
        body: "Erste Zeile.\n\nBeste Grüße nach München gehen raus.\n\nUnd das hier muss stehen bleiben.",
      }),
      CONTEXT,
    );

    const [message] = mocks.deliver.mock.calls[0] as [{ text: string }];
    expect(message.text).toContain("Und das hier muss stehen bleiben.");
  });

  it("entfernt Anrede und Grußformel weiterhin aus einem Modellentwurf", async () => {
    mocks.getDraft.mockResolvedValue({
      id: "aaaaaaaa-0000-4000-8000-000000000001",
      lead_id: 42,
      state: "draft",
      subject: "Freelancer für Projektmanager",
      body: "Sehr geehrte Damen und Herren,\n\nSie haben eine Rolle ausgeschrieben.\n\nViele Grüße\nDas Modell",
      model: "gpt-5.4-nano",
      credits: 2,
      created_by: ADMIN.id,
      created_at: "2026-09-02T08:00:00.000Z",
      sent_at: null,
      failure_reason: null,
    });

    await POST(sendRequest({ requestId: "abcdefgh" }), CONTEXT);

    const [message] = mocks.deliver.mock.calls[0] as [{ text: string }];
    expect(message.text).not.toContain("Das Modell");
    expect(message.text.split("Viele Grüße").length - 1).toBe(1);
  });
});

describe("Abgelehnte Reservierung", () => {
  beforeEach(() => {
    mocks.getDraft.mockResolvedValue(null);
  });

  it("meldet fehlendes Guthaben als solches", async () => {
    mocks.createDraft.mockResolvedValue({
      status: "quota_denied",
      reason: "insufficient_credits",
      retryAfterSeconds: null,
      credits: null,
    });

    const response = await POST(
      sendRequest({ requestId: "abcdefgh", autoDraft: true }),
      CONTEXT,
    );

    expect(response.status).toBe(402);
    expect((await response.json()).error).toContain("Guthaben");
  });

  it("meldet eine Störung der Abrechnung nicht als leeres Guthaben", async () => {
    // Vorher entschied allein retryAfterSeconds — ein fehlender Dienstschlüssel
    // wurde damit als „Guthaben reicht nicht" gemeldet, und der Betreiber hätte
    // Credits nachgekauft, die er längst hat.
    mocks.createDraft.mockResolvedValue({
      status: "quota_denied",
      reason: "quota_service_not_configured",
      retryAfterSeconds: null,
      credits: null,
    });

    const response = await POST(
      sendRequest({ requestId: "abcdefgh", autoDraft: true }),
      CONTEXT,
    );

    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload.error).not.toContain("Guthaben");
    expect(payload.reason).toBe("quota_service_not_configured");
  });

  it("meldet ein Minutenlimit als Wartezeit", async () => {
    mocks.createDraft.mockResolvedValue({
      status: "quota_denied",
      reason: "rate_limited",
      retryAfterSeconds: 30,
      credits: null,
    });

    const response = await POST(
      sendRequest({ requestId: "abcdefgh", autoDraft: true }),
      CONTEXT,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
  });
});
