import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import { readAnswerToken } from "@/lib/placement/answer-token";
import { placementRequestsEnabled } from "@/lib/placement/config";
import {
  answerConversation,
  conversationForToken,
  conversationRole,
  listConversations,
} from "@/lib/placement/conversations";
import { PLACEMENT_OUTCOMES } from "@/lib/placement/follow-up-rules";
import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
  readJsonWithLimit,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * „Gespräche“: die eigenen Anfragen und, für Freelancer, die Anfragen an das
 * eigene Profil. Mit `?t=` aus dem Mail-Hinweis das eine Gespräch hinter dem
 * Link, auch ohne Anmeldung und auf einem anderen Gerät.
 */
export async function GET(request: Request) {
  if (!placementRequestsEnabled()) return new Response(null, { status: 404 });
  try {
    const token = new URL(request.url).searchParams.get("t");
    const user = await getCurrentUser();
    const [own, linked] = await Promise.all([
      user ? listConversations(user.id) : Promise.resolve([]),
      token ? conversationForToken(token) : Promise.resolve(null),
    ]);
    const conversations = linked && !own.some((item) => item.id === linked.id && item.role === linked.role)
      ? [linked, ...own]
      : own;
    return NextResponse.json(
      {
        conversations,
        openQuestions: conversations.filter((item) => item.question).length,
        linkInvalid: Boolean(token) && !linked,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Ihre Gespräche sind gerade nicht abrufbar." }, { status: 503 });
  }
}

const AnswerSchema = z
  .object({
    requestId: z.string().uuid(),
    answer: z.enum(PLACEMENT_OUTCOMES),
    /** Aus dem Mail-Hinweis: sagt ohne Anmeldung, wer antwortet. */
    token: z.string().trim().min(10).max(200).optional(),
  })
  .strict();

/** Die Antwort auf „Kam es zur Beauftragung?“, aus „Gespräche“. */
export async function POST(request: Request) {
  if (!placementRequestsEnabled()) return new Response(null, { status: 404 });
  try {
    assertSameOrigin(request);
    const limit = await consumeRateLimit(
      `conversation-answer:${pseudonymizeIp(getClientIp(request))}`,
      30,
      60 * 60_000,
    );
    if (!limit.allowed) {
      return new Response(null, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
    }
    const input = AnswerSchema.parse(await readJsonWithLimit(request, 1_000));

    const user = await getCurrentUser();
    const fromToken = input.token ? readAnswerToken(input.token) : null;
    const role =
      fromToken && fromToken.requestId === input.requestId
        ? fromToken.role
        : user
          ? await conversationRole(user.id, input.requestId)
          : null;
    if (!role) {
      return NextResponse.json({ error: "Dieses Gespräch gehört nicht zu Ihnen." }, { status: 404 });
    }

    const result = await answerConversation(input.requestId, role, input.answer, SITE_URL);
    await writeAuditEvent({
      actorUserId: user?.id ?? null,
      action: "placement_outcome_reported",
      targetType: "intro_booking",
      targetId: result.requestId,
      outcome: "success",
      metadata: {
        role,
        answer: input.answer,
        recorded: result.recorded,
        clientUserId: result.clientUserId,
        via: fromToken ? "link" : "conversations",
      },
    });
    return NextResponse.json({ recorded: result.recorded });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Ungültige Antwort." }, { status: 400 });
    }
    return NextResponse.json({ error: "Die Antwort konnte gerade nicht gespeichert werden." }, { status: 503 });
  }
}
