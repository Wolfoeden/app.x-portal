import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  reserveAiQuota: vi.fn(),
  recordAiUsage: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("@/lib/ai/quota", () => ({
  reserveAiQuota: mocks.reserveAiQuota,
  recordAiUsage: mocks.recordAiUsage,
  XPORTAL_AI_CREDIT_POLICY_VERSION: "test-credit-policy",
  nanoUsdToCeilingCents: (value: string | null) =>
    value === null ? 0 : Number((BigInt(value) + 9_999_999n) / 10_000_000n),
}));

vi.mock("@/lib/security/request", () => ({
  logEvent: mocks.logEvent,
}));

import { executeTrackedAiRequest } from "@/lib/ai/gateway";

const reservedCredits = { total: 500, used: 10, reserved: 20, remaining: 470 };
const settledCredits = { total: 500, used: 12, reserved: 0, remaining: 488 };

function baseInput() {
  return {
    requestKey: "request-key-123456",
    interactionId: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    userHash: "user-hmac-12345678",
    ipHash: "ip-hmac-1234567890",
    isAnonymous: true,
    purpose: "project_brief",
    requestedModel: "gpt-5.6-luna",
    estimatedInputTokens: 1_000,
    estimatedOutputTokens: 200,
  };
}

beforeEach(() => {
  mocks.reserveAiQuota.mockReset();
  mocks.recordAiUsage.mockReset();
  mocks.logEvent.mockReset();
  mocks.reserveAiQuota.mockResolvedValue({
    allowed: true,
    reason: "reserved",
    retryAfterSeconds: null,
    reservationId: "33333333-3333-4333-8333-333333333333",
    credits: reservedCredits,
  });
  mocks.recordAiUsage.mockResolvedValue(settledCredits);
});

describe("executeTrackedAiRequest", () => {
  it("reserves before the provider and settles actual cached usage", async () => {
    const operation = vi.fn().mockResolvedValue({
      value: "ok",
      outcome: "succeeded" as const,
      usage: {
        requestedModel: "gpt-5.6-luna",
        actualModel: "gpt-5.6-luna",
        providerResponseId: "resp_123",
        inputTokens: 100,
        cachedInputTokens: 40,
        cacheWriteTokens: 10,
        outputTokens: 20,
        totalTokens: 120,
      },
    });

    const result = await executeTrackedAiRequest({
      ...baseInput(),
      operation,
    });

    expect(mocks.reserveAiQuota).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledWith(true);
    expect(mocks.recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        actualModel: "gpt-5.6-luna",
        providerResponseId: "resp_123",
        inputTokens: 100,
        cachedInputTokens: 40,
        outputTokens: 20,
        totalTokens: 120,
        actualCostNanoUsd: "37300",
        outcome: "succeeded",
      }),
    );
    expect(result.value).toBe("ok");
    expect(result.credits).toEqual(settledCredits);
  });

  it("debits the customer balance from real usage, not from the estimate", async () => {
    const operation = vi.fn().mockResolvedValue({
      value: "ok",
      outcome: "succeeded" as const,
      usage: {
        requestedModel: "gpt-5.6-luna",
        actualModel: "gpt-5.6-luna",
        providerResponseId: "resp_123",
        inputTokens: 100,
        cachedInputTokens: 40,
        cacheWriteTokens: 10,
        outputTokens: 20,
        totalTokens: 120,
      },
    });

    await executeTrackedAiRequest({
      ...baseInput(),
      creditReservationTokens: { inputTokens: 1_000, outputTokens: 250 },
      operation,
    });

    // Hold: (1,000 x 10) + (250 x 60) = 25,000 weighted units = 25 credits.
    expect(mocks.reserveAiQuota).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedCredits: 25 }),
    );
    // Charge: ((50 + 10) x 10) + (40 x 1) + (20 x 60) = 1,840 units = 2 credits.
    expect(mocks.recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ actualCredits: 2 }),
    );
  });

  it("sizes the hold from the provider-safety estimate when none is given", async () => {
    const operation = vi.fn().mockResolvedValue({
      value: "ok",
      outcome: "succeeded" as const,
      usage: {
        requestedModel: "gpt-5.6-luna",
        actualModel: "gpt-5.6-luna",
        providerResponseId: "resp_123",
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 20,
        totalTokens: 120,
      },
    });

    await executeTrackedAiRequest({ ...baseInput(), operation });

    // Falls back to estimatedInputTokens/estimatedOutputTokens:
    // (1,000 x 10) + (200 x 60) = 22,000 weighted units = 22 credits.
    expect(mocks.reserveAiQuota).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedCredits: 22 }),
    );
  });

  it("holds credits so an exhausted balance can deny the provider call", async () => {
    mocks.reserveAiQuota.mockResolvedValue({
      allowed: false,
      reason: "insufficient_credits",
      retryAfterSeconds: null,
      reservationId: null,
      credits: { total: 105, used: 100, reserved: 0, remaining: 5 },
    });
    const operation = vi.fn().mockResolvedValue({
      value: "deterministic-fallback",
      outcome: "succeeded" as const,
    });

    const result = await executeTrackedAiRequest({
      ...baseInput(),
      creditReservationTokens: { inputTokens: 1_000, outputTokens: 250 },
      operation,
    });

    // A non-zero hold is what makes the balance able to gate at all; with the
    // previous hardcoded 0 the RPC predicate was always satisfied.
    expect(mocks.reserveAiQuota).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedCredits: 25 }),
    );
    expect(operation).toHaveBeenCalledWith(false);
    expect(mocks.recordAiUsage).not.toHaveBeenCalled();
    expect(result.value).toBe("deterministic-fallback");
  });

  it("runs only the deterministic operation when quota or credits are denied", async () => {
    mocks.reserveAiQuota.mockResolvedValue({
      allowed: false,
      reason: "insufficient_credits",
      retryAfterSeconds: null,
      reservationId: null,
      credits: { total: 500, used: 500, reserved: 0, remaining: 0 },
    });
    const operation = vi.fn().mockResolvedValue({
      value: "fallback",
      outcome: "provider_error" as const,
    });

    const result = await executeTrackedAiRequest({
      ...baseInput(),
      operation,
    });

    expect(operation).toHaveBeenCalledWith(false);
    expect(mocks.recordAiUsage).not.toHaveBeenCalled();
    expect(result.value).toBe("fallback");
    expect(result.credits?.remaining).toBe(0);
  });

  it("releases the reservation only when the provider was definitely not attempted", async () => {
    const result = await executeTrackedAiRequest({
      ...baseInput(),
      operation: async () => ({
        value: "fallback",
        outcome: "provider_error",
        providerAttempted: false,
      }),
    });

    expect(mocks.recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 0,
        outputTokens: 0,
        actualCredits: 0,
        outcome: "provider_error",
      }),
    );
    expect(result.credits).toEqual(settledCredits);
  });

  it("keeps an attempted request reserved when provider usage is unavailable", async () => {
    const result = await executeTrackedAiRequest({
      ...baseInput(),
      operation: async () => ({
        value: "fallback",
        outcome: "timeout",
        providerAttempted: true,
      }),
    });

    expect(mocks.recordAiUsage).not.toHaveBeenCalled();
    expect(result.credits).toEqual(reservedCredits);
    expect(mocks.logEvent).toHaveBeenCalledWith(
      "ai_usage_pending_reconciliation",
      expect.objectContaining({
        requestKey: "request-key-123456",
        reason: "provider_usage_unavailable",
      }),
    );
  });

  it("releases an attempted request when the provider rejection definitely used zero tokens", async () => {
    const result = await executeTrackedAiRequest({
      ...baseInput(),
      operation: async () => ({
        value: "fallback",
        outcome: "provider_error",
        providerAttempted: true,
        providerUsageDefinitelyZero: true,
      }),
    });

    expect(mocks.recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 0,
        outputTokens: 0,
        actualCredits: 0,
        outcome: "provider_error",
      }),
    );
    expect(mocks.logEvent).not.toHaveBeenCalledWith(
      "ai_usage_pending_reconciliation",
      expect.anything(),
    );
    expect(result.credits).toEqual(settledCredits);
  });

  it("keeps the reservation when the operation throws after preflight", async () => {
    await expect(
      executeTrackedAiRequest({
        ...baseInput(),
        operation: async () => {
          throw new Error("provider transport failure");
        },
      }),
    ).rejects.toThrow("provider transport failure");

    expect(mocks.recordAiUsage).not.toHaveBeenCalled();
    expect(mocks.logEvent).toHaveBeenCalledWith(
      "ai_usage_pending_reconciliation",
      expect.objectContaining({ reason: "operation_threw" }),
    );
  });

  it("keeps malformed provider usage reserved for reconciliation", async () => {
    const result = await executeTrackedAiRequest({
      ...baseInput(),
      operation: async () => ({
        value: "fallback",
        outcome: "provider_error",
        providerAttempted: true,
        usage: {
          requestedModel: "gpt-5.6-luna",
          inputTokens: 2,
          cachedInputTokens: 3,
          outputTokens: 1,
        },
      }),
    });

    expect(mocks.recordAiUsage).not.toHaveBeenCalled();
    expect(result.credits).toEqual(reservedCredits);
    expect(mocks.logEvent).toHaveBeenCalledWith(
      "ai_usage_pending_reconciliation",
      expect.objectContaining({ reason: "provider_usage_invalid" }),
    );
  });

  it("stores usage with unknown cost when the exact response model is unknown", async () => {
    await executeTrackedAiRequest({
      ...baseInput(),
      operation: async () => ({
        value: "ok",
        outcome: "succeeded",
        usage: {
          requestedModel: "gpt-5.6-luna",
          actualModel: "future-model-without-pricing",
          inputTokens: 10,
          cachedInputTokens: 0,
          outputTokens: 2,
        },
      }),
    });

    expect(mocks.recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        actualModel: "future-model-without-pricing",
        actualCostNanoUsd: null,
        actualCostCents: null,
        pricingVersion: null,
      }),
    );
  });

  it("recomputes total tokens when provider totals are inconsistent", async () => {
    await executeTrackedAiRequest({
      ...baseInput(),
      operation: async () => ({
        value: "ok",
        outcome: "succeeded",
        usage: {
          requestedModel: "gpt-5.6-luna",
          inputTokens: 10,
          outputTokens: 2,
          totalTokens: 999,
        },
      }),
    });

    expect(mocks.recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ totalTokens: 12 }),
    );
    expect(mocks.logEvent).toHaveBeenCalledWith(
      "ai_usage_total_mismatch",
      { interactionId: "11111111-1111-4111-8111-111111111111" },
    );
  });

  it("keeps the result available while a failed settlement remains reserved", async () => {
    mocks.recordAiUsage.mockRejectedValue(new Error("database unavailable"));
    const result = await executeTrackedAiRequest({
      ...baseInput(),
      operation: async () => ({
        value: "ok",
        outcome: "succeeded",
        usage: {
          requestedModel: "gpt-5.6-luna",
          inputTokens: 10,
          outputTokens: 2,
        },
      }),
    });

    expect(result.value).toBe("ok");
    expect(result.credits).toEqual(reservedCredits);
    expect(mocks.logEvent).toHaveBeenCalledWith(
      "ai_usage_settlement_failed",
      expect.objectContaining({ requestKey: "request-key-123456" }),
    );
  });
});
