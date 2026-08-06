import { beforeEach, describe, expect, it } from "vitest";

import {
  resetRateLimitsForTests,
  takeRateLimit,
} from "@/lib/security/rate-limit";

describe("fixed-window rate limiter", () => {
  beforeEach(resetRateLimitsForTests);

  it("fails closed after the configured request count", () => {
    expect(takeRateLimit("user:a", 2, 60_000, 1_000).allowed).toBe(true);
    expect(takeRateLimit("user:a", 2, 60_000, 1_001).allowed).toBe(true);
    const denied = takeRateLimit("user:a", 2, 60_000, 1_002);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(60);
  });

  it("isolates keys and resets the expired window", () => {
    takeRateLimit("ip:a", 1, 100, 1_000);
    expect(takeRateLimit("ip:b", 1, 100, 1_001).allowed).toBe(true);
    expect(takeRateLimit("ip:a", 1, 100, 1_101).allowed).toBe(true);
  });

  it("fails closed instead of growing memory without a bound", () => {
    for (let index = 0; index < 10_000; index += 1) {
      expect(
        takeRateLimit(`attacker:${index}`, 1, 60_000, 1_000).allowed,
      ).toBe(true);
    }

    const denied = takeRateLimit("attacker:overflow", 1, 60_000, 1_001);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(60);
  });
});
