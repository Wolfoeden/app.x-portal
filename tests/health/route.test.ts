import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/env", () => ({
  getSupabasePublicEnv: () => ({
    url: "https://example.supabase.co",
    publishableKey: "test-publishable-key",
  }),
}));

vi.mock("@/lib/openai/provider", () => ({
  resolveOpenAiConnection: () => ({
    configured: true,
    transport: "direct_openai",
    baseUrl: "https://api.openai.com/v1",
  }),
}));

import { GET } from "@/app/api/health/route";

/** Muss die Mindestlänge aus der Route erfüllen, sonst gilt er als nicht gesetzt. */
const TOKEN = "health-token-with-enough-length";

function deepRequest(token?: string) {
  return new Request("https://app.example/api/health?deep=1", {
    headers: token ? { "x-health-token": token } : {},
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("health route", () => {
  it("authenticates the deep Supabase health request with the public key", async () => {
    vi.stubEnv("HEALTH_CHECK_TOKEN", TOKEN);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(deepRequest(TOKEN));

    expect(response.status).toBe(200);
    await expect(response.clone().json()).resolves.toMatchObject({
      checks: {
        openAiConfigured: true,
        openAiTransport: "direct_openai",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/auth/v1/health",
      expect.objectContaining({
        cache: "no-store",
        headers: { apikey: "test-publishable-key" },
      }),
    );
  });

  it("fails closed when the upstream health check is unavailable", async () => {
    vi.stubEnv("HEALTH_CHECK_TOKEN", TOKEN);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    const response = await GET(deepRequest(TOKEN));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ status: "degraded" });
  });

  it("tells an anonymous caller nothing about the infrastructure", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const body = await (
      await GET(new Request("https://app.example/api/health"))
    ).json();

    expect(body.status).toBe("ok");
    // Ein Uptime-Monitor braucht `status`. Ob und über welchen Weg ein
    // KI-Provider angebunden ist, geht ihn nichts an.
    expect(body.checks.openAiConfigured).toBeNull();
    expect(body.checks.openAiTransport).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ignores the deep flag without a token", async () => {
    vi.stubEnv("HEALTH_CHECK_TOKEN", TOKEN);
    vi.stubGlobal("fetch", vi.fn());

    const body = await (await GET(deepRequest())).json();

    // Sonst wäre die Route ein kostenloser Verstärker für Last gegen Supabase.
    expect(body.checks.supabaseReachable).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ignores a wrong token", async () => {
    vi.stubEnv("HEALTH_CHECK_TOKEN", TOKEN);
    vi.stubGlobal("fetch", vi.fn());

    const body = await (await GET(deepRequest("falsch"))).json();

    expect(body.checks.supabaseReachable).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stays closed when no token is configured at all", async () => {
    vi.stubEnv("HEALTH_CHECK_TOKEN", "");
    vi.stubGlobal("fetch", vi.fn());

    const body = await (await GET(deepRequest("irgendwas"))).json();

    // Fail closed: "kein Token konfiguriert" darf nicht "jeder darf" heißen.
    expect(body.checks.supabaseReachable).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a token too short to be a secret", async () => {
    vi.stubEnv("HEALTH_CHECK_TOKEN", "kurz");
    vi.stubGlobal("fetch", vi.fn());

    const body = await (await GET(deepRequest("kurz"))).json();

    expect(body.checks.supabaseReachable).toBeNull();
  });
});
