import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/security/shared-rate-limit", () => ({ consumeRateLimit: mocks.rateLimit }));

import { POST } from "@/app/api/sales-call/click/route";

function send(body: unknown, origin = "https://x-portal.eu") {
  return POST(new Request("https://x-portal.eu/api/sales-call/click", {
    method: "POST",
    headers: { "content-type": "application/json", origin, host: "x-portal.eu" },
    body: JSON.stringify(body),
  }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.audit.mockResolvedValue("trace");
  mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
});

// 18.10.2026: „Erstgespräch buchen“ öffnet Calendly direkt; der Klick wird
// nebenher gemeldet und zählt wie früher in /contact/termin.
describe("POST /api/sales-call/click", () => {
  it("counts an opened calendar with where the click came from", async () => {
    const response = await send({ von: "header" });
    expect(response.status).toBe(204);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "sales_call_calendar_opened",
      targetType: "crm_contacts",
      targetId: null,
      metadata: { prefilled: false, via: "header" },
    }));
  });

  it("ignores unknown entries, other origins and too many clicks", async () => {
    expect((await send({ von: "<script>" })).status).toBe(204);
    expect((await send({ von: "header" }, "https://evil.example")).status).toBe(403);
    mocks.rateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    expect((await send({ von: "hero" })).status).toBe(204);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
