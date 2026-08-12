import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { executeTrackedAiRequest } from "@/lib/ai/gateway";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { deriveProjectTitle, presentProject, type ProjectRow } from "@/lib/data/projects";
import { fetchActiveBookableRealProfiles } from "@/lib/data/freelancers";
import {
  buildShortlist,
  FreelancerProfileSchema,
  MATCHING_RULE_VERSION,
  ProjectBriefSchema,
  type ProjectBrief,
} from "@/lib/domain";
import {
  buildDeterministicBrief,
  estimateProjectBriefTokenCeiling,
  extractProjectBrief,
} from "@/lib/openai";
import { resolveOpenAiConnection } from "@/lib/openai/provider";
import { presentBrief, presentMatch } from "@/lib/presentation/chat";
import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
  pseudonymizeSubject,
  readJsonWithLimit,
} from "@/lib/security/request";
import { takeRateLimit } from "@/lib/security/rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ChatInputSchema = z
  .object({
    projectId: z.string().uuid().nullable().optional(),
    message: z.string().trim().min(1).max(12_000),
    clientMessageId: z.string().trim().min(8).max(160).optional(),
  })
  .strict();

type MatchInsert = {
  shortlist_id: string;
  project_id: string;
  owner_user_id: string;
  freelancer_profile_id: string;
  position: number;
  match_reasons: string[];
  known_gaps: string[];
  verified_facts_snapshot: string[];
  self_reported_facts_snapshot: string[];
  profile_snapshot: unknown;
  matching_rule_version: string;
  profile_data_version: number;
};

function errorResponse(error: unknown, traceId: string = randomUUID()): Response {
  if (error instanceof Response) return error;
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "Die Anfrage hat ein ungültiges Format.", traceId },
      { status: 400 },
    );
  }
  return NextResponse.json(
    {
      error:
        "Die Anfrage wurde gespeichert, konnte aber gerade nicht vollständig verarbeitet werden.",
      traceId,
    },
    { status: 503 },
  );
}

function profileVersionNumber(dataVersion: string): number {
  const match = /(?:^|\D)(\d+)$/u.exec(dataVersion);
  return match ? Math.max(1, Number.parseInt(match[1], 10)) : 1;
}

function catalogVersion(profiles: readonly { id: string; dataVersion: string }[]): string {
  return createHash("sha256")
    .update(
      profiles
        .map((profile) => `${profile.id}:${profile.dataVersion}`)
        .sort()
        .join("|"),
    )
    .digest("hex");
}

function interactionIdFromRequestKey(requestKey: string): string {
  const value = requestKey.slice(0, 32);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function assistantText(resultCount: number): string {
  if (resultCount === 0) {
    return "Ich habe Ihre Angaben strukturiert. Aktuell erfüllt kein reales, direkt buchbares Profil alle erkannten Pflichtkriterien. Sie können die Anfrage im Chat ergänzen oder ausdrücklich eine getrennte KI-Websuche nach öffentlich belegten Profilen mit direktem Buchungslink starten.";
  }
  return `Ich habe Ihre Angaben strukturiert und ${resultCount} ${
    resultCount === 1 ? "aktuell passendes Profil" : "aktuell passende Profile"
  } nach den dokumentierten Regeln gefunden. Sie können das gewünschte Erstgespräch direkt über den jeweiligen Booking-Link buchen.`;
}

function fallbackNotice(
  reason: string,
  isAnonymous: boolean,
  fallbackReason: string | undefined,
): string {
  if (reason === "provider_monthly_budget") {
    return "Das monatliche KI-Budget ist erreicht. Ihre Anfrage wurde sicher lokal verarbeitet.";
  }
  if (reason === "insufficient_credits") {
    return isAnonymous
      ? "Ihr kostenloses KI-Kontingent reicht für diese Analyse nicht mehr aus. Die Anfrage wurde gespeichert; nach der Anmeldung können Sie mit dem Account-Kontingent fortfahren."
      : "Ihre AI Credits reichen für diese KI-Analyse nicht aus. Die Anfrage wurde gespeichert und mit der sicheren Basislogik verarbeitet.";
  }
  if (
    reason === "anonymous_user_daily_token_limit" ||
    reason === "anonymous_ip_daily_token_limit"
  ) {
    return "Das tägliche KI-Limit für den Gastzugang ist erreicht. Ihre Anfrage wurde gespeichert und ohne weiteren Provider-Aufruf verarbeitet.";
  }
  if (fallbackReason === "provider_timeout") {
    return "Die KI-Analyse hat das Zeitlimit erreicht. Ihre Anfrage wurde gespeichert und mit der sicheren Basislogik verarbeitet.";
  }
  if (fallbackReason === "invalid_output") {
    return "Die KI-Antwort war nicht zuverlässig strukturiert. Ihre Anfrage wurde gespeichert und mit der sicheren Basislogik verarbeitet.";
  }
  if (fallbackReason === "provider_error") {
    return "Die KI-Analyse war vorübergehend nicht verfügbar. Ihre Anfrage wurde gespeichert und mit der sicheren Basislogik verarbeitet.";
  }
  if (fallbackReason === "provider_unavailable") {
    return "Der KI-Provider ist noch nicht konfiguriert. Ihre Anfrage wurde gespeichert und mit der sicheren Basislogik verarbeitet.";
  }
  return "Ihre Anfrage wurde gespeichert und ohne Provider-Abhängigkeit strukturiert.";
}

async function ownedProject(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  projectId: string,
  userId: string,
): Promise<ProjectRow> {
  const { data, error } = await admin
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Response("Projekt nicht gefunden.", { status: 404 });
  return data as ProjectRow;
}

function previousBrief(row: ProjectRow | null): ProjectBrief | undefined {
  if (!row?.structured_brief) return undefined;
  const result = ProjectBriefSchema.safeParse(row.structured_brief);
  return result.success ? result.data : undefined;
}

type ProgressReporter = (label: string) => void;

async function processChatRequest(
  request: Request,
  traceId: string,
  progress: ProgressReporter,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const input = ChatInputSchema.parse(await readJsonWithLimit(request, 16_000));
    const user = await requireCurrentUser();
    const ipAddress = getClientIp(request);

    let userHash: string | null = null;
    let ipHash: string | null = null;
    try {
      userHash = pseudonymizeSubject(`user:${user.id}`);
      ipHash = pseudonymizeIp(ipAddress);
    } catch {
      // A missing production HMAC secret disables paid provider work, but the
      // deterministic path remains available and no raw IP is persisted.
    }

    const perMinute = Number.parseInt(process.env.AI_REQUESTS_PER_MINUTE ?? "6", 10);
    const userLimit = takeRateLimit(
      `user:${userHash ?? user.id}`,
      Number.isSafeInteger(perMinute) && perMinute > 0 ? perMinute : 6,
    );
    const ipLimit = takeRateLimit(
      `ip:${ipHash ?? "unconfigured"}`,
      Number.isSafeInteger(perMinute) && perMinute > 0 ? perMinute : 6,
    );
    if (!userLimit.allowed || !ipLimit.allowed) {
      const retryAfter = Math.max(
        userLimit.retryAfterSeconds,
        ipLimit.retryAfterSeconds,
      );
      await writeAuditEvent({
        actorUserId: user.id,
        action: "chat_rate_limited",
        targetType: "project",
        targetId: input.projectId,
        outcome: "denied",
        traceId,
      });
      return NextResponse.json(
        { error: "Das Nutzungslimit ist erreicht.", traceId },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      throw new Response(
        "Die serverseitige Supabase-Konfiguration ist noch nicht vollständig.",
        { status: 503 },
      );
    }

    progress("Projekt wird sicher gespeichert …");
    const admin = createAdminSupabaseClient();
    const existing = input.projectId
      ? await ownedProject(admin, input.projectId, user.id)
      : null;
    const deterministic = buildDeterministicBrief({
      originalRequest: existing?.original_request ?? input.message,
      latestMessage: existing ? input.message : undefined,
      previousBrief: previousBrief(existing),
    });

    let project: ProjectRow;
    if (existing) {
      const { data, error } = await admin
        .from("projects")
        .update({
          original_request: deterministic.originalRequest,
          structured_brief: deterministic,
          brief_status: "pending",
          status: "matching",
        })
        .eq("id", existing.id)
        .eq("owner_user_id", user.id)
        .select("*")
        .single();
      if (error) throw error;
      project = data as ProjectRow;
    } else {
      const { data, error } = await admin
        .from("projects")
        .insert({
          owner_user_id: user.id,
          title: deriveProjectTitle(input.message),
          original_request: deterministic.originalRequest,
          structured_brief: deterministic,
          brief_status: "pending",
          status: "matching",
        })
        .select("*")
        .single();
      if (error) throw error;
      project = data as ProjectRow;
    }

    const clientMessageId = input.clientMessageId ?? `server-${randomUUID()}`;
    const { error: messageError } = await admin.from("messages").insert({
      project_id: project.id,
      owner_user_id: user.id,
      role: "user",
      content: input.message,
      client_message_id: clientMessageId,
    });
    if (messageError && messageError.code !== "23505") throw messageError;

    const requestKey = createHash("sha256")
      .update(`${user.id}:${project.id}:${clientMessageId}`)
      .digest("hex");
    const interactionId = interactionIdFromRequestKey(requestKey);
    const extractionInput = {
      originalRequest: existing?.original_request ?? input.message,
      latestMessage: existing ? input.message : undefined,
      previousBrief: previousBrief(existing),
      safetyIdentifier: userHash ?? undefined,
    };
    const estimate = estimateProjectBriefTokenCeiling(extractionInput);
    progress("KI analysiert und strukturiert die Anforderungen …");
    const tracked =
      userHash && ipHash
        ? await executeTrackedAiRequest({
            requestKey,
            interactionId,
            userId: user.id,
            userHash,
            ipHash,
            isAnonymous: user.isAnonymous,
            purpose: "project_brief",
            requestedModel: estimate.model,
            estimatedInputTokens: estimate.inputTokens,
            estimatedOutputTokens: estimate.outputTokens,
            operation: async (providerAllowed) => {
              const extraction = await extractProjectBrief({
                ...extractionInput,
                allowProvider: providerAllowed,
              });
              return {
                value: extraction,
                providerAttempted: extraction.providerAttempted,
                outcome:
                  extraction.mode === "openai"
                    ? ("succeeded" as const)
                    : extraction.fallbackReason === "provider_timeout"
                      ? ("timeout" as const)
                      : ("provider_error" as const),
                usage:
                  extraction.provider &&
                  Number.isSafeInteger(extraction.provider.inputTokens) &&
                  Number.isSafeInteger(extraction.provider.outputTokens)
                  ? {
                      requestedModel: extraction.provider.requestedModel,
                      actualModel: extraction.provider.model,
                      providerResponseId: extraction.provider.responseId,
                      inputTokens: extraction.provider.inputTokens!,
                      cachedInputTokens:
                        extraction.provider.cachedInputTokens ?? 0,
                      outputTokens: extraction.provider.outputTokens!,
                      totalTokens: extraction.provider.totalTokens,
                    }
                  : undefined,
              };
            },
          })
        : {
            value: await extractProjectBrief({
              ...extractionInput,
              allowProvider: false,
            }),
            quota: {
              allowed: false,
              reason: "pseudonym_configuration_missing",
              retryAfterSeconds: null,
              reservationId: null,
              credits: null,
            },
            credits: null,
          };
    const extraction = tracked.value;
    const quota = tracked.quota;
    progress(
      extraction.mode === "openai"
        ? "Anforderungen sind strukturiert · interne Profile werden geladen …"
        : "Sichere Basisanalyse aktiv · interne Profile werden geladen …",
    );

    // The model never receives this data. Filtering and ordering are wholly
    // deterministic and run only after the brief has been accepted.
    const profiles = await fetchActiveBookableRealProfiles(admin);
    progress(`${profiles.length} aktive Profile werden regelbasiert abgeglichen …`);
    const shortlist = buildShortlist(extraction.brief, profiles);
    progress(
      shortlist.matches.length
        ? `${shortlist.matches.length} passende Profile werden nachvollziehbar aufbereitet …`
        : "Kein interner Treffer · alternative Suche wird vorbereitet …",
    );
    const shortlistId = randomUUID();
    const profileCatalogVersion = catalogVersion(profiles);

    const { error: shortlistError } = await admin.from("shortlists").insert({
      id: shortlistId,
      project_id: project.id,
      owner_user_id: user.id,
      matching_rule_version: MATCHING_RULE_VERSION,
      brief_snapshot: extraction.brief,
      result_count: shortlist.matches.length,
      profile_catalog_version: profileCatalogVersion,
    });
    if (shortlistError) throw shortlistError;

    if (shortlist.matches.length) {
      const rows: MatchInsert[] = shortlist.matches.map((match, index) => ({
        shortlist_id: shortlistId,
        project_id: project.id,
        owner_user_id: user.id,
        freelancer_profile_id: match.profile.id,
        position: index + 1,
        match_reasons: match.matchReasons,
        known_gaps: match.knownGaps,
        verified_facts_snapshot: match.verifiedFacts,
        self_reported_facts_snapshot: match.selfReportedFacts,
        profile_snapshot: FreelancerProfileSchema.parse({
          ...match.profile,
          introPolicy: {
            ...match.profile.introPolicy,
            // Historical browser-readable match snapshots never retain a
            // booking URL. The current response may expose the approved URL,
            // but only an explicit user click can open it.
            bookingUrl: null,
          },
        }),
        matching_rule_version: MATCHING_RULE_VERSION,
        profile_data_version: profileVersionNumber(match.profileDataVersion),
      }));
      const { error } = await admin.from("matches").insert(rows);
      if (error) throw error;
    }

    const text = assistantText(shortlist.matches.length);
    const assistantClientMessageId = `assistant-${requestKey}`;
    const { data: insertedAssistant, error: assistantError } = await admin
      .from("messages")
      .insert({
        project_id: project.id,
        owner_user_id: user.id,
        role: "assistant",
        content: text,
        client_message_id: assistantClientMessageId,
        structured_payload: {
          shortlistId,
          matchingRuleVersion: MATCHING_RULE_VERSION,
          requestKey,
        },
      })
      .select("id,role,content,created_at")
      .maybeSingle();
    if (assistantError && assistantError.code !== "23505") throw assistantError;
    let assistantMessage = insertedAssistant;
    if (!assistantMessage) {
      const { data, error } = await admin
        .from("messages")
        .select("id,role,content,created_at")
        .eq("project_id", project.id)
        .eq("client_message_id", assistantClientMessageId)
        .single();
      if (error) throw error;
      assistantMessage = data;
    }

    const { data: updatedProject, error: projectError } = await admin
      .from("projects")
      .update({
        title: extraction.brief.projectTitle ?? project.title,
        original_request: extraction.brief.originalRequest,
        structured_brief: extraction.brief,
        brief_status: extraction.mode === "openai" ? "ready" : "manual",
        status: shortlist.matches.length ? "shortlisted" : "matching",
      })
      .eq("id", project.id)
      .eq("owner_user_id", user.id)
      .select("*")
      .single();
    if (projectError) throw projectError;

    await writeAuditEvent({
      actorUserId: user.id,
      action: "project_chat_processed",
      targetType: "project",
      targetId: project.id,
      outcome: "success",
      traceId,
      metadata: {
        resultCount: shortlist.matches.length,
        matchingRuleVersion: MATCHING_RULE_VERSION,
        extractionMode: extraction.mode,
      },
    });

    return NextResponse.json(
      {
        project: presentProject(updatedProject as ProjectRow),
        message: {
          id: assistantMessage.id,
          role: assistantMessage.role,
          content: assistantMessage.content,
          createdAt: assistantMessage.created_at,
        },
        brief: presentBrief(extraction.brief),
        matches: shortlist.matches.map(presentMatch),
        mode: extraction.mode === "openai" ? "ai" : "fallback",
        notice:
          extraction.mode === "fallback"
            ? fallbackNotice(
                quota.reason,
                user.isAnonymous,
                extraction.fallbackReason,
              )
            : undefined,
        match: {
          id: shortlistId,
          ruleVersion: MATCHING_RULE_VERSION,
          profileDataVersion: profileCatalogVersion,
          createdAt: new Date().toISOString(),
        },
        quota: {
          remainingRequests: Math.min(userLimit.remaining, ipLimit.remaining),
          retryAfterSeconds: quota.retryAfterSeconds,
        },
        credits: tracked.credits
          ? {
              ...tracked.credits,
              exhausted: tracked.credits.remaining <= 0,
              low:
                tracked.credits.remaining > 0 &&
                tracked.credits.remaining <=
                  Math.max(1, Math.ceil(tracked.credits.total * 0.2)),
            }
          : undefined,
        analysis: {
          provider: {
            transport: resolveOpenAiConnection().transport,
            mode: extraction.mode,
            model: extraction.provider?.model ?? null,
          },
          steps: [
            {
              label: "Anforderungen strukturiert",
              detail:
                extraction.mode === "openai"
                  ? "Die Angaben wurden serverseitig mit GPT in das Projektschema eingeordnet."
                  : "Die Anfrage wurde mit der sicheren Basislogik strukturiert; fehlende Fakten bleiben offen.",
              status: extraction.mode === "openai" ? "completed" : "warning",
            },
            {
              label: "Interne Datenbank geprüft",
              detail: `${profiles.length} aktive, reale und direkt buchbare Supabase-Profile wurden berücksichtigt.`,
              status: "completed",
            },
            {
              label: "Pflichtkriterien angewendet",
              detail: `${shortlist.matches.length} Treffer werden nach Regel ${MATCHING_RULE_VERSION} angezeigt; die KI entscheidet nicht über die Auswahl.`,
              status: "completed",
            },
          ],
          externalSearchAvailable: shortlist.matches.length === 0,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    await writeAuditEvent({
      actorUserId: null,
      action: "project_chat_failed",
      targetType: "project",
      outcome: "failed",
      traceId,
    }).catch(() => undefined);
    return errorResponse(error, traceId);
  }
}

function streamEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: unknown,
): void {
  controller.enqueue(
    new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
  );
}

export async function POST(request: Request): Promise<Response> {
  const acceptsStream = (request.headers.get("accept") ?? "").includes(
    "text/event-stream",
  );
  const traceId = randomUUID();
  if (!acceptsStream) {
    return processChatRequest(request, traceId, () => undefined);
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const progress: ProgressReporter = (label) => {
        streamEvent(controller, { type: "progress", label });
      };
      void processChatRequest(request, traceId, progress)
        .then(async (response) => {
          let body: unknown;
          try {
            body = await response.clone().json();
          } catch {
            body = { error: await response.text() };
          }
          if (response.ok) {
            streamEvent(controller, { type: "result", data: body });
          } else {
            const message =
              typeof body === "object" &&
              body !== null &&
              "error" in body &&
              typeof body.error === "string"
                ? body.error
                : "Die Anfrage konnte gerade nicht verarbeitet werden.";
            streamEvent(controller, {
              type: "error",
              message,
              retryable: response.status >= 500 || response.status === 429,
            });
          }
        })
        .catch(() => {
          streamEvent(controller, {
            type: "error",
            message: "Die Anfrage konnte gerade nicht verarbeitet werden.",
            retryable: true,
          });
        })
        .finally(() => controller.close());
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
