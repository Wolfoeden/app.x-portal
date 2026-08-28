import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

import { resetRateLimitsForTests } from "@/lib/security/rate-limit";
import {
  consumeRateLimit,
  resetSharedRateLimitStateForTests,
} from "@/lib/security/shared-rate-limit";

function allow(remaining: number) {
  return {
    data: [{ allowed: true, remaining, retry_after_seconds: 0 }],
    error: null,
  };
}

function deny(retryAfterSeconds: number) {
  return {
    data: [
      { allowed: false, remaining: 0, retry_after_seconds: retryAfterSeconds },
    ],
    error: null,
  };
}

describe("shared rate limiter", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
    resetSharedRateLimitStateForTests();
    mocks.rpc.mockReset();
  });

  it("denies when the shared counter says so, even on a fresh instance", async () => {
    // Das ist der ganze Punkt des Umbaus: Der lokale Zähler dieser Instanz ist
    // leer, weil die vorherigen Anfragen woanders gelandet sind.
    mocks.rpc.mockResolvedValue(deny(42));

    const decision = await consumeRateLimit("user:a", 5, 60_000);

    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBe(42);
  });

  it("passes the window to the database in seconds", async () => {
    mocks.rpc.mockResolvedValue(allow(4));

    await consumeRateLimit("user:a", 5, 15 * 60_000);

    expect(mocks.rpc).toHaveBeenCalledWith("consume_rate_limit", {
      p_key: "user:a",
      p_limit: 5,
      p_window_seconds: 900,
    });
  });

  it("does not ask the database once the local counter is exhausted", async () => {
    mocks.rpc.mockResolvedValue(allow(0));

    expect((await consumeRateLimit("user:b", 1, 60_000)).allowed).toBe(true);
    mocks.rpc.mockClear();

    const denied = await consumeRateLimit("user:b", 1, 60_000);

    expect(denied.allowed).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps the local decision when the shared counter is unreachable", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "relation does not exist" },
    });

    // Schlechter als der gemeinsame Zähler, aber nicht offen: das lokale
    // Limit greift weiter, damit ein Datenbankausfall die Bremse nicht löst.
    expect((await consumeRateLimit("user:c", 2, 60_000)).allowed).toBe(true);
    expect((await consumeRateLimit("user:c", 2, 60_000)).allowed).toBe(true);
    expect((await consumeRateLimit("user:c", 2, 60_000)).allowed).toBe(false);
  });

  it("keeps the local decision when the client itself throws", async () => {
    mocks.rpc.mockRejectedValue(new Error("no service role key"));

    expect((await consumeRateLimit("user:d", 1, 60_000)).allowed).toBe(true);
    expect((await consumeRateLimit("user:d", 1, 60_000)).allowed).toBe(false);
  });

  it("treats a malformed answer as an outage rather than an approval", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ remaining: 5 }], error: null });

    const decision = await consumeRateLimit("user:e", 1, 60_000);

    expect(decision.allowed).toBe(true); // lokal noch erlaubt
    expect((await consumeRateLimit("user:e", 1, 60_000)).allowed).toBe(false);
  });

  it("condenses a key that would not fit the column instead of truncating it", async () => {
    mocks.rpc.mockResolvedValue(allow(1));

    await consumeRateLimit(`long:${"x".repeat(400)}`, 2, 60_000);

    const key = mocks.rpc.mock.calls[0][1].p_key as string;
    // Abschneiden würde zwei verschiedene Absender auf denselben Zähler werfen.
    expect(key).toMatch(/^h:[0-9a-f]{64}$/u);
    expect(key.length).toBeLessThanOrEqual(200);
  });

  it("never reports more headroom than the limit allows", async () => {
    mocks.rpc.mockResolvedValue(allow(9_000));

    expect((await consumeRateLimit("user:f", 5, 60_000)).remaining).toBe(5);
  });

  it("always gives a denial a usable Retry-After", async () => {
    mocks.rpc.mockResolvedValue(deny(0));

    expect((await consumeRateLimit("user:g", 5, 60_000)).retryAfterSeconds).toBe(
      1,
    );
  });
});
