import "server-only";

import { createHash } from "node:crypto";

import { LEADGEN_OUTREACH_CREDITS } from "@/lib/ai/credit-policy";
import { executeTrackedAiRequest } from "@/lib/ai/gateway";
import type { AiCreditSnapshot } from "@/lib/ai/quota";
import {
  draftLeadOutreach,
  estimateLeadgenTokenCeiling,
  type LeadgenDraft,
  type LeadgenResponsesClient,
} from "@/lib/openai/leadgen-outreach";

import { saveOutreachDraft, type Lead } from "./leads-data";

/**
 * Der Entwurf als Vorgang, nicht als Route.
 *
 * Zwei Wege führen hierher: der Knopf „Entwurf erzeugen" an der einzelnen
 * Zeile und der Stapelversand, der für jeden Lead ohne Entwurf einen braucht.
 * Beide müssen dieselbe Reservierung, dieselbe Abrechnung und dasselbe
 * Verhalten im Fehlerfall haben — deshalb steht das hier und nicht zweimal in
 * je einer Route.
 */

export type DraftOutcome =
  | {
      status: "created";
      draft: LeadgenDraft;
      mode: "openai" | "fallback";
      model: string | null;
      creditsCharged: number | null;
      credits: AiCreditSnapshot | null;
    }
  | {
      status: "quota_denied";
      reason: string;
      retryAfterSeconds: number | null;
      credits: AiCreditSnapshot | null;
    };

/**
 * Der Anfrageschlüssel bindet die Reservierung an genau diesen Versuch.
 *
 * `requestId` kommt vom Aufrufer: derselbe Knopfdruck, der wegen einer
 * verlorenen Antwort wiederholt wird, trifft dieselbe Reservierung und zahlt
 * nicht zweimal. Ein neuer Knopfdruck bringt eine neue Kennung mit.
 */
function buildRequestKey(input: {
  adminId: string;
  leadId: number;
  requestId: string;
}): string {
  return createHash("sha256")
    .update(`${input.adminId}:${input.leadId}:leadgen_outreach:${input.requestId}`)
    .digest("hex");
}

/**
 * `consume_ai_quota` erwartet eine UUID. Der rohe Hash ist keine — dieselbe
 * Umformung wie in app/api/freelancer-search/route.ts.
 */
function interactionIdFromRequestKey(requestKey: string): string {
  const value = requestKey.slice(0, 32);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export async function createDraftForLead(input: {
  lead: Lead;
  adminId: string;
  isAnonymous: boolean;
  isAdmin: boolean;
  userHash: string;
  ipHash: string;
  requestId: string;
  /** Nur für Tests: ersetzt den Anbieteraufruf. */
  responsesClient?: LeadgenResponsesClient;
}): Promise<DraftOutcome> {
  const estimate = estimateLeadgenTokenCeiling({
    stellenanzeige: input.lead.stellenanzeige,
    company: input.lead.company,
    recipientName: input.lead.recipient_name,
  });
  const requestKey = buildRequestKey({
    adminId: input.adminId,
    leadId: input.lead.id,
    requestId: input.requestId,
  });

  const tracked = await executeTrackedAiRequest({
    requestKey,
    interactionId: interactionIdFromRequestKey(requestKey),
    userId: input.adminId,
    userHash: input.userHash,
    ipHash: input.ipHash,
    isAnonymous: input.isAnonymous,
    isAdmin: input.isAdmin,
    purpose: "leadgen_outreach",
    requestedModel: estimate.model,
    estimatedInputTokens: estimate.inputTokens,
    estimatedOutputTokens: estimate.outputTokens,
    operation: async (providerAllowed) => {
      const result = await draftLeadOutreach({
        stellenanzeige: input.lead.stellenanzeige,
        company: input.lead.company,
        recipientName: input.lead.recipient_name,
        safetyIdentifier: input.userHash,
        allowProvider: providerAllowed,
        responsesClient: input.responsesClient,
      });

      // Verwertbar heißt: der Anbieter hat geantwortet, die Antwort ist
      // zuordenbar und die Tokenzahlen sind Zahlen. Fehlt davon etwas, wird
      // die Reservierung vollständig freigegeben — ein Entwurf, der aus dem
      // Notfalltext besteht, hat den Anbieter nicht gekostet.
      const usable =
        result.mode === "openai" &&
        Boolean(result.provider?.responseId?.trim()) &&
        Boolean(result.provider?.model?.trim()) &&
        Number.isSafeInteger(result.provider?.inputTokens) &&
        Number.isSafeInteger(result.provider?.outputTokens);

      return {
        value: result,
        providerAttempted: result.providerAttempted,
        providerUsageDefinitelyZero: !usable,
        outcome: usable
          ? ("succeeded" as const)
          : result.fallbackReason === "provider_timeout"
            ? ("timeout" as const)
            : result.providerAttempted
              ? ("provider_error" as const)
              : ("succeeded" as const),
        usage: usable
          ? {
              requestedModel: result.provider!.requestedModel,
              actualModel: result.provider!.model,
              providerResponseId: result.provider!.responseId,
              inputTokens: result.provider!.inputTokens ?? 0,
              cachedInputTokens: result.provider!.cachedInputTokens ?? 0,
              cacheWriteTokens: result.provider!.cacheWriteTokens ?? 0,
              outputTokens: result.provider!.outputTokens ?? 0,
              totalTokens: result.provider!.totalTokens,
            }
          : undefined,
      };
    },
  });

  if (!tracked.quota.allowed) {
    return {
      status: "quota_denied",
      reason: tracked.quota.reason,
      retryAfterSeconds: tracked.quota.retryAfterSeconds,
      credits: tracked.credits,
    };
  }

  const result = tracked.value;
  await saveOutreachDraft({
    leadId: input.lead.id,
    subject: result.draft.subject,
    body: result.draft.body,
    model: result.mode === "openai" ? (result.provider?.model ?? null) : null,
    credits: tracked.creditsCharged,
    createdBy: input.adminId,
  });

  return {
    status: "created",
    draft: result.draft,
    mode: result.mode,
    model: result.provider?.model ?? null,
    creditsCharged: tracked.creditsCharged,
    credits: tracked.credits,
  };
}

export { LEADGEN_OUTREACH_CREDITS };
