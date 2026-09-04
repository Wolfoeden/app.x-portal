import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
  logEvent: vi.fn(),
  checkEmailSuppression: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport },
}));
vi.mock("@/lib/security/request", () => ({ logEvent: mocks.logEvent }));
vi.mock("@/lib/email/suppression", () => ({
  checkEmailSuppression: mocks.checkEmailSuppression,
}));

import {
  deliverEmail,
  emailDeliveryConfigured,
  promotionalDeliveryConfigured,
  resetEmailTransportForTests,
} from "@/lib/email/deliver";

const MESSAGE = {
  to: "erika@example.com",
  subject: "Bitte bestätigen",
  text: "Hallo Erika, bitte bestätigen Sie Ihre Adresse.",
  kind: "transactional",
} as const;

/** Dieselbe Nachricht, nur als Werbung eingestuft. */
const WERBUNG = { ...MESSAGE, kind: "cold_outreach" } as const;

/** Lang genug, dass `unsubscribeConfigured()` es gelten lässt. */
const UNSUBSCRIBE_SECRET = "x".repeat(48);

function configure(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    SMTP_HOST: "smtp.ionos.de",
    SMTP_PORT: "587",
    SMTP_USER: "post@x-portal.eu",
    SMTP_PASSWORD: "geheim",
    EMAIL_FROM: "post@x-portal.eu",
    EMAIL_UNSUBSCRIBE_SECRET: UNSUBSCRIBE_SECRET,
    NEXT_PUBLIC_SITE_URL: "https://x-portal.eu",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  resetEmailTransportForTests();
  mocks.sendMail.mockResolvedValue({ messageId: "1" });
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
  mocks.checkEmailSuppression.mockResolvedValue("clear");
});

describe("transactional email delivery", () => {
  it("reports itself unconfigured instead of pretending to send", async () => {
    const result = await deliverEmail(MESSAGE);

    expect(emailDeliveryConfigured()).toBe(false);
    expect(result).toEqual({
      delivered: false,
      reason: "provider_not_configured",
    });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("refuses a half-configured mailbox rather than failing at send time", async () => {
    configure({ SMTP_PASSWORD: "" });

    expect(emailDeliveryConfigured()).toBe(false);
    expect((await deliverEmail(MESSAGE)).delivered).toBe(false);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("negotiates STARTTLS on 587", async () => {
    configure();

    await deliverEmail(MESSAGE);

    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.ionos.de",
        port: 587,
        secure: false,
        requireTLS: true,
      }),
    );
  });

  it("uses implicit TLS on 465", async () => {
    configure({ SMTP_PORT: "465" });

    await deliverEmail(MESSAGE);

    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true, requireTLS: false }),
    );
  });

  it("never sends unencrypted", async () => {
    for (const port of ["25", "587", "465", "2525"]) {
      resetEmailTransportForTests();
      mocks.createTransport.mockClear();
      configure({ SMTP_PORT: port });

      await deliverEmail(MESSAGE);

      const options = mocks.createTransport.mock.calls[0][0];
      expect(options.secure || options.requireTLS).toBe(true);
    }
  });

  it("passes the message through unchanged", async () => {
    configure();

    expect(await deliverEmail(MESSAGE)).toEqual({ delivered: true });
    expect(mocks.sendMail).toHaveBeenCalledWith({
      from: "post@x-portal.eu",
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      text: MESSAGE.text,
    });
  });

  it("falls back to the mailbox when no sender is configured", async () => {
    configure({ EMAIL_FROM: "" });

    await deliverEmail(MESSAGE);

    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "post@x-portal.eu" }),
    );
  });

  it("reports a failed send instead of swallowing it", async () => {
    configure();
    mocks.sendMail.mockRejectedValue(
      Object.assign(new Error("550 no such user erika@example.com"), {
        code: "EENVELOPE",
      }),
    );

    expect(await deliverEmail(MESSAGE)).toEqual({
      delivered: false,
      reason: "send_failed",
    });
  });

  it("keeps the recipient out of the log", async () => {
    configure();
    mocks.sendMail.mockRejectedValue(
      Object.assign(new Error("550 no such user erika@example.com"), {
        code: "EENVELOPE",
      }),
    );

    await deliverEmail(MESSAGE);

    const logged = JSON.stringify(mocks.logEvent.mock.calls);
    // SMTP-Fehlermeldungen nennen regelmäßig die Empfängeradresse; das
    // Logging-Prinzip aus docs/security-operations.md verbietet sie.
    expect(logged).not.toContain("erika@example.com");
    expect(logged).not.toContain("no such user");
    expect(logged).toContain("EENVELOPE");
  });

  it("reuses one transport for the same configuration", async () => {
    configure();

    await deliverEmail(MESSAGE);
    await deliverEmail(MESSAGE);

    expect(mocks.createTransport).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the transport when the mailbox changes", async () => {
    configure();
    await deliverEmail(MESSAGE);

    configure({ SMTP_USER: "anders@x-portal.eu" });
    await deliverEmail(MESSAGE);

    expect(mocks.createTransport).toHaveBeenCalledTimes(2);
  });

  it("never asks the suppression list about a transactional message", async () => {
    configure();
    mocks.checkEmailSuppression.mockResolvedValue("suppressed");

    // Der Kern der Unterscheidung: Wer der Werbung widersprochen hat und sich
    // später selbst anmeldet, bekommt die Bestätigung seiner Anmeldung. Die
    // Liste wird dafür nicht einmal befragt.
    expect(await deliverEmail(MESSAGE)).toEqual({ delivered: true });
    expect(mocks.checkEmailSuppression).not.toHaveBeenCalled();
  });

  it("sends no unsubscribe header on a transactional message", async () => {
    configure();

    await deliverEmail(MESSAGE);

    const options = mocks.sendMail.mock.calls[0][0];
    expect(options.headers).toBeUndefined();
  });
});

describe("promotional email delivery", () => {
  it("stops at the suppression list", async () => {
    configure();
    mocks.checkEmailSuppression.mockResolvedValue("suppressed");

    expect(await deliverEmail(WERBUNG)).toEqual({
      delivered: false,
      reason: "suppressed",
    });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("stops when the list cannot be reached — with a different reason", async () => {
    configure();
    mocks.checkEmailSuppression.mockResolvedValue("unavailable");

    // Nicht senden ist in beiden Fällen richtig. Die Gründe zu verwechseln
    // wäre es nicht: Der Aufrufer verwirft bei „suppressed" den Vorgang
    // dauerhaft, und ein Datenbankaussetzer darf das nicht auslösen.
    expect(await deliverEmail(WERBUNG)).toEqual({
      delivered: false,
      reason: "suppression_check_failed",
    });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("refuses to send when no unsubscribe link can be built", async () => {
    configure({ EMAIL_UNSUBSCRIBE_SECRET: "" });

    // Lieber gar nicht schreiben als ohne funktionierenden Widerspruch
    // schreiben: Die Zusage im Fuß der Nachricht muss einlösbar sein.
    expect(await deliverEmail(WERBUNG)).toEqual({
      delivered: false,
      reason: "unsubscribe_not_configured",
    });
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(promotionalDeliveryConfigured()).toBe(false);
    // Der Transaktionsweg bleibt davon unberührt.
    expect(emailDeliveryConfigured()).toBe(true);
  });

  it("sets the one-click headers from RFC 8058", async () => {
    configure();

    expect(await deliverEmail(WERBUNG)).toEqual({ delivered: true });

    const options = mocks.sendMail.mock.calls[0][0];
    expect(options.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect(options.headers["List-Unsubscribe"]).toContain(
      "https://x-portal.eu/unsubscribe?t=",
    );
    // Ohne HTTP-Unterstützung im Mailprogramm bleibt der Postweg.
    expect(options.headers["List-Unsubscribe"]).toContain("mailto:");
  });

  it("checks the list against the normalised address", async () => {
    configure();

    await deliverEmail({ ...WERBUNG, to: "  Erika@Example.COM  " });

    expect(mocks.checkEmailSuppression).toHaveBeenCalledWith("erika@example.com");
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "erika@example.com" }),
    );
  });

  it("keeps the recipient out of the log when suppressed", async () => {
    configure();
    mocks.checkEmailSuppression.mockResolvedValue("suppressed");

    await deliverEmail(WERBUNG);

    expect(JSON.stringify(mocks.logEvent.mock.calls)).not.toContain(
      "erika@example.com",
    );
  });

  it("refuses an unusable recipient before anything else happens", async () => {
    configure();

    expect(await deliverEmail({ ...WERBUNG, to: "kein-postfach" })).toEqual({
      delivered: false,
      reason: "invalid_recipient",
    });
    expect(mocks.checkEmailSuppression).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});
