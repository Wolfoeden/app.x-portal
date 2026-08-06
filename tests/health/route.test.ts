import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/env", () => ({
  getSupabasePublicEnv: () => ({
    url: "https://example.supabase.co",
    publishableKey: "test-publishable-key",
  }),
}));

import { GET } from "@/app/api/health/route";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("health route", () => {
  it("authenticates the deep Supabase health request with the public key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("https://app.example/api/health?deep=1"),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/auth/v1/health",
      expect.objectContaining({
        cache: "no-store",
        headers: { apikey: "test-publishable-key" },
      }),
    );
  });

  it("fails closed when the upstream health check is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    const response = await GET(
      new Request("https://app.example/api/health?deep=1"),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ status: "degraded" });
  });
});
