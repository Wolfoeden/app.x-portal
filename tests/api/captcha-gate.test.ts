import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  consume: vi.fn(),
  deliver: vi.fn(),
  insert: vi.fn(),
  verifyCaptcha: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/email/deliver", () => ({ deliverEmail: mocks.deliver }));
vi.mock("@/lib/security/shared-rate-limit", () => ({
  consumeRateLimit: mocks.consume,
}));
vi.mock("@/lib/security/captcha", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/captcha")>()),
  verifyCaptcha: mocks.verifyCaptcha,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({
      insert: (row: unknown) => ({
        select: () => ({ single: async () => mocks.insert(row) }),
      }),
    }),
  }),
}));

import { POST as contactPost } from "@/app/api/contact/route";
import { CAPTCHA_FIELD } from "@/lib/security/captcha";

function contactRequest(extra: Record<string, string> = {}) {
  const body = new FormData();
  const fields = {
    fullName: "Erika Mustermann",
    email: "erika@example.com",
    subject: "Frage zum Angebot",
    message: "Ich habe eine Frage zu Ihrem Angebot und bitte um Rueckmeldung.",
    ...extra,
  };
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  return new Request("https://x-portal.eu/api/contact", {
    method: "POST",
    headers: { origin: "https://x-portal.eu" },
    body,
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  mocks.audit.mockResolvedValue("audit-id");
  mocks.consume.mockResolvedValue({ allowed: true, remaining: 4, retryAfterSeconds: 0 });
  mocks.insert.mockResolvedValue({
    data: { id: "11111111-2222-4333-8444-555555555555" },
    error: null,
  });
  mocks.deliver.mockResolvedValue({ delivered: true });
  mocks.verifyCaptcha.mockResolvedValue({ ok: true });
});

describe("captcha gate on the contact form", () => {
  it("passes the submitted token and the caller address to the check", async () => {
    await contactPost(contactRequest({ [CAPTCHA_FIELD]: "token-from-widget" }));

    expect(mocks.verifyCaptcha).toHaveBeenCalledWith("token-from-widget", expect.anything());
  });

  // Der Kern: eine abgelehnte Pruefung darf nicht nur eine Fehlerseite zeigen,
  // sie muss den Schreibvorgang und den Mailversand verhindern.
  it("writes nothing and sends nothing when the check fails", async () => {
    mocks.verifyCaptcha.mockResolvedValue({ ok: false, reason: "rejected" });

    const response = await contactPost(contactRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("error");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("lets a confirmed submission through", async () => {
    const response = await contactPost(contactRequest({ [CAPTCHA_FIELD]: "gut" }));

    expect(mocks.insert).toHaveBeenCalled();
    expect(response.headers.get("location")).not.toContain("error");
  });

  // Ein Bot, der den Honeypot gefuellt hat, soll gar nicht erst eine Anfrage
  // an hCaptcha ausloesen — das waere eine Anfrage pro Bot auf unsere Kosten.
  it("does not ask hCaptcha about a submission the honeypot already caught", async () => {
    await contactPost(contactRequest({ website: "https://spam.example" }));

    expect(mocks.verifyCaptcha).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
