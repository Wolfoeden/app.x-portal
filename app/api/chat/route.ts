import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import type { AiAnalysisTrace } from "@/components/chat-contract";
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
  createChatRequestKey,
  interactionIdForChatRequest,
  projectIdForChatRequest,
} from "@/lib/domain/chat-idempotency";
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
  if (reason === "user_daily_token_limit") {
    return "Das tägliche interne XPORTAL-KI-Limit für dieses Konto ist erreicht. OpenAI wurde nicht aufgerufen; Ihre Anfrage wurde sicher gespeichert.";
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

function duplicateMessageResponse(
  projectId: string,
  conflict: boolean,
  traceId: string,
): Response {
  return NextResponse.json(
    conflict
      ? {
          error:
            "Diese Nachrichten-ID wurde bereits mit einem anderen Inhalt verwendet.",
          code: "client_message_conflict",
          projectId,
          traceId,
        }
      : {
          error:
            "Diese Nachricht wurde bereits verarbeitet. Das gespeicherte Projekt wird geladen.",
          code: "request_already_processed",
          projectId,
          traceId,
        },
    { status: 409, headers: { "Cache-Control": "no-store" } },
  );
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
    const clientMessageId = input.clientMessageId ?? `server-${randomUUID()}`;
    const requestKey = createChatRequestKey(
      user.id,
      clientMessageId,
      input.projectId,
    );
    const interactionId = interactionIdForChatRequest(requestKey);
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
    const targetProjectId =
      input.projectId ?? projectIdForChatRequest(requestKey);
    const { data: priorMessage, error: priorMessageError } = await admin
      .from("messages")
      .select("project_id,content")
      .eq("project_id", targetProjectId)
      .eq("owner_user_id", user.id)
      .eq("role", "user")
      .eq("client_message_id", clientMessageId)
      .limit(1)
      .maybeSingle();
    if (priorMessageError) throw priorMessageError;
    if (priorMessage) {
      return duplicateMessageResponse(
        priorMessage.project_id,
        priorMessage.content !== input.message,
        traceId,
      );
    }

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
          id: targetProjectId,
          owner_user_id: user.id,
          title: deriveProjectTitle(input.message),
          original_request: deterministic.originalRequest,
          structured_brief: deterministic,
          brief_status: "pending",
          status: "matching",
        })
        .select("*")
        .single();
      if (error?.code === "23505") {
        project = await ownedProject(
          admin,
          targetProjectId,
          user.id,
        );
      } else {
        if (error) throw error;
        project = data as ProjectRow;
      }
    }

    const { error: messageError } = await admin.from("messages").insert({
      project_id: project.id,
      owner_user_id: user.id,
      role: "user",
      content: input.message,
      client_message_id: clientMessageId,
    });
    if (messageError?.code === "23505") {
      const { data: duplicate, error: duplicateError } = await admin
        .from("messages")
        .select("project_id,content")
        .eq("project_id", project.id)
        .eq("client_message_id", clientMessageId)
        .single();
      if (duplicateError) throw duplicateError;
      return duplicateMessageResponse(
        duplicate.project_id,
        duplicate.content !== input.message,
        traceId,
      );
    }
    if (messageError) throw messageError;

    const extractionInput = {
      originalRequest: existing?.original_request ?? input.message,
      latestMessage: existing ? input.mz׎�����k�w��]);
          return query;
        },
        maybeSingle: () =>
          Promise.resolve({ data: mocks.project, error: null }),
      };
      return query;
    },
  }),
}));

import { parseFallbackBrief } from "@/lib/domain";
import { POST } from "@/app/api/freelancer-search/route";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";

const PROJECT_ID = "00000000-0000-4000-8000-000000000010";

function project() {
  return {
    id: PROJECT_ID,
    owner_user_id: "00000000-0000-4000-8000-000000000001",
    title: "React project",
    original_request: "React freelancer, remote",
    structured_brief: parseFallbackBrief("React freelancer, remote"),
    brief_status: "ready",
    status: "matching",
    created_at: "2026-08-12T08:00:00.000Z",
    updated_at: "2026-08-12T08:00:00.000Z",
  };
}

function request(
  origin = "https://x-portal.eu",
  projectId = PROJECT_ID,
) {
  return new Request("https://x-portal.eu/api/freelancer-search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-forwarded-for": "203.0.113.5",
    },
    body: JSON.stringify({
      projectId,
      requestId: "search-request-1",
    }),
  });
}

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.IP_HASH_SECRET = "a-secure-test-secret-that-is-long-enough";
  process.env.NEXT_PUBLIC_SITE_URL = "https://x-portal.eu";
  mocks.project = project();
  mocks.eqCalls.length = 0;
  mocks.audit.mockClear();
  mocks.fetchProfiles.mockClear();
  mocks.buildShortlist.mockReset();
  mocks.buildShortlist.mockReturnValue({ matches: [] });
  mocks.search.mockReset();
  mocks.execute.mockReset();
  mocks.execute.mockImplementation(async (input) => {
    const operation = await input.operation(true);
    return {
      value: operation.value,
      quota: {
        allowed: true,
        reason: "reserved",
        retryAfterSeconds: null,
        reservationId: "00000000-0000-4000-8000-000000000020",
        credits: null,
      },
      credits: null,
    };
  });
  mocks.search.mockResolvedValue({
    candidates: [],
    mode: "openai",
    providerAttempted: true,
    searchTrace: {
      queries: ["React freelancer booking"],
      consultedSourceCount: 2,
      returnedCandidateCount: 0,
    },
  });
  resetRateLimitsForTests();
});

afterEach(() => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.IP_HASH_SECRET;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("POST /api/freelancer-search", () => {
  it("accepts historical PostgreSQL UUIDs without RFC version bits", async () => {
    mocks.project = {
      ...project(),
      id: "00000000-0000-0000-0000-000000000010",
    };

    const response = await POST(
      request(
        "https://x-portal.eu",
        "00000000-0000-0000-0000-000000000010",
      ),
    );

    expect(response.status).not.toBe(400);
  });

  it("rejects cross-origin writes before provider work", async () => {
    const response = await POST(request("https://attacker.example"));

    expect(response.status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("enforces project ownership in the database lookup", async () => {
    mocks.project = null;
    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(mocks.eqCalls).toContainEqual(["id", PROJECT_ID]);
    expect(mocks.eqCalls).toContainEqual([
      "owner_user_id",
      "00000000-0000-4000-8000-000000000001",
    ]);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("does not spend on web search when an internal match now exists", async () => {
    mocks.buildShortlist.mockReturnValue({ matches: [{}] });
    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "external_freelancer_search_denied_internal_match",
        outcome: "denied",
      }),
    );
  });

  it("returns external results separately with an explicit disclosure", async () => {
    mocks.search.mockResolvedValue({
      candidates: [
        {
          displayName: "Anna Beispiel",
          role: "React Freelancer",
          summary: "Public profile summary",
          matchedRequirements: ["React"],
          knownGaps: ["Rate unknown"],
          profileUrl: "https://portfolio.example/anna",
          bookingUrl: "https://calendly.com/anna/30min",
          sourceUrls: [
            "https://portfolio.example/anna",
            "https://calendly.com/anna/30min",
          ],
          verificationStatus: "external_unverified",
        },
      ],
      mode: "openai",
      providerAttempted: true,
      searchTrace: {
        queries: ["React freelancer booking"],
        consultedSourceCount: 2,
        returnedCandidateCount: 1,
      },
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0].verificationStatus).toBe("external_unverified");
    expect(body.disclosure).toContain("nicht von XPORTAL geprüft");
    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({ allowProvider: true }),
    );
  });
});
