import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { EXTERNAL_SEARCH_CREDITS } from "@/lib/ai/credit-policy";
import {
  getExternalSearchResult,
  storeExternalSearchResult,
} from "@/lib/ai/external-search-store";
import { executeTrackedAiRequest } from "@/lib/ai/gateway";
import { getAiCreditSnapshot, type AiCreditSnapshot } from "@/lib/ai/quota";
import { actualSearchCost } from "@/lib/ai/search-cost";
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
import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
  pseudonymizeSubject,
  readJsonWithLimit,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";
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
  credits: AiCreditSnapshot;
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
        ? `Die bereits mit ${EXTERNAL_SEARCH_CREDITS} Credits bezahlte Recherche wurde ohne neue Belastung wiederhergestellt.`
        : undefined,
      searchTrace: {
        queries: [],
        consultedSourceCount,
        returnedCandidateCount: input.candidates.length,
      },
      quota: { retryAfterSeconds: input.retryAfterSeconds ?? null },
      price: { credits: EXTERNAL_SEARCH_CREDITS, charged: true },
      credits: input.credits,
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
          error: `Bitte melden Sie sich an, bevor Sie die externe Recherche für ${EXTERNAL_SEARCH_CREDITS} Credits starten.`,
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
      const currentCredits = await getAiCreditSnapshot({
        userId: user.id,
        isAnonymous: user.isAnonymous,
      });
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
        credits: currentCredits,
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
    const [userLimit, ipLimit] = await Promise.all([
      consumeRateLimit(`web-search-user:${userHash}`, perMinute, 60_000),
      consumeRateLimit(`web-search-ip:${ipHash}`, perMinute, 60_000),
    ]);
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

    // Kein eigener Reservierungsschritt mehr: executeTrackedAiRequest hält die
    // Credits, ruft den Anbieter nur bei bewilligtem Halt auf und gibt sie im
    // Fehlerfall wieder frei. Eine Vorprüfung auf dem eigenen Konto wäre hier
    // sogar falsch — ein eingeladenes Teammitglied zahlt aus dem Topf des
    // Plan-Inhabers, und das entscheidet erst die Reservierung.
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
        // Verwertbar heißt: der Anbieter hat geantwortet und die Antwort ist
        // zuordenbar. Ohne Antwort-Kennung und Modell lässt sich das Ergebnis
        // weder ablegen noch später belegen — dann ist der Lauf für den
        // Kunden nichts wert und wird ihm nicht berechnet.
        const usable =
          result.mode === "openai" &&
          Boolean(result.provider?.responseId?.trim()) &&
          Boolean(result.provider?.model?.trim()) &&
          Number.isSafeInteger(result.provider?.inputTokens) &&
          Number.isSafeInteger(result.provider?.outputTokens);
        return {
          value: result,
          providerAttempted: result.providerAttempted,
          // Ohne `usage` gibt der Gateway die Reservierung vollständig frei.
          providerUsageDefinitelyZero: !usable,
          outcome: usable
            ? ("succeeded" as const)
            : result.fallbackReason === "provider_timeout"
              ? ("timeout" as const)
              : ("provider_error" as const),
          usage: usable
            ? {
                requestedModel: result.provider!.requestedModel,
                actualModel: result.provider!.model,
                providerResponseId: result.provider!.responseId,
                inputTokens: result.provider!.inputTokens!,
                cachedInputTokens: result.provider!.cachedInputTokens ?? 0,
                cacheWriteTokens: result.provider!.cacheWriteTokens ?? 0,
                outputTokens: result.provider!.outputTokens!,
                totalTokens: result.provider!.totalTokens,
              }
            : undefined,
        };
      },
      });
    } catch {
      // Der Gateway hält die Reservierung, wenn er selbst wirft. Der
      // Abstimmungslauf gibt sie frei; hier wird nichts behauptet, was nicht
      // sicher ist.
      throw NextResponse.json(
        {
          error:
            "Die Internetsuche ist technisch fehlgeschlagen. Es wurde nichts belastet.",
          code: "search_technical_error_refunded",
          traceId,
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Das Guthaben war zu klein oder ein Limit hat gegriffen. Der Anbieter
    // wurde in diesem Fall gar nicht erst gefragt.
    if (!tracked.quota.allowed) {
      await writeAuditEvent({
        actorUserId: user.id,
        action: "external_freelancer_search_denied_quota",
        targetType: "project",
        targetId: project.id,
        outcome: "denied",
        traceId,
        metadata: { reason: tracked.quota.reason },
      });
      const rateLimited = tracked.quota.retryAfterSeconds !== null;
      return NextResponse.json(
        {
          error: rateLimited
            ? "Das Suchlimit ist kurzzeitig erreicht. Bitte in einem Moment erneut versuchen."
            : `Für diese Recherche sind ${EXTERNAL_SEARCH_CREDITS} Credits nötig. Ihr Guthaben reicht dafür nicht aus; es wurde nichts belastet.`,
          code: rateLimited ? "search_rate_limited" : "insufficient_credits",
          price: { credits: EXTERNAL_SEARCH_CREDITS },
          credits: tracked.credits,
          quota: { retryAfterSeconds: tracked.quota.retryAfterSeconds },
          traceId,
        },
        {
          status: rateLimited ? 429 : 402,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const charged = tracked.creditsCharged !== 0;
    let responseCandidates = tracked.value.candidates;
    if (charged) {
      const providerResponseId = tracked.value.provider?.responseId?.trim();
      const actualModel = tracked.value.provider?.model?.trim();
      try {
        const stored = await storeExternalSearchResult({
          userId: user.id,
          projectId: project.id,
          requestKey,
          candidates: tracked.value.candidates,
          providerResponseId: providerResponseId!,
          actualModel: actualModel!,
        });
        responseCandidates = stored.candidates;
      } catch {
        // Das Ergebnis geht trotzdem an den Kunden — er hat es bezahlt und
        // bekommt es. Verloren ist nur die Wiederherstellbarkeit bei einer
        // abgerissenen Verbindung, und das gehört ins Protokoll.
        await writeAuditEvent({
          actorUserId: user.id,
          action: "external_freelancer_search_result_not_stored",
          targetType: "project",
          targetId: project.id,
          outcome: "failed",
          traceId,
        }).catch(() => undefined);
      }
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
        toolCallCount: tracked.value.searchTrace.toolCallCount,
        providerAttempted: tracked.value.providerAttempted,
        // Ohne diese Zeile meldet ein Anbieterfehler nur "keine Treffer" —
        // genau das hat die Funktion monatelang unbemerkt lahmgelegt.
        fallbackReason: tracked.value.fallbackReason ?? "none",
        fallbackDetail: tracked.value.fallbackDetail ?? "none",
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
        price: { credits: EXTERNAL_SEARCH_CREDITS, charged },
        credits: tracked.credits,
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
