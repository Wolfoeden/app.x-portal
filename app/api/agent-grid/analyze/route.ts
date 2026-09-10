import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AgentGridAnalysisInputSchema,
  type AgentGridAnalysisResponse,
} from "@/lib/agent-grid/blueprint";
import {
  AGENT_GRID_MODEL,
  analyzeProcessWithAi,
  estimateAgentGridTokens,
  type AgentGridProviderOutcome,
} from "@/lib/agent-grid/ai";
import { executeTrackedAiRequest } from "@/lib/ai/gateway";
import { requireAdminUser } from "@/lib/auth/current-user";
import {
  createChatRequestKey,
  interactionIdForChatRequest,
} from "@/lib/domain/chat-idempotency";
import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
  pseudonymizeSubject,
  readJsonWithLimit,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function failureResponse(
  outcome: Extract<AgentGridProviderOutcome, { ok: false }>,
  traceId: string,
): Response {
  if (outcome.code === "budget_blocked") {
    return NextResponse.json(
      {
        error: "Die AI-Analyse ist durch das aktuelle Nutzungslimit blockiert.",
        code: outcome.code,
        traceId,
      },
      { status: 429, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (outcome.code === "provider_unconfigured") {
    return NextResponse.json(
      {
        error: "OpenAI ist serverseitig noch nicht konfiguriert.",
        code: outcome.code,
        traceId,
      },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (outcome.code === "invalid_output") {
    return NextResponse.json(
      {
        error:
          "Die Analyse war nicht valide. Ihre Eingaben bleiben erhalten; bitte erneut analysieren.",
        code: outcome.code,
        traceId,
      },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return NextResponse.json(
    {
      error:
        outcome.code === "provider_timeout"
          ? "Die Analyse hat zu lange gedauert. Ihre Eingaben bleiben erhalten."
          : "Die Prozessanalyse ist gerade nicht verfügbar. Ihre Eingaben bleiben erhalten.",
      code: outcome.code,
      traceId,
    },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);
    const input = AgentGridAnalysisInputSchema.parse(
      await readJsonWithLimit(request, 96_000),
    );
    const user = await requireAdminUser();
    const userHash = pseudonymizeSubject(`user:${user.id}`);
    const ipHash = pseudonymizeIp(getClientIp(request));
    const rateLimit = await consumeRateLimit(`agent-grid:${userHash}`, 8);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Zu viele Analysen in kurzer Zeit.",
          code: "rate_limited",
          traceId,
        },
        {
          status: 429,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    const requestKey = createChatRequestKey(
      user.id,
      input.requestId,
      `agent-grid-${input.mode}`,
    );
    const estimate = estimateAgentGridTokens(input);
    const tracked = await executeTrackedAiRequest<AgentGridProviderOutcome>({
      requestKey,
      interactionId: interactionIdForChatRequest(requestKey),
      userId: user.id,
      userHash,
      ipHash,
      isAnonymous: false,
      isAdmin: true,
      purpose: "analysis",
      requestedModel: AGENT_GRID_MODEL,
      estimatedInputTokens: estimate.inputTokens,
      estimatedOutputTokens: estimate.outputTokens,
      creditReservationTokens: {
        inputTokens: estimate.inputTokens,
        outputTokens: estimate.expectedOutputTokens,
      },
      operation: async (providerAllowed) => {
        const outcome = await analyzeProcessWithAi(
          input,
          userHash,
          providerAllowed,
        );
        return {
          value: outcome,
          outcome: outcome.ok
            ? ("succeeded" as const)
            : outcome.code === "provider_timeout"
              ? ("timeout" as const)
              : ("provider_error" as const),
          providerAttempted: outcome.providerAttempted,
          providerUsageDefinitelyZero: outcome.ok
            ? false
            : outcome.providerUsageDefinitelyZero,
          usage: outcome.usage
            ? {
                requestedModel: outcome.usage.requestedModel,
                actualModel: outcome.usage.actualModel,
                providerResponseId: outcome.usage.providerResponseId,
                inputTokens: outcome.usage.inputTokens,
                cachedInputTokens: outcome.usage.cachedInputTokens,
                cacheWriteTokens: outcome.usage.cacheWriteTokens,
                outputTokens: outcome.usage.outputTokens,
                totalTokens: outcome.usage.totalTokens,
              }
            : undefined,
        };
      },
    });

    if (!tracked.value.ok) return failureResponse(tracked.value, traceId);
    const response: AgentGridAnalysisResponse = tracked.value.value;
    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Die Anfrage hat ein ungültiges Format.",
          code: "invalid_request",
          traceId,
        },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return NextResponse.json(
      {
        error: "Die Prozessanalyse ist gerade nicht verfügbar.",
        code: "analysis_unavailable",
        traceId,
      },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
