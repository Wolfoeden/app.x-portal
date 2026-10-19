import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  suppressEmail: vi.fn(),
  writeAuditEvent: vi.fn(),
  consumeRateLimit: vi.fn(),
}));

vi.mock("@/lib/email/suppression", () => ({ suppressEmail: mocks.suppressEmail }));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.writeAuditEvent }));
vi.mock("@/lib/security/shared-rate-limit", () => ({ consumeRateLimit: mocks.consumeRateLimit }));

import { NextRequest } from "next/server";

import { POST } from "@/app/api/unsubscribe/route";
import { unsubscribeHeaders, unsubscribeOneClickUrl } from "@/lib/email/unsubscribe";

const SECRET = "s".repeat(48);

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", SECRET);
  vi.stubEnv("IP_HASH_SECRET", "h".repeat(48));
  mocks.suppressEmail.mockReset().mockResolvedValue({ suppressed: true, wasNew: true });
  mocks.writeAuditEvent.mockReset().mockResolvedValue(undefined);
  mocks.consumeRateLimit.mockReset().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
});

// Gmail, Yahoo und Outlook nehmen die erste https-Adresse aus
// `List-Unsubscribe` und schicken dorthin einen POST (RFC 8058). Bis
// 19.10.2026 war das die Seite /unsubscribe, die keinen POST annimmt.
describe("Ein-Klick-Abbestellen aus dem Mailprogramm", () => {
  it("trägt die Adresse aus der Kopfzeile in die Sperrliste ein", async () => {
    const url = unsubscribeOneClickUrl("https://x-portal.eu", "erika@example.com");
    expect(url).toMatch(/^https:\/\/x-portal\.eu\/api\/unsubscribe\?t=/u);

    const header = unsubscribeHeaders({ url: url!, mailto: "info@x-portal.eu" })["List-Unsubscribe"];
    const target = header.match(/<(https:[^>]+)>/u)![1];

    const response = await POST(new NextRequest(target, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    }));

    expect(response.status).toBe(200);
    expect(mocks.suppressEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: "erika@example.com",
      source: "list_unsubscribe_one_click",
    }));
  });

  it("lehnt einen POST ohne gültigen Token ab, ohne etwas einzutragen", async () => {
    const response = await POST(new NextRequest("https://x-portal.eu/api/unsubscribe?t=gefälscht", {
      method: "POST",
      body: "List-Unsubscribe=One-Click",
    }));

    expect(response.status).toBe(400);
    expect(mocks.suppressEmail).not.toHaveBeenCalled();
  });
});
