import { afterEach, describe, expect, it, vi } from "vitest";

import keepWarm, { config } from "@/netlify/functions/keep-warm";

afterEach(() => {
  vi.unstubAllGlobals();
});

// 18.10.2026: Kaltstarts der Server-Funktion kosteten Besucher mehrere
// Sekunden; die flache Prüfung hält sie alle 5 Minuten warm.
describe("keep-warm function", () => {
  it("calls the shallow health check of the site every five minutes", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await keepWarm(new Request("https://x-portal.eu/"), { site: { url: "https://x-portal.eu" } } as never);
    expect(config.schedule).toBe("*/5 * * * *");
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe("https://x-portal.eu/api/health");
    expect(response.status).toBe(204);
  });

  it("does not throw when the site is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect((await keepWarm(new Request("https://x-portal.eu/"), { site: {} } as never)).status).toBe(502);
  });
});
