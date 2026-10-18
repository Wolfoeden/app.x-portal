import { NextRequest } from "next/server";

import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isContactTopicKey } from "@/lib/contact/topics";
import { isSalesCallEntry } from "@/lib/sales/sales-call-model";
import { assertSameOrigin, getClientIp, pseudonymizeIp } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ein Aufruf der Kontaktseite, gemeldet vom Browser (`ContactNotice`), seit
 * die Seite statisch aus dem CDN kommt (18.10.2026): „Kontaktseite
 * aufgerufen“ im Umsatzweg, mit Herkunft (`von`), Thema der Seite und ob
 * jemand angemeldet ist — wie vorher beim Rendern der Seite.
 *
 * Antwortet immer mit 204: Die Seite wartet nicht darauf.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = (await request.json().catch(() => null)) as { von?: unknown; thema?: unknown } | null;
    const via = body?.von;
    const topic = body?.thema;

    const limit = await consumeRateLimit(`sales-call-view:${pseudonymizeIp(getClientIp(request))}`, 60, 60 * 60_000);
    if (!limit.allowed) return new Response(null, { status: 204 });

    const user = await getCurrentUser().catch(() => null);
    await writeAuditEvent({
      actorUserId: user?.id ?? null,
      action: "sales_call_viewed",
      targetType: "sales_call",
      outcome: "success",
      metadata: {
        via: isSalesCallEntry(via) ? via : "direct",
        topic: isContactTopicKey(topic) ? topic : null,
        account: !user ? "none" : user.isAnonymous ? "guest" : "registered",
      },
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response(null, { status: 204 });
  }
}
