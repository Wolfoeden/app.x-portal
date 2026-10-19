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

/**
 * Projektanalyse und KI-Bewertung der Profile laufen als ein Vorgang.
 *
 * Der Kunde zahlt weiter den Festpreis der Projektanalyse und nur, wenn sie
 * das Modell geliefert hat; die Token der Bewertung kommen dann in denselben
 * Verbrauchseintrag, damit die Anbieterkosten vollständig erfasst sind.
 */
export function searchAnalysisResult<T extends { extraction: ExtractProjectBriefResult }>(
  value: T,
  rankingUsage: readonly {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
  }[],
): AiOperationResult<T> {
  const base = briefAnalysisResult(value.extraction);
  const usage = base.usage
    ? rankingUsage.reduce(
        (total, call) => ({
          ...total,
          inputTokens: total.inputTokens + call.inputTokens,
          cachedInputTokens: (total.cachedInputTokens ?? 0) + call.cachedInputTokens,
          outputTokens: total.outputTokens + call.outputTokens,
          totalTokens:
            total.totalTokens === undefined
              ? undefined
              : total.totalTokens + call.inputTokens + call.outputTokens,
        }),
        base.usage,
      )
    : undefined;
  return { ...base, value, usage };
}
