import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  insert: vi.fn(),
  consume: vi.fn(),
  deliver: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/email/deliver", () => ({ deliverEmail: mocks.deliver }));
vi.mock("@/lib/security/shared-rate-limit", () => ({
  consumeRateLimit: mocks.consume,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({
      insert: (row: unknown) => ({
        select: () => ({
          single: async () => mocks.insert(row),
        }),
      }),
    }),
  }),
}));

import { POST } from "@/app/api/contact/route";
import { contactInbox } from "@/lib/contact/messages";

function request(fields: Record<string, string>, origin = "https://x-portal.eu") {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  return new Request("https://x-portal.eu/api/contact", {
    method: "POST",
    headers: { origin },
    body,
  }) as never;
}

const validFields = {
  fullName: "Erika Mustermann",
  email: "Erika@Example.COM",
  subject: "Frage zum Enterprise-Plan",
  message: "Wir suchen laufend Freelancer und würden gern mehr erfahren.",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  mocks.audit.mockResolvedValue("audit-id");
  mocks.consume.mockResolvedValue({
    allowed: true,
    remaining: 4,
    retryAfterSeconds: 0,
  });
  mocks.insert.mockResolvedValue({
    data: { id: "11111111-2222-4333-8444-555555555555" },
    error: null,
  });
  mocks.deliver.mockResolvedValue({ delivered: true });
});

describe("POST /api/contact", () => {
  it("stores a valid message and redirects back with a success marker", async () => {
    const response = await POST(request(validFields));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("status=sent");
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: "Erika Mustermann",
        // Kleingeschrieben, weil die Spalte genau das als CHECK verlangt.
        email: "erika@example.com",
        subject: "Frage zum Enterprise-Plan",
        source: "contact_form",
      }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "contact_request_saved" }),
    );
  });

  it("stores nothing the request did not carry", async () => {
    await POST(request(validFields));

    const row = mocks.insert.mock.calls[0][0] as Record<string, unknown>;
    // Eine Kontaktanfrage ist kein Anlass, Herkunftsdaten zu sammeln — die
    // Datenschutzerklärung sagt in Abschnitt 8 genau das zu.
    for (const forbidden of ["ip", "ip_hash", "user_agent", "referrer"]) {
      expect(Object.keys(row)).not.toContain(forbidden);
    }
  });

  it("rejects a cross-origin post before touching the database", async () => {
    const response = await POST(request(validFields, "https://attacker.example"));

    expect(response.status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("answers a filled honeypot like a real submission but saves nothing", async () => {
    const response = await POST(
      request({ ...validFields, website: "https://spam.example" }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("status=sent");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("sends a too-short message back to the form", async () => {
    const response = await POST(request({ ...validFields, message: "zu kurz" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("status=invalid");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects an invalid address before the rate limit is spent", async () => {
    const response = await POST(request({ ...validFields, email: "keine-adresse" }));

    expect(response.headers.get("location")).toContain("status=invalid");
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("carries Retry-After when the shared limit denies the request", async () => {
    mocks.consume.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 900,
    });

    const response = await POST(request(validFields));

    expect(response.headers.get("location")).toContain("status=error");
    expect(response.headers.get("retry-after")).toBe("900");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("tells the operator and confirms receipt to the sender", async () => {
    await POST(request(validFields));

    const recipients = mocks.deliver.mock.calls.map(
      (call) => (call[0] as { to: string }).to,
    );
    expect(recipients).toContain(contactInbox());
    expect(recipients).toContain("erika@example.com");

    const notification = mocks.deliver.mock.calls
      .map((call) => call[0] as { to: string; text: string })
      .find((message) => message.to === contactInbox());
    expect(notification?.text).toContain(validFields.message);
    expect(notification?.text).toContain("erika@example.com");

    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contact_request_saved",
        metadata: { notified: true, acknowledged: true },
      }),
    );
  });

  /**
   * Der Absender soll einen Beleg dessen behalten, was er geschickt hat.
   * Zitiert wird als Zitat erkennbar, damit die Nachricht nicht wie eine
   * Aussage von XPORTAL wirkt — die Adresse im Formular ist ungeprüft.
   */
  it("quotes the message back to the sender, marked as a quotation", async () => {
    await POST(request(validFields));

    const acknowledgement = mocks.deliver.mock.calls
      .map((call) => call[0] as { to: string; subject: string; text: string })
      .find((message) => message.to === "erika@example.com");

    expect(acknowledgement?.subject).toContain(validFields.subject);
    expect(acknowledgement?.text).toContain(`> ${validFields.message}`);
    expect(acknowledgement?.text).toContain(`> Betreff: ${validFields.subject}`);
    expect(acknowledgement?.text).toContain(validFields.fullName);
  });

  /**
   * "Im Impressum genannt" und "wird gelesen" sind zwei Dinge. Landet die
   * Benachrichtigung in einem Postfach, in das niemand schaut, ist die Anfrage
   * so gut wie nicht angekommen.
   */
  it("sends the notification wherever the operator points it", async () => {
    process.env.CONTACT_NOTIFICATION_EMAIL = "wirklich-gelesen@example.com";
    try {
      await POST(request(validFields));

      const recipients = mocks.deliver.mock.calls.map(
        (call) => (call[0] as { to: string }).to,
      );
      expect(recipients).toContain("wirklich-gelesen@example.com");
    } finally {
      delete process.env.CONTACT_NOTIFICATION_EMAIL;
    }
  });

  /**
   * Die Anfrage steht bereits in der Tabelle. Eine Fehlerseite brächte
   * jemanden dazu, dieselbe Nachricht erneut zu schicken.
   */
  it("still confirms the form when the mail cannot go out, and records it", async () => {
    mocks.deliver.mockResolvedValue({
      delivered: false,
      reason: "provider_not_configured",
    });

    const response = await POST(request(validFields));

    expect(response.headers.get("location")).toContain("status=sent");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contact_request_saved",
        metadata: { notified: false, acknowledged: false },
      }),
    );
  });

  it("reports a database failure instead of pretending success", async () => {
    mocks.insert.mockResolvedValue({
      data: null,
      error: { message: "insert failed" },
    });

    const response = await POST(request(validFields));

    expect(response.headers.get("location")).toContain("status=error");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "contact_request_failed" }),
    );
  });
});
