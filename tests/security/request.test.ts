import { describe, expect, it } from "vitest";

import {
  assertSameOrigin,
  pseudonymizeIp,
  readJsonWithLimit,
} from "@/lib/security/request";

describe("request security", () => {
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
});
