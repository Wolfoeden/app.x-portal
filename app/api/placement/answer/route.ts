import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { placementRequestsEnabled } from "@/lib/placement/config";
import { recordAnswer } from "@/lib/placement/engagements";
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

const AnswerSchema = z
  .object({
    token: z.string().trim().min(10).max(200),
    answer: z.enum(PLACEMENT_OUTCOMES),
  })
  .strict();

/**
 * Die Antwort auf „Kam es zur Zusammenarbeit?“.
 *
 * Ohne Anmeldung, weil der Link aus einer Mail kommt; der signierte Token
 * sagt, wer zu welcher Vorstellung antwortet. Nur per POST von der
 * Antwortseite, damit ein Mailprogramm, das Links vorab aufruft, nichts
 * auslöst.
 */
export async function POST(request: Request) {
  if (!placementRequestsEnabled()) return new Response(null, { status: 404 });
  try {
    assertSameOrigin(request);
    const limit = await consumeRateLimit(
      `placement-answer:${pseudonymizeIp(getClientIp(request))}`,
      30,
      60 * 60_000,
    );
    if (!limit.allowed) {
      return new Response(null, {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      });
    }
    const input = AnswerSchema.parse(await readJsonWithLimit(request, 1_000));
    const result = await recordAnswer(input.token, input.answer, SITE_URL);
    await writeAuditEvent({
      actorUserId: null,
      action: "placement_outcome_reported",
      targetType: "intro_booking",
      targetId: result.requestId,
      outcome: "success",
      metadata: {
        role: result.role,
        answer: input.answer,
        recorded: result.recorded,
        clientUserId: result.clientUserId,
      },
    });
    return NextResponse.json({ recorded: result.recorded });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Ungültige Antwort." }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Die Antwort konnte gerade nicht gespeichert werden." },
      { status: 503 },
    );
  }
}
