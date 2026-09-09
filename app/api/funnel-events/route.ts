import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
  readJsonWithLimit,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FunnelEventSchema = z.object({
  eventKey: z.string().uuid(),
  funnelId: z.string().uuid(),
  event: z.enum([
    "search_started",
    "result_seen",
    "registration_started",
    "signup_confirmed",
    "continuation_completed",
  ]),
  entry: z.enum(["direct", "recruiter"]),
  device: z.enum(["mobile", "desktop"]),
  outcome: z.string().trim().min(1).max(80).nullable(),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const ipHash = pseudonymizeIp(getClientIp(request));
    const limit = await consumeRateLimit(
      `signup-funnel:${ipHash}`,
      120,
      60 * 60_000,
    );
    if (!limit.allowed) {
      return new Response(null, {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      });
    }
    const parsed = FunnelEventSchema.safeParse(
      await readJsonWithLimit(request, 1_500),
    );
    if (!parsed.success) return new Response(null, { status: 400 });
    await writeAuditEvent({
      actorUserId: user.id,
      action: `signup_funnel_${parsed.data.event}`,
      targetType: "signup_funnel",
      targetId: parsed.data.eventKey,
      outcome: "success",
      metadata: {
        funnelId: parsed.data.funnelId,
        entry: parsed.data.entry,
        device: parsed.data.device,
        result: parsed.data.outcome,
        account: user.isAnonymous ? "guest" : "registered",
      },
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response(null, { status: 503 });
  }
}
