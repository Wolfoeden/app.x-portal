import "server-only";

import type { AiOperationResult } from "@/lib/ai/gateway";

import type { ExtractProjectBriefResult } from "./brief";

/**
 * Wie eine Projektanalyse abgerechnet wird.
 *
 * Nur eine Analyse, die das Modell tatsächlich geliefert hat, kostet Credits.
 * Fällt es aus (Zeitüberschreitung, Fehler, unbrauchbare Antwort), läuft die
 * Basisanalyse, und die Reservierung wird vollständig freigegeben, wie bei
 * der externen Recherche. Vorher zahlte der Kunde für den Ausfall und für
 * jeden Korrekturversuch danach noch einmal (Audit F01: 3 Credits je Versuch).
 */
export function briefAnalysisResult(
  extraction: ExtractProjectBriefResult,
): AiOperationResult<ExtractProjectBriefResult> {
  const provider = extraction.provider;
  const billable = extraction.mode === "openai";
  return {
    value: extraction,
    providerAttempted: extraction.providerAttempted,
    providerUsageDefinitelyZero: !billable,
    outcome: billable
      ? "succeeded"
      : extraction.fallbackReason === "provider_timeout"
        ? "timeout"
        : "provider_error",
    usage:
      billable &&
      provider &&
      Number.isSafeInteger(provider.inputTokens) &&
      Number.isSafeInteger(provider.outputTokens)
        ? {
            requestedModel: provider.requestedModel,
            actualModel: provider.model,
            providerResponseId: provider.responseId,
            inputTokens: provider.inputTokens!,
            cachedInputTokens: provider.cachedInputTokens ?? 0,
            cacheWriteTokens: provider.cacheWriteTokens ?? 0,
            outputTokens: provider.outputTokens!,
            totalTokens: provider.totalTokens,
          }
        : undefined,
  };
}
