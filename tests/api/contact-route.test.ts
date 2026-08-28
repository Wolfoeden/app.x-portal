import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  insert: vi.fn(),
  consume: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
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
