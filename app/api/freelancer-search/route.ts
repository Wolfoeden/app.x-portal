import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { executeTrackedAiRequest } from "@/lib/ai/gateway";
import { actualSearchCost } from "@/lib/ai/search-cost";
import {
  EXTERNAL_FREELANCER_SEARCH_CREDITS,
  PRODUCT_CREDIT_EURO_PER_UNIT,
  completeExternalSearch,
  getExternalSearchResult,
  getProductCreditSnapshot,
  reserveProductCredits,
  settleProductCredits,
  type ProductCreditSnapshot,
} from "@/lib/ai/product-entitlements";
import { writeAuditEvent } from "@/lib/audit/write";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { fetchActiveBookableRealProfiles } from "@/lib/data/freelancers";
import type { ProjectRow } from "@/lib/data/projects";
import { buildShortlist, ProjectBriefSchema } from "@/lib/domain";
import {
  estimateExternalSearchTokenCeiling,
  searchExternalFreelancers,
  type ExternalFreelancerCandidate,
} from "@/lib/openai/external-freelancer-search";
import { takeRateLimit } from "@/lib/security/rate-limit";
import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
  pseudonymizeSubject,
  readJsonWithLimit,
} from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PostgresUuidSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);

const InputSchema = z
  .object({
    // Older deterministic project IDs are valid PostgreSQL UUIDs even when
    // their RFC version bits were not normalized.
    projectId: PostgresUuidSchema,
    requestId: z.string().trim().min(8).max(160),
  })
  .strict();

function interactionIdFromRequestKey(requestKey: string): string {
  const value = requestKey.slice(0, 32);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

const EXTERNAL_RESULT_DISCLOSURE =
  "Externe Webtreffer sind nicht von XPORTAL geprüft. Angaben und Verfügbarkeit müssen vor der Buchung auf den verlinkten Quellen kontrolliert werden.";

function completedSearchResponse(input: {
  projectId: string;
  candidates: ExternalFreelancerCandidate[];
  productCredits: ProductCreditSnapshot;
  replayed?: boolean;
  retryAfterSeconds?: number | null;
}): Response {
  const consultedSourceCount = new Set(
    input.candidates.flatMap((candidate) => candidate.sourceUrls),
  ).size;
  return NextResponse.json(
    {
      projectId: input.projectId,
      candidates: input.candidates,
      disclosure: EXTERNAL_RESULT_DISCLOSURE,
      mode: "openai",
      notice: input.replayed
        ? "Die bereits bezahlte Internetsuche wurde ohne neue Belastung wiederhergestellt."
        : undefined,
      searchTrace: {
        queries: [],
        consultedSourceCount,
        returnedCandidateCount: input.candidates.length,
      },
      quota: { retryAfterSeconds: input.retryAfterSeconds ?? null },
      price: {
        credits: EXTERNAL_FREELANCER_SEARCH_CREDITS,
        eur: "0.50",
        charged: true,
      },
      productCredits: {
        ...input.productCredits,
        euroPerCredit: PRODUCT_CREDIT_EURO_PER_UNIT,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function errorResponse(error: unknown, traceId: string): Response {
  if (error instanceof Response) return error;
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "Die Suchanfrage hat ein ungültiges Format.", traceId },
      { status: 400 },
    );
  }
  return NextResponse.json(
    {
      error: "Die externe Suche ist gerade nicht verfügbar.",
      traceId,
    },
    { status: 503 },
  );
}

async function ownedProjectWithBrief(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  projectId: string,
  userId: string,
): Promise<{ project: ProjectRow; brief: z.infer<typeof ProjectBriefSchema> }> {
  const { data, error } = await admin
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Response("Projekt nicht gefunden.", { status: 404 });
  if (data.brief_status === "pending") {
    throw new Response(
      "Die Projektanalyse ist noch nicht abgeschlossen.",
      { status: 409 },
    );
  }
  const brief = ProjectBriefSchema.safeParse(data.structured_brief);
  if (!brief.success) {
    throw new Response("Das Projekt enthält noch keine gültige Analyse.", {
      status: 409,
    });
  }
  return { project: data as ProjectRow, brief: brief.data };
}

export async function POST(request: Request) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);
    const input = InputSchema.parse(await readJsonWithLimit(request, 2_000));
    const user = await requireCurrentUser();
    if (user.isAnonymous) {
      return NextResponse.json(
        {
          error:
            "Bitte melden Sie sich an, bevor Sie eine kostenpflichtige Internetsuche starten.",
          code: "account_required",
          traceId,
        },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      throw new Response(
        "Die serverseitige Supabase-Konfiguration ist unvollständig.",
        { status: 503 },
      );
    }
    const admin = createAdminSupabaseClient();
    const requestKey = createHash("sha256")
      .update(`${user.id}:${input.projectId}:external:${input.requestId}`)
      .digest("hex");
    // Recover a paid result before applying new-search limits or re-evaluating
    // the current internal catalog. This path never calls OpenAI or debits
    // credits and remains owner-bound inside the RPC.
    const existingResult = await getExternalSearchResult({
      userId: user.id,
      projectId: input.projectId,
      requestKey,
    });
    if (existingResult) {
      const currentCredits = await getProductCreditSnapshot(user.id);
      await writeAuditEvent({
        actorUserId: user.id,
        action: "external_freelancer_search_result_replayed",
        targetType: "project",
        targetId: input.projectId,
        outcome: "success",
        traceId,
      });
      return completedSearchResponse({
        projectId: input.projectId,
        candidates: existingResult.candidates,
        productCredits: currentCredits,
        replayed: true,
      });
    }
    const ipAddress = getClientIp(request);
    const userHash = pseudonymizeSubject(`user:${user.id}`);
    const ipHash = pseudonymizeIp(ipAddress);
    const perMinute = Math.max(
      1,
      Number.parseInt(process.env.AI_WEB_SEARCH_REQUESTS_PER_MINUTE ?? "2", 10) || 2,
    );
    const userLimit = takeRateLimit(
      `web-search-user:${userHash}`,
      perMinute,
      60_000,
    );
    const ipLimit = takeRateLimit(
      `web-search-ip:${ipHash}`,
      perMinute,
      60_000,
    );
    if (!userLimit.allowed || !ipLimit.allowed) {
      const retryAfter = Math.max(
        userLimit.retryAfterSeconds,
        ipLimit.retryAfterSeconds,
      );
      await writeAuditEvent({
        actorUserId: user.id,
        action: "external_freelancer_search_rate_limited",
        targetType: "project",
        targetId: input.projectId,
        outcome: "denied",
        traceId,
      });
      return NextResponse.json(
        { error: "Das Suchlimit ist erreicht.", traceId },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const { project, brief } = await ownedProjectWithBrief(
      admin,
      input.projectId,
      user.id,
    );

    // Search is only the explicit fallback after the current curated catalog
    // produced no eligible profile. This check prevents paid duplicate work.
    const internalProfiles = await fetchActiveBookableRealProfiles(admin);
    const internalShortlist = buildShortlist(brief, internalProfiles);
    if (internalShortlist.status !== "no_reliable_match") {
      await writeAuditEvent({
        actorUserId: user.id,
        action: "external_freelancer_search_denied_internal_match",
        targetType: "project",
        targetId: project.id,
        outcome: "denied",
        traceId,
      });
      return NextResponse.json(
        {
          error:
            internalShortlist.status === "needs_clarification"
              ? "Die Anforderungen müssen vor einer kostenpflichtigen Websuche präzisiert werden. Es wurden keine Credits belastet."
              : "Für dieses Projekt existiert inzwischen mindestens ein zuverlässiger interner Treffer.",
          traceId,
        },
        { status: 409 },
      );
    }

    const productReservation = await reserveProductCredits({
      userId: user.id,
      requestKey,
      purpose: "external_freelancer_search",
      amount: EXTERNAL_FREELANCER_SEARCH_CREDITS,
    });
    if (!productReservation.allowed) {
      const racedResult = await getExternalSearchResult({
        userId: user.id,
        projectId: project.id,
        requestKey,
      });
      if (racedResult) {
        const currentCredits = await getProductCreditSnapshot(user.id);
        return completedSearchResponse({
          projectId: project.id,
          candidates: racedResult.candidates,
          productCredits: currentCredits,
          replayed: true,
        });
      }
      const duplicate = /already_(?:reserved|charged|released|settled|completed)/u.test(
        productReservation.reason,
      );
      return NextResponse.json(
        {
          error: duplicate
            ? "Diese Internetsuche wurde bereits gestartet oder abgeschlossen."
            : "Für diese Internetsuche sind 30 Produkt-Credits erforderlich.",
          code: duplicate
            ? productReservation.reason === "already_released"
              ? "search_previous_attempt_released"
              : "search_already_processed"
            : "insufficient_product_credits",
          price: {
            credits: EXTERNAL_FREELANCER_SEARCH_CREDITS,
            eur: "0.50",
          },
          productCredits: {
            balance: productReservation.balance,
            reserved: productReservation.reserved,
            available: productReservation.available,
            euroPerCredit: PRODUCT_CREDIT_EURO_PER_UNIT,
          },
          traceId,
        },
        {
          status: duplicate ? 409 : 402,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
    const estimate = estimateExternalSearchTokenCeiling({ brief });
    let tracked;
    try {
      tracked = await executeTrackedAiRequest({
      requestKey,
      interactionId: interactionIdFromRequestKey(requestKey),
      userId: user.id,
      userHash,
      ipHash,
      isAnonymous: user.isAnonymous,
      isAdmin: user.isAdmin,
      purpose: "research",
      requestedModel: estimate.model,
      estimatedInputTokens: estimate.inputTokens,
      estimatedOutputTokens: estimate.outputTokens,
      operation: async (providerAllowed) => {
        const result = await searchExternalFreelancers({
          brief,
          safetyIdentifier: userHash,
          allowProvider: providerAllowed,
        });
        return {
          value: result,
          providerAttempted: result.providerAttempted,
          outcome:
            result.mode === "openai"
              ? ("succeeded" as const)
              : result.fallbackReason === "provider_timeout"
                ? ("timeout" as const)
                : ("provider_error" as const),
          usage:
            result.provider &&
            Number.isSafeInteger(result.provider.inputTokens) &&
            Number.isSafeInteger(result.provider.outputTokens)
              ? {
                  requestedModel: result.provider.requestedModel,
                  actualModel: result.provider.model,
                  providerResponseId: result.provider.responseId,
                  inputTokens: result.provider.inputTokens!,
                  cachedInputTokens: result.provider.cachedInputTokens ?? 0,
                  cacheWriteTokens: result.provider.cacheWriteTokens ?? 0,
                  outputTokens: result.provider.outputTokens!,
                  totalTokens: result.provider.totalTokens,
                }
              : undefined,
        };
      },
      });
    } catch {
      await settleProductCredits({
        userId: user.id,
        requestKey,
        outcome: "technical_error",
      }).catch(() => undefined);
      throw NextResponse.json(
        {
          error: "Die Internetsuche ist technisch fehlgeschlagen. Die 30 Credits wurden freigegeben.",
          code: "search_technical_error_refunded",
          traceId,
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    let productCredits: ProductCreditSnapshot;
    let responseCandidates = tracked.value.candidates;
    let charged = false;
    if (tracked.value.mode === "openai") {
      const providerResponseId = tracked.value.provider?.responseId?.trim();
      const actualModel = tracked.value.provider?.model?.trim();
      if (!providerResponseId || !actualModel) {
        productCredits = await settleProductCredits({
          userId: user.id,
          requestKey,
          outcome: "invalid_response",
        });
      } else {
        try {
          const completed = await completeExternalSearch({
            userId: user.id,
            projectId: project.id,
            requestKey,
            candidates: tracked.value.candidates,
            providerResponseId,
            actualModel,
          });
          productCredits = completed;
          responseCandidates = completed.candidates;
          charged = true;
        } catch {
          await settleProductCredits({
            userId: user.id,
            requestKey,
            outcome: "technical_error",
          }).catch(() => undefined);
          throw NextResponse.json(
            {
              error: "Das Suchergebnis konnte nicht sicher gespeichert werden. Die 30 Credits wurden freigegeben.",
              code: "search_technical_error_refunded",
              traceId,
            },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          );
        }
      }
    } else {
      productCredits = await settleProductCredits({
        userId: user.id,
        requestKey,
        outcome:
          tracked.value.fallbackReason === "provider_timeout"
            ? "timeout"
            : tracked.value.fallbackReason === "invalid_output"
              ? "invalid_response"
              : "technical_error",
      });
    }

    await writeAuditEvent({
      actorUserId: user.id,
      action: charged
        ? "external_freelancer_search_response_served"
        : "external_freelancer_search_failed",
      targetType: "project",
      targetId: project.id,
      outcome: tracked.value.mode === "openai" ? "success" : "failed",
      traceId,
      metadata: {
        candidateCount: responseCandidates.length,
        consultedSourceCount: tracked.value.searchTrace.consultedSourceCount,
        providerAttempted: tracked.value.providerAttempted,
      },
    });

    return NextResponse.json(
      {
        projectId: project.id,
        candidates: responseCandidates,
        disclosure: EXTERNAL_RESULT_DISCLOSURE,
        mode: charged ? "openai" : "unavailable",
        notice:
          !charged
            ? "Die externe KI-Suche konnte nicht ausgeführt werden oder lieferte keine ausreichend belegten Treffer."
            : undefined,
        searchTrace: tracked.value.searchTrace,
        // Was der Lauf den Betreiber gekostet hat — nicht, was berechnet wird.
        costCents: actualSearchCost({
          toolCalls: tracked.value.searchTrace.toolCallCount,
          inputTokens: tracked.value.provider?.inputTokens,
          cachedInputTokens: tracked.value.provider?.cachedInputTokens,
          outputTokens: tracked.value.provider?.outputTokens,
        }).cents,
        quota: {
          retryAfterSeconds: tracked.quota.retryAfterSeconds,
        },
        price: {
          credits: EXTERNAL_FREELANCER_SEARCH_CREDITS,
          eur: "0.50",
          charged,
        },
        productCredits: {
          ...productCredits,
          euroPerCredit: PRODUCT_CREDIT_EURO_PER_UNIT,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    await writeAuditEvent({
      actorUserId: null,
      action: "external_freelancer_search_failed",
      targetType: "project",
      outcome: "failed",
      traceId,
    }).catch(() => undefined);
    return errorResponse(error, traceId);
  }
}
