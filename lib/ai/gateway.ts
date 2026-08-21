import "server-only";

import {
  calculateCreditsConsumed,
  XPORTAL_AI_CREDIT_POLICY_VERSION,
} from "@/lib/ai/credit-policy";
import {
  calculateEstimatedProviderCost,
  type AiTokenUsage,
} from "@/lib/ai/model-pricing";
import {
  nanoUsdToCeilingCents,
  recordAiUsage,
  reserveAiQuota,
  type AiCreditSnapshot,
  type AiQuotaReservation,
  type AiUsageOutcome,
} from "@/lib/ai/quota";
import { logEvent } from "@/lib/security/request";

export type AiProviderUsage = AiTokenUsage & {
  requestedModel: string;
  actualModel?: string | null;
  providerResponseId?: string | null;
  totalTokens?: number;
};

export type AiOperationResult<T> = {
  value: T;
  outcome: AiUsageOutcome;
  /** Explicitly false only when the provider was definitely never called. */
  providerAttempted?: boolean;
  /** True only for a provider rejection known to have consumed zero tokens. */
  providerUsageDefinitelyZero?: boolean;
  usage?: AiProviderUsage;
};

export type TrackedAiResult<T> = {
  value: T;
  quota: AiQuotaReservation;
  credits: AiCreditSnapshot | null;
  /**
   * Credits this request consumed. Zero when the provider was never called or
   * definitely used no tokens, null when the charge is not yet known and the
   * reservation stays open for reconciliation.
   */
  creditsCharged: number | null;
};

export async function executeTrackedAiRequest<T>(input: {
  requestKey: string;
  interactionId: string;
  userId: string;
  userHash: string;
  ipHash: string;
  isAnonymous: boolean;
  isAdmin?: boolean;
  purpose: string;
  requestedModel: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  /**
   * Token figures used only to size the credit hold. Defaults to the
   * provider-safety estimate above, which is deliberately pessimistic.
   */
  creditReservationTokens?: { inputTokens: number; outputTokens: number };
  operation: (providerAllowed: boolean) => Promise<AiOperationResult<T>>;
}): Promise<TrackedAiResult<T>> {
  const estimatedCost = calculateEstimatedProviderCost({
    requestedModel: input.requestedModel,
    inputTokens: input.estimatedInputTokens,
    cachedInputTokens: 0,
    outputTokens: input.estimatedOutputTokens,
  });
  // The provider-safety estimate stays pessimistic on purpose. Holding that
  // many credits would deny requests the customer can still afford, so the
  // credit hold uses a realistic figure and settlement corrects it to actual
  // usage. The hold is released in full either way.
  const reservationTokens = input.creditReservationTokens ?? {
    inputTokens: input.estimatedInputTokens,
    outputTokens: input.estimatedOutputTokens,
  };
  const estimatedCredits = calculateCreditsConsumed({
    requestedModel: input.requestedModel,
    purpose: input.purpose,
    inputTokens: reservationTokens.inputTokens,
    cachedInputTokens: 0,
    outputTokens: reservationTokens.outputTokens,
  }).creditsConsumed;

  const quota = await reserveAiQuota({
    requestKey: input.requestKey,
    userId: input.userId,
    interactionId: input.interactionId,
    userHash: input.userHash,
    ipHash: input.ipHash,
    isAnonymous: input.isAnonymous,
    isAdmin: input.isAdmin,
    requestedModel: input.requestedModel,
    purpose: input.purpose,
    estimatedInputTokens: input.estimatedInputTokens,
    estimatedOutputTokens: input.estimatedOutputTokens,
    estimatedCredits,
    estimatedCostNanoUsd: estimatedCost.estimatedCostNanoUsd,
    pricingVersion: estimatedCost.pricingVersion,
    creditPolicyVersion: XPORTAL_AI_CREDIT_POLICY_VERSION,
  });

  let operationResult: AiOperationResult<T>;
  try {
    operationResult = await input.operation(quota.allowed);
  } catch (error) {
    if (quota.allowed) {
      logPendingReconciliation(input, "operation_threw");
    }
    throw error;
  }

  if (!quota.allowed) {
    return {
      value: operationResult.value,
      quota,
      credits: quota.credits,
      creditsCharged: null,
    };
  }

  const usage = operationResult.usage;
  if (!usage) {
    if (
      operationResult.providerAttempted === false ||
      operationResult.providerUsageDefinitelyZero === true
    ) {
      const releasedCredits = await settleWithoutUsage(
        input.requestKey,
        operationResult.outcome,
      );
      return {
        value: operationResult.value,
        quota,
        credits: releasedCredits ?? quota.credits,
        creditsCharged: 0,
      };
    }

    logPendingReconciliation(input, "provider_usage_unavailable");
    return {
      value: operationResult.value,
      quota,
      credits: quota.credits,
      creditsCharged: null,
    };
  }

  let actualCost: ReturnType<typeof calculateEstimatedProviderCost>;
  try {
    actualCost = calculateEstimatedProviderCost({
      requestedModel: usage.requestedModel,
      actualModel: usage.actualModel,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens ?? 0,
      cacheWriteTokens: usage.cacheWriteTokens ?? 0,
      outputTokens: usage.outputTokens,
    });
  } catch {
    logPendingReconciliation(input, "provider_usage_invalid");
    return {
      value: operationResult.value,
      quota,
      credits: quota.credits,
      creditsCharged: null,
    };
  }
  const computedTotalTokens = usage.inputTokens + usage.outputTokens;
  const reportedTotalTokens = usage?.totalTokens;
  if (
    reportedTotalTokens !== undefined &&
    reportedTotalTokens !== computedTotalTokens
  ) {
    logEvent("ai_usage_total_mismatch", {
      interactionId: input.interactionId,
    });
  }

  // The customer balance is debited from real provider usage, never from the
  // preflight estimate.
  const creditsCharged = calculateCreditsConsumed({
    requestedModel: usage.requestedModel,
    actualModel: usage.actualModel,
    purpose: input.purpose,
    inputTokens: actualCost.usage.inputTokens,
    cachedInputTokens: actualCost.usage.cachedInputTokens,
    cacheWriteTokens: actualCost.usage.cacheWriteTokens,
    outputTokens: actualCost.usage.outputTokens,
  }).creditsConsumed;

  let settledCredits = quota.credits;
  try {
    settledCredits = await recordAiUsage({
      requestKey: input.requestKey,
      actualModel: usage?.actualModel?.trim() || null,
      providerResponseId: usage?.providerResponseId?.trim() || null,
      inputTokens: actualCost.usage.inputTokens,
      cachedInputTokens: actualCost.usage.cachedInputTokens,
      outputTokens: actualCost.usage.outputTokens,
      totalTokens: computedTotalTokens,
      actualCostNanoUsd: actualCost.estimatedCostNanoUsd,
      actualCredits: creditsCharged,
      actualCostCents:
        actualCost.estimatedCostNanoUsd === null
          ? null
          : nanoUsdToCeilingCents(actualCost.estimatedCostNanoUsd),
      pricingVersion: actualCost.pricingVersion,
      creditPolicyVersion: XPORTAL_AI_CREDIT_POLICY_VERSION,
      outcome: operationResult.outcome,
    });
  } catch {
    // The reservation deliberately remains fail-closed for operator
    // reconciliation; the project result itself stays available to the user.
    logEvent("ai_usage_settlement_failed", {
      interactionId: input.interactionId,
      requestKey: input.requestKey,
    });
  }

  return {
    value: operationResult.value,
    quota,
    credits: settledCredits,
    creditsCharged,
  };
}

async function settleWithoutUsage(
  requestKey: string,
  outcome: AiUsageOutcome,
): Promise<AiCreditSnapshot | null> {
  try {
    return await recordAiUsage({
      requestKey,
      actualModel: null,
      providerResponseId: null,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      actualCostNanoUsd: "0",
      actualCredits: 0,
      actualCostCents: 0,
      pricingVersion: null,
      creditPolicyVersion: XPORTAL_AI_CREDIT_POLICY_VERSION,
      outcome,
    });
  } catch {
    logEvent("ai_usage_settlement_failed", { requestKey });
    return null;
  }
}

function logPendingReconciliation(
  input: Pick<
    Parameters<typeof executeTrackedAiRequest>[0],
    "interactionId" | "requestKey"
  >,
  reason: string,
): void {
  logEvent("ai_usage_pending_reconciliation", {
    interactionId: input.interactionId,
    requestKey: input.requestKey,
    reason,
  });
}
