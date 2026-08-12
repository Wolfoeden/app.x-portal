import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
  readJsonWithLimit,
} from "@/lib/security/request";

describe("request security", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("rejects a cross-origin write", () => {
    const request = new Request("https://app.example/api/chat", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });

    expect(() => assertSameOrigin(request)).toThrow(Response);
  });

  it("accepts same-origin writes", () => {
    const request = new Request("https://app.example/api/chat", {
      method: "POST",
      headers: { origin: "https://app.example" },
    });

    expect(() => assertSameOrigin(request)).not.toThrow();
  });

  it("accepts the browser Host origin when the server listens on an internal address", () => {
    const request = new Request("http://0.0.0.0:3011/api/chat", {
      method: "POST",
      headers: {
        host: "localhost:3011",
        origin: "http://localhost:3011",
      },
    });

    expect(() => assertSameOrigin(request)).not.toThrow();
  });

  it("rejects oversized bodies before JSON parsing", async () => {
    const request = new Request("https://app.example/api/chat", {
      method: "POST",
      body: JSON.stringify({ value: "a".repeat(200) }),
    });

    await expect(readJsonWithLimit(request, 50)).rejects.toMatchObject({
      status: 413,
    });
  });

  it("produces stable pseudonyms without returning the raw IP", () => {
    const first = pseudonymizeIp("203.0.113.8");
    const second = pseudonymizeIp("203.0.113.8");
    expect(first).toBe(second);
    expect(first).not.toContain("203.0.113.8");
    expect(first).toHaveLength(64);
  });

  it("uses only the Netlify-owned connection header on a Netlify fallback", () => {
    vi.stubEnv("NETLIFY", "true");
    const request = new Request("https://app.example/api/chat", {
      headers: {
        "x-nf-client-connection-ip": "203.0.113.9",
        "cf-connecting-ip": "198.51.100.77",
        "x-forwarded-for": "198.51.100.88",
      },
    });

    expect(getClientIp(request)).toBe("203.0.113.9");
  });

  it("does not trust generic forwarding headers in another production host", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NETLIFY", "false");
    vi.stubEnv("TRUST_PROXY_IP_HEADERS", "false");
    const request = new Request("https://app.example/api/chat", {
      headers: { "x-forwarded-for": "198.51.100.88" },
    });

    expect(getClientIp(request)).toBe("unknown");
  });
});
