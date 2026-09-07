import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  currentUser: vi.fn(),
  configured: vi.fn(),
  prepare: vi.fn(),
  send: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.currentUser,
}));
vi.mock("@/lib/email/deliver", () => ({
  promotionalDeliveryConfigured: mocks.configured,
}));
vi.mock("@/lib/leadgen/match-run", () => ({
  runLeadPreparePass: mocks.prepare,
  runLeadSendPass: mocks.send,
}));

import { POST } from "@/app/api/leadgen/run/route";

const TOKEN = "a".repeat(48);

const LEERES_ERGEBNIS = {
  examined: 0,
  prepared: 0,
  sent: 0,
  archived: 0,
  skipped: 0,
  discarded: 0,
  outcomes: [],
  remaining: 0,
  dailyBudgetLeft: 20,
  stoppedBy: "queue_empty" as const,
};

/**
 * Zwei Aufrufer, zwei Anfragen. Der Zeitgeber weist sich mit dem Geheimnis
 * aus und schickt keinen Ursprung mit; der Browser des Betreibers bringt
 * eine Sitzung und einen Ursprung.
 */
function schedulerAnfrage(body: unknown = {}): Request {
  return new Request("https://x-portal.eu/api/leadgen/run", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-leadgen-run-token": TOKEN,
    },
    body: JSON.stringify(body),
  });
}

function browserAnfrage(body: unknown = {}, origin = "https://x-portal.eu"): Request {
  return new Request("https://x-portal.eu/api/leadgen/run", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "sec-fetch-site": origin === "https://x-portal.eu" ? "same-origin" : "cross-site",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LEADGEN_RUN_SECRET = TOKEN;
  process.env.EMAIL_FROM = "info@x-portal.eu";
  mocks.audit.mockResolvedValue(undefined);
  mocks.configured.mockReturnValue(true);
  mocks.currentUser.mockResolvedValue({ id: "admin-1", isAdmin: true });
  mocks.prepare.mockResolvedValue({ ...LEERES_ERGEBNIS, prepared: 7, examined: 9 });
  mocks.send.mockResolvedValue({ ...LEERES_ERGEBNIS, sent: 3, examined: 3 });
});

describe("POST /api/leadgen/run", () => {
  it("verschickt, wenn kein Modus angegeben ist", async () => {
    const response = await POST(schedulerAnfrage());

    expect(response.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("gleicht ab, wenn der Modus prepare heißt", async () => {
    const response = await POST(schedulerAnfrage({ mode: "prepare" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.mode).toBe("prepare");
    expect(payload.prepared).toBe(7);
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("bindet nur den Versand des Zeitgebers an das Fenster", async () => {
    await POST(schedulerAnfrage({ mode: "send" }));

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ enforceWindow: true, trigger: "scheduler" }),
    );
  });

  it("lässt den Betreiber jederzeit verschicken", async () => {
    await POST(browserAnfrage({ mode: "send" }));

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ enforceWindow: false, trigger: "admin" }),
    );
  });

  it("gleicht auch ohne eingerichteten Mailversand ab", async () => {
    // Ein Abgleich verschickt nichts. Ihn am fehlenden SMTP-Zugang scheitern
    // zu lassen hieße, die Nachfrageauswertung an den Mailserver zu binden.
    mocks.configured.mockReturnValue(false);

    const response = await POST(browserAnfrage({ mode: "prepare" }));

    expect(response.status).toBe(200);
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
  });

  it("weist einen Versand ohne eingerichteten Mailversand ab", async () => {
    mocks.configured.mockReturnValue(false);

    const response = await POST(browserAnfrage({ mode: "send" }));

    expect(response.status).toBe(503);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("weist einen Aufruf von einer fremden Seite ab", async () => {
    const response = await POST(
      browserAnfrage({ mode: "prepare" }, "https://boese.example"),
    );

    expect(response.status).toBe(403);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("verlangt vom Zeitgeber keinen Ursprung", async () => {
    // Die Anfrage aus pg_net trägt weder Origin noch sec-fetch-site. Sie
    // deshalb abzuweisen richtete die Prüfung gegen den einzigen Aufrufer,
    // der sie nicht erfüllen kann.
    const response = await POST(schedulerAnfrage({ mode: "prepare" }));

    expect(response.status).toBe(200);
  });

  it("weist ein falsches Token ab, ohne auf die Sitzung auszuweichen", async () => {
    const request = new Request("https://x-portal.eu/api/leadgen/run", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-leadgen-run-token": "b".repeat(48),
      },
      body: "{}",
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("weist ein Konto ohne Adminrecht ab", async () => {
    mocks.currentUser.mockResolvedValue({ id: "user-1", isAdmin: false });

    const response = await POST(browserAnfrage({ mode: "prepare" }));

    expect(response.status).toBe(403);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("weist einen unbekannten Modus ab", async () => {
    const response = await POST(browserAnfrage({ mode: "loeschen" }));

    expect(response.status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("hält im Protokoll fest, was der Durchgang war", async () => {
    await POST(schedulerAnfrage({ mode: "prepare" }));

    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "leadgen_match_run",
        // Der geplante Lauf hat kein Konto; eine erfundene Kennung wäre
        // schlechter als keine.
        actorUserId: null,
        metadata: expect.objectContaining({
          mode: "prepare",
          prepared: 7,
          trigger: "scheduler",
        }),
      }),
    );
  });
});
