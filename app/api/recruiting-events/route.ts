import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { parseConsent } from "@/lib/consent/consent";
import { CLIENT_RECRUITING_EVENTS, CAMPAIGN_SOURCES, RECRUITING_OUTCOMES } from "@/lib/analytics/recruiting-events";
import { recordRecruitingEvent } from "@/lib/analytics/recruiting-server";
import { assertSameOrigin, getClientIp, pseudonymizeIp, readJsonWithLimit } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";

export const dynamic = "force-dynamic";
const schema = z.object({
  event: z.enum(CLIENT_RECRUITING_EVENTS), sessionId: z.string().uuid(),
  entityId: z.string().regex(/^[a-zA-Z0-9_:.-]{1,160}$/u),
  source: z.enum(CAMPAIGN_SOURCES), outcome: z.enum(RECRUITING_OUTCOMES),
  plan: z.enum(["basic", "pro", "business"]).optional(),
}).strict();
const PUBLIC_EVENTS = new Set(["demo_viewed", "trial_cta_clicked", "technical_error"]);
export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    if (parseConsent(request.headers.get("cookie") ?? "") !== "all") return new Response(null, { status: 204 });
    const input = schema.safeParse(await readJsonWithLimit(request, 1500));
    if (!input.success) return new Response(null, { status: 400 });
    const limit = await consumeRateLimit(`recruiting-events:${pseudonymizeIp(getClientIp(request))}`, 120, 60 * 60_000);
    if (!limit.allowed) return new Response(null, { status: 429 });
    const user = await getCurrentUser();
    if (!user && !PUBLIC_EVENTS.has(input.data.event)) return new Response(null, { status: 401 });
    await recordRecruitingEvent({ ...input.data, userId: user?.id, isInternal: user?.isAdmin, origin: "client" });
    return new Response(null, { status: 204 });
  } catch (error) { return error instanceof Response ? error : new Response(null, { status: 503 }); }
}
