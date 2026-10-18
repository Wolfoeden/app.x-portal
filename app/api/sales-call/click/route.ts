import { NextRequest } from "next/server";

import { writeAuditEvent } from "@/lib/audit/write";
import { isSalesCallEntry } from "@/lib/sales/sales-call-model";
import { assertSameOrigin, getClientIp, pseudonymizeIp } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ein Klick auf „Erstgespräch buchen“ (Kopf, Menü, Fußzeile, Startseite,
 * Kontaktseite). Der Link öffnet den Kalender selbst; hier wird nur gezählt,
 * wie früher in /contact/termin: „Kalender geöffnet“ mit der Herkunft.
 * Keine Namen, keine Adressen.
 *
 * Antwortet immer mit 204: Der Browser wartet nicht darauf, und eine
 * unbekannte Herkunft wird nicht gezählt.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = (await request.json().catch(() => null)) as { von?: unknown } | null;
    const via = body?.von;
    if (!isSalesCallEntry(via)) return new Response(null, { status: 204 });

    const limit = await consumeRateLimit(`sales-call-click:${pseudonymizeIp(getClientIp(request))}`, 30, 60 * 60_000);
    if (!limit.allowed) return new Response(null, { status: 204 });

    await writeAuditEvent({
      actorUserId: null,
      action: "sales_call_calendar_opened",
      targetType: "crm_contacts",
      targetId: null,
      outcome: "success",
      metadata: { prefilled: false, via },
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response(null, { status: 204 });
  }
}
