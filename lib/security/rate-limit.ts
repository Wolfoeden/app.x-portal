type WindowEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

const globalRateLimitState = globalThis as typeof globalThis & {
  __xPortalRateLimits?: Map<string, WindowEntry>;
};

const buckets =
  globalRateLimitState.__xPortalRateLimits ?? new Map<string, WindowEntry>();
globalRateLimitState.__xPortalRateLimits = buckets;
const MAX_BUCKETS = 10_000;

export function takeRateLimit(
  key: string,
  limit: number,
  windowMilliseconds = 60_000,
  now = Date.now(),
): RateLimitDecision {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Rate limit must be a positive integer.");
  }

  if (buckets.size >= MAX_BUCKETS) {
    for (const [bucketKey, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    if (!current && buckets.size >= MAX_BUCKETS) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil(windowMilliseconds / 1_000)),
      };
    }
    buckets.set(key, { count: 1, resetAt: now + windowMilliseconds });
    return {
      allowed: true,
      remaining: limit - 1,
      retryAfterSeconds: 0,
    };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
    };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: limit - current.count,
    retryAfterSeconds: 0,
  };
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
}
