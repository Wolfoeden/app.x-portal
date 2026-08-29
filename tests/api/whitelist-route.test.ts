import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  consume: vi.fn(),
  deliver: vi.fn(),
  lookup: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
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
      select: () => ({
        eq: () => ({ maybeSingle: async () => mocks.lookup() }),
      }),
      upsert: (row: unknown) => ({
        select: () => ({ single: async () => mocks.upsert(row) }),
      }),
      update: (row: unknown) => ({
        eq: async () => mocks.update(row),
      }),
    }),
  }),
}));

import { POST } from "@/app/api/whitelist/route";

function request(fields: Record<string, string> = {}) {
  const body = new FormData();
  const defaults = {
    fullName: "Erika Mustermann",
    email: "erika@example.com",
    country: "Deutschland",
    consent: "yes",
  };
  for (const [key, value] of Object.entries({ ...defaults, ...fields })) {
    body.append(key, value);
  }
  return new Request("https://x-portal.eu/api/whitelist", {
    method: "POST",
    headers: { origin: "https://x-portal.eu" },
    body,
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  mocks.audit.mockResolvedValue("audit-id");
  mocks.consume.mockResolvedValue({
    allowed: true,
    remaining: 4,
    retryAfterSeconds: 0,
  });
  mocks.lookup.mockResolvedValue({ data: null, error: null });
  mocks.upsert.mockResolvedValue({
    data: { id: "11111111-2222-4333-8444-555555555555" },
    error: null,
  });
  mocks.update.mockResolvedValue({ error: null });
  mocks.deliver.mockResolvedValue({
    delivered: false,
    reason: "provider_not_configured",
  });
});

describe("POST /api/whitelist", () => {
  it("stores a new entry as unconfirmed, never as consent", async () => {
    await POST(request());

    const row = mocks.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.status).toBe("pending");
    expect(row.confirmed_at).toBeNull();
    // Der Nachweis entsteht erst mit der Bestätigung; consent_at hält nur
    // fest, dass die Erklärung abgeschickt wurde.
    expect(row.consent_at).toEqual(expect.any(String));
    expect(row.confirmation_token_hash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("says the entry is noted when no confirmation could be sent", async () => {
    const response = await POST(request());

    expect(response.status).toBe(303);
    // Nicht "joined": Es ging keine Mail raus, und die Seite darf nichts
    // anderes behaupten.
    expect(response.headers.get("location")).toContain("pending=1");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("records the send and points at the inbox once delivery works", async () => {
    mocks.deliver.mockResolvedValue({ delivered: true });

    const response = await POST(request());

    expect(response.headers.get("location")).toContain("joined=1");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ confirmation_sent_at: expect.any(String) }),
    );
  });

  it("never mails a token that is not the one it stored", async () => {
    mocks.deliver.mockResolvedValue({ delivered: true });

    await POST(request());

    const { createHash } = await import("node:crypto");
    const sent = mocks.deliver.mock.calls[0][0] as { text: string };
    const token = /token=([A-Za-z0-9_-]+)/u.exec(sent.text)?.[1] ?? "";
    const stored = (mocks.upsert.mock.calls[0][0] as Record<string, unknown>)
      .confirmation_token_hash;

    expect(token.length).toBeGreaterThan(30);
    expect(createHash("sha256").update(token).digest("hex")).toBe(stored);
  });

  it("does not reset an address that is already confirmed", async () => {
    mocks.lookup.mockResolvedValue({
      data: { id: "existing-id", status: "confirmed" },
      error: null,
    });

    const response = await POST(request());

    // Sonst könnte ein Dritter mit einer fremden Adresse eine bestehende
    // Einwilligung entwerten.
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("joined=1");
  });

  it("answers a filled honeypot without storing or mailing anything", async () => {
    const response = await POST(request({ website: "https://spam.example" }));

    expect(response.headers.get("location")).toContain("joined=1");
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("rejects a submission without the consent declaration", async () => {
    const response = await POST(request({ consent: "" }));

    expect(response.headers.get("location")).toContain("error=1");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
