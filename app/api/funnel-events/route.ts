import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
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
    "pricing_viewed",
  ]),
  entry: z.enum(["direct", "recruiter"]),
  device: z.enum(["mobile", "desktop"]),
  outcome: z.string().trim().min(1).max(80).nullable(),
}).strict();

/**
 * Die Preisseite ist die einzige Stufe, die ohne Sitzung erreichbar ist: Wer
 * von der Startseite kommt, hat noch keinen Gastzugang. Nur sie wird deshalb
 * auch ohne Sitzung gezählt; alle anderen Stufen setzen eine voraus.
 */
const EVENTS_WITHOUT_SESSION = new Set(["pricing_viewed"]);

/** Ohne Sitzung zählt nur, was die Preisseite selbst sendet. */
const PRICING_REASONS = new Set(["recherche", "guthaben", "direkt"]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
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
    if (!user && !EVENTS_WITHOUT_SESSION.has(parsed.data.event)) {
      return new Response(null, { status: 401 });
    }
    if (
      parsed.data.event === "pricing_viewed" &&
      !PRICING_REASONS.has(parsed.data.outcome ?? "")
    ) {
      return new Response(null, { status: 400 });
    }
    await writeAuditEvent({
      actorUserId: user?.id ?? null,
      action: `signup_funnel_${parsed.data.event}`,
      targetType: "signup_funnel",
      targetId: parsed.data.eventKey,
      outcome: "success",
      metadata: {
        funnelId: parsed.data.funnelId,
        entry: parsed.data.entry,
        device: parsed.data.device,
        result: parsed.data.outcome,
        account: !user ? "none" : user.isAnonymous ? "guest" : "registered",
      },
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response(null, { status: 503 });
  }
}
