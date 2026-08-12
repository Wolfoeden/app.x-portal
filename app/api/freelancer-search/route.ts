import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { executeTrackedAiRequest } from "@/lib/ai/gateway";
import { writeAuditEvent } from "@/lib/audit/write";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { fetchActiveBookableRealProfiles } from "@/lib/data/freelancers";
import type { ProjectRow } from "@/lib/data/projects";
import { buildShortlist, ProjectBriefSchema } from "@/lib/domain";
import {
  estimateExternalSearchTokenCeiling,
  searchExternalFreelancers,
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

const PostgresUuidSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);

const InputSchema = z
  .object({
    // Older deterministic project IDs are valid PostgreSQL UUIDs even when
    // their RFC version bits were not normalized.
    projectId: PostgresUuidSchema,
    requestId: z.string().trim().min(8).max(160).optional(),
  })
  .strict();

function interactionIdFromRequestKey(requestKey: string): string {
  const value = requestKey.slice(0, 32);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
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
  if (data.brief_status !== "ready") {
    throw new Response(
      "Die externe Suche ist erst nach einer bestätigten KI-Projektanalyse verfügbar.",
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

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      throw new Response(
        "Die serverseitige Supabase-Konfiguration ist unvollständig.",
        { status: 503 },
      );
    }

    const admin = createAdminSupabaseClient();
    const { project, brief } = await ownedProjectWithBrief(
      admin,
      input.projectId,
      user.id,
    );

    // Search is only the explicit fallback after the current curated catalog
    // produced no eligible profile. This check prevents paid duplicate work.
    const internalProfiles = await fetchActiveBookableRealProfiles(admin);
    if (buildShortlist(brief, internalProfiles).matches.length > 0) {
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
            "Für dieses Projekt existiert inzwischen mindestens ein interner Treffer.",
          traceId,
        },
        { status: 409 },
      );
    }

    const requestKey = createHash("sha256")
      .update(
        `${user.id}:${project.id}:external:${input.requestId ?? randomUUID()}`,
      )
      .digest("hex");
    const estimate = estimateExternalSearchTokenCeiling({ brief });
    const tracked = await executeTrackedAiRequest({
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

    await writeAuditEvent({
      actorUserId: user.id,
      action: "external_freelancer_search_completed",
      targetType: "project",
      targetId: project.id,
      outcome: tracked.value.mode === "openai" ? "success" : "failed",
      traceId,
      metadata: {
        candidateCount: tracked.value.candidates.length,
        consultedSourceCount: tracked.value.searchTrace.consultedSourceCount,
        providerAttempted: tracked.value.providerAttempted,
      },
    });

    return NextResponse.json(
      {
        projectId: project.id,
        candidates: tracked.value.candidates,
        disclosure:
          "Externe Webtreffer sind nicht von XPORTAL geprüft. Angaben und Verfügbarkeit müssen vor der Buchung auf den verlinkten Quellen kontrolliert werden.",
        mode: tracked.value.mode,
        notice:
          tracked.value.mode === "unavailable"
            ? "Die externe KI-Suche konnte nicht ausgeführt werden oder lieferte keine ausreichend belegten Treffer."
            : undefined,
        searchTrace: tracked.value.searchTrace,
        quota: {
          retryAfterSeconds: tracked.quota.retryAfterSeconds,
        },
        credits: tracked.credits
          ? {
              ...tracked.credits,
              exhausted: tracked.credits.remaining <= 0,
            }
          : undefined,
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
