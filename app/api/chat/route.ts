import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import {
  calculateProviderCostCents,
  recordAiUsage,
  reserveAiQuota,
} from "@/lib/ai/quota";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { deriveProjectTitle, presentProject, type ProjectRow } from "@/lib/data/projects";
import { fetchActiveAvailableProfiles } from "@/lib/data/freelancers";
import {
  buildShortlist,
  FreelancerProfileSchema,
  MATCHING_RULE_VERSION,
  ProjectBriefSchema,
  type ProjectBrief,
} from "@/lib/domain";
import {
  buildDeterministicBrief,
  extractProjectBrief,
} from "@/lib/openai";
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

function errorResponse(error: unknown, traceId = randomUUID()): Response {
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

function assistantText(resultCount: number): string {
  if (resultCount === 0) {
    return "Ich habe Ihre Angaben strukturiert. Aktuell erfüllt kein aktives und verfügbares Profil alle erkannten Pflichtkriterien. Ergänzen oder ändern Sie die Anfrage einfach hier im Chat.";
  }
  return `Ich habe Ihre Angaben strukturiert und ${resultCount} ${
    resultCount === 1 ? "aktuell passendes Profil" : "aktuell passende Profile"
  } nach den dokumentierten Regeln gefunden. Sie entscheiden selbst, wen Sie auswählen.`;
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

export async function POST(request: Request) {
  const traceId = randomUUID();
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
    const quota =
      userHash && ipHash
        ? await reserveAiQuota({
            requestKey,
            userHash,
            ipHash,
            isAnonymous: user.isAnonymous,
          })
        : {
            allowed: false,
            reason: "pseudonym_configuration_missing",
            retryAfterSeconds: null,
            reservationId: null,
          };

    const extraction = await extractProjectBrief({
      originalRequest: existing?.original_request ?? input.message,
      latestMessage: existing ? input.message : undefined,
      previousBrief: previousBrief(existing),
      safetyIdentifier: userHash ?? undefined,
      allowProvider: quota.allowed,
    });

    if (quota.allowed) {
      const inputTokens = extraction.provider?.inputTokens ?? 0;
      const outputTokens = extraction.provider?.outputTokens ?? 0;
      const outcome =
        extraction.mode === "openai"
          ? "succeeded"
          : extraction.fallbackReason === "provider_timeout"
            ? "timeout"
            : "provider_error";
      await recordAiUsage({
        requestKey,
        inputTokens,
        outputTokens,
        actualCostCents: calculateProviderCostCents(inputTokens, outputTokens),
        outcome,
      }).catch(() => undefined);
    }

    // The model never receives this data. Filtering and ordering are wholly
    // deterministic and run only after the brief has been accepted.
    const profiles = await fetchActiveAvailableProfiles(admin);
    const shortlist = buildShortlist(extraction.brief, profiles);
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
            // A booking URL is released only by the introduction route after
            // an explicit authenticated click. It is never stored in a
            // browser-readable match snapshot.
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
            ? quota.reason === "provider_monthly_budget"
              ? "Das monatliche KI-Budget ist erreicht. Ihre Anfrage wurde sicher lokal verarbeitet."
              : "Ihre Anfrage wurde gespeichert und ohne Provider-Abhängigkeit strukturiert."
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
