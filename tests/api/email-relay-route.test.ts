import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ deliver: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/deliver", () => ({ deliverEmail: mocks.deliver }));

import { POST } from "@/app/api/email/send/route";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";

const TOKEN = "test-only-relay-token-".repeat(3);
const MESSAGE = { to: "roman@dering.info", subject: "Test", text: "Hello", kind: "transactional" };

function request(body: unknown = MESSAGE, token: string | null = TOKEN) {
  return new Request("https://x-portal.eu/api/email/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  resetRateLimitsForTests();
  vi.stubEnv("EMAIL_RELAY_TOKEN", TOKEN);
  vi.stubEnv("EMAIL_RELAY_ALLOWED_RECIPIENTS", "roman@dering.info");
  mocks.deliver.mockResolvedValue({ delivered: true });
});

describe("POST /api/email/send", () => {
  it.each(["", "short", "x".repeat(257)])("disables a missing/invalid token (%s)", async (token) => {
    vi.stubEnv("EMAIL_RELAY_TOKEN", token);
    expect((await POST(request())).status).toBe(503);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it.each([null, "wrong", "x".repeat(TOKEN.length)])("rejects invalid authorization (%s)", async (token) => {
    expect((await POST(request(MESSAGE, token))).status).toBe(401);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("requires the Bearer authentication scheme", async () => {
    const req = request();
    req.headers.set("authorization", TOKEN);
    expect((await POST(req)).status).toBe(401);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it.each(["", "not-an-address", "roman@dering.info,"])("disables invalid recipient grants (%s)", async (list) => {
    vi.stubEnv("EMAIL_RELAY_ALLOWED_RECIPIENTS", list);
    expect((await POST(request())).status).toBe(503);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("rejects a recipient outside the explicit list", async () => {
    expect((await POST(request({ ...MESSAGE, to: "other@example.com" }))).status).toBe(403);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it.each([
    { ...MESSAGE, to: "invalid" },
    { ...MESSAGE, from: "attacker@example.com" },
    { ...MESSAGE, headers: { "Reply-To": "attacker@example.com" } },
    { ...MESSAGE, subject: "Injected\r\nBcc: other@example.com" },
    { ...MESSAGE, subject: "x".repeat(201) },
    { ...MESSAGE, text: "x".repeat(16_001) },
    { ...MESSAGE, text: " " },
    { ...MESSAGE, kind: "unknown" },
    { to: MESSAGE.to, subject: "Test", text: "Hello" },
  ])("rejects invalid messages before delivery", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and an oversized body", async () => {
    const malformed = new Request("https://x-portal.eu/api/email/send", {
      method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: "{",
    });
    expect((await POST(malformed)).status).toBe(400);
    expect((await POST(request({ ...MESSAGE, text: "x".repeat(71_000) }))).status).toBe(413);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it.each(["transactional", "cold_outreach", "newsletter"])("uses the existing delivery guards for %s", async (kind) => {
    const response = await POST(request({ ...MESSAGE, to: " ROMAN@DERING.INFO ", kind }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ accepted: true });
    expect(mocks.deliver).toHaveBeenCalledExactlyOnceWith({ ...MESSAGE, kind });
  });

  it("preserves delivery refusal without returning SMTP details", async () => {
    mocks.deliver.mockResolvedValue({ delivered: false, reason: "suppressed", detail: "private provider detail" });
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ accepted: false, error: "suppressed" });
  });

  it("does not leak unexpected provider failures", async () => {
    mocks.deliver.mockRejectedValue(new Error("private provider detail"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ accepted: false, error: "delivery_failed" });
  });

  it("limits attempts per running instance without sending the eleventh", async () => {
    for (let i = 0; i < 10; i++) expect((await POST(request())).status).toBe(200);
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(mocks.deliver).toHaveBeenCalledTimes(10);
  });
});
