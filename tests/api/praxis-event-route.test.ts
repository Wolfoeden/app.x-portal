import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  rateLimit: vi.fn(),
  currentUser: vi.fn(),
  readToken: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/security/shared-rate-limit", () => ({ consumeRateLimit: mocks.rateLimit }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/sales/praxis", () => ({ readPraxisToken: mocks.readToken }));

import { POST } from "@/app/api/praxis/event/route";

const CONTACT = "11111111-1111-4111-8111-111111111111";

function send(body: unknown, origin = "https://x-portal.eu") {
  return POST(new Request("https://x-portal.eu/api/praxis/event", {
    method: "POST",
    headers: { "content-type": "application/json", origin, host: "x-portal.eu" },
    body: JSON.stringify(body),
  }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.audit.mockResolvedValue("trace");
  mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  mocks.currentUser.mockResolvedValue(null);
  mocks.readToken.mockImplementation((token: unknown) => (token === "gültig" ? CONTACT : null));
});

describe("POST /api/praxis/event", () => {
  it("records marked examples as keys, assigned to the contact of the link", async () => {
    const response = await send({ t: "gültig", kind: "interest", interests: ["anfragen", "servicewissen", "<script>"] });
    expect(response.status).toBe(204);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "praxis_interest",
      targetType: "crm_contacts",
      targetId: CONTACT,
      metadata: { interests: "anfragen,servicewissen", linked: true },
    }));
  });

  it("counts an opened calendar from the page, also without a link", async () => {
    await send({ kind: "calendar", slot: true, interests: [] });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "sales_call_calendar_opened",
      targetId: null,
      metadata: { via: "praxis", slot: true, interests: null, prefilled: false },
    }));
  });

  it("ignores the operator, nonsense and other origins", async () => {
    mocks.currentUser.mockResolvedValue({ id: "admin", isAdmin: true, isAnonymous: false });
    expect((await send({ kind: "interest", interests: ["anfragen"] })).status).toBe(204);
    mocks.currentUser.mockResolvedValue(null);
    expect((await send({ kind: "löschen" })).status).toBe(204);
    expect((await send({ kind: "interest", interests: ["anfragen"] }, "https://evil.example")).status).not.toBe(500);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
