import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  PROFILE_FEEDBACK_ACTIONS,
  PROFILE_FEEDBACK_REASONS,
} from "@/lib/freelancer/profile-feedback";
import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
  readJsonWithLimit,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * „Passt nicht" und das Zurücknehmen davon.
 *
 * Gespeichert wird nur, welches Profil aus welchem Grund nicht passte — kein
 * Projekttext, kein Brief. Das Protokoll ist der Ort dafür, weil es genau das
 * festhält: wer (Konto oder Gast), was, wann. Die Admin-Ansicht zählt je
 * Profil und Grund; ein Zurücknehmen hebt einen Eintrag auf.
 */
const FeedbackSchema = z
  .object({
    profileId: z.string().uuid(),
    reason: z.enum(PROFILE_FEEDBACK_REASONS),
    kind: z.enum(["unsuitable", "withdrawn"]),
  })
  .strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const limit = await consumeRateLimit(
      `profile-feedback:${pseudonymizeIp(getClientIp(request))}`,
      60,
      60 * 60_000,
    );
    if (!limit.allowed) {
      return new Response(null, {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      });
    }
    const parsed = FeedbackSchema.safeParse(await readJsonWithLimit(request, 1_000));
    if (!parsed.success) return new Response(null, { status: 400 });

    await writeAuditEvent({
      actorUserId: user.id,
      action: PROFILE_FEEDBACK_ACTIONS[parsed.data.kind],
      targetType: "freelancer_profile",
      targetId: parsed.data.profileId,
      outcome: "success",
      metadata: { reason: parsed.data.reason },
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response(null, { status: 503 });
  }
}
