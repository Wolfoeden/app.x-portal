import { z } from "zod";

import { recordFreelancerProfileEvent } from "@/lib/freelancer/profile-data";
import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
  readJsonWithLimit,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ImpressionSchema = z
  .object({
    eventKey: z.string().uuid(),
    profileId: z.string().uuid(),
    eventType: z.literal("profile_view"),
    source: z.literal("profile_card"),
  })
  .strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ipHash = pseudonymizeIp(getClientIp(request));
    const limit = await consumeRateLimit(
      `freelancer-view:${ipHash}`,
      120,
      60 * 60_000,
    );
    if (!limit.allowed) {
      return new Response(null, {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      });
    }
    const parsed = ImpressionSchema.safeParse(
      await readJsonWithLimit(request, 1_000),
    );
    if (!parsed.success) return new Response(null, { status: 400 });
    const recorded = await recordFreelancerProfileEvent(parsed.data);
    return new Response(null, { status: recorded ? 204 : 202 });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response(null, { status: 503 });
  }
}
