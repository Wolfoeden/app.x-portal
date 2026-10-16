import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { normalizeEmail } from "@/lib/email/address";
import { deliverEmail } from "@/lib/email/deliver";
import { takeRateLimit } from "@/lib/security/rate-limit";
import { readJsonWithLimit } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MessageSchema = z.object({
  to: z.string().max(254),
  subject: z.string().trim().min(1).max(200).regex(/^[^\r\n]+$/u),
  text: z.string().trim().min(1).max(16_000),
  kind: z.enum(["transactional", "cold_outreach", "newsletter"]),
}).strict();

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

/** Server-to-server only: a separate token and explicit recipient grants. */
export async function POST(request: Request) {
  const expected = process.env.EMAIL_RELAY_TOKEN?.trim();
  if (!expected || expected.length < 32 || expected.length > 256) {
    return json({ error: "relay_not_configured" }, 503);
  }

  const authorization = request.headers.get("authorization");
  const provided = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return json({ error: "unauthorized" }, 401);
  }

  const recipients = process.env.EMAIL_RELAY_ALLOWED_RECIPIENTS?.split(",").map(normalizeEmail);
  if (!recipients?.length || recipients.some((address) => !address)) {
    return json({ error: "relay_recipients_not_configured" }, 503);
  }

  let raw: unknown;
  try {
    raw = await readJsonWithLimit(request, 70_000);
  } catch (error) {
    return json({ error: "invalid_request" }, error instanceof Response ? error.status : 400);
  }

  const input = MessageSchema.safeParse(raw);
  const recipient = input.success ? normalizeEmail(input.data.to) : null;
  if (!input.success || !recipient) return json({ error: "invalid_message" }, 400);
  if (!recipients.includes(recipient)) return json({ error: "recipient_not_allowed" }, 403);

  // Additional per-instance protection; recipient grants and the token are
  // the authorization boundary, not this in-memory limit.
  const limit = takeRateLimit("email-relay", 10);
  if (!limit.allowed) {
    return json({ error: "rate_limited" }, 429, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  try {
    const result = await deliverEmail({ ...input.data, to: recipient });
    if (result.delivered) return json({ accepted: true }, 200);
    // Do not return SMTP diagnostics or recipient information to the caller.
    return json({ accepted: false, error: result.reason }, 502);
  } catch {
    return json({ accepted: false, error: "delivery_failed" }, 502);
  }
}
