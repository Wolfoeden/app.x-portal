import { NextRequest } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isPraxisInterest, PRAXIS_INTERESTS } from "@/lib/marketing/praxis-cases";
import { readPraxisToken } from "@/lib/sales/praxis";
import { assertSameOrigin, getClientIp, pseudonymizeIp } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EventSchema = z.object({
  t: z.string().max(200).nullish(),
  kind: z.enum(["interest", "calendar"]),
  interests: z.array(z.string()).max(PRAXIS_INTERESTS.length).default([]),
  slot: z.boolean().optional(),
});

/**
 * Was auf der Praxisseite (/praxis) angeklickt wird: „Das will ich auch“
 * (welche Beispiele, als Schlüssel) und das Öffnen des Kalenders. Mit
 * gültigem Kürzel aus dem Mail-Link dem CRM-Kontakt zugeordnet, sonst ohne
 * Zuordnung. Keine Namen, keine Adressen — die tippt der Besucher erst im
 * Kalender ein.
 *
 * Antwortet immer mit 204, auch bei Unsinn: Die Seite wartet nicht darauf,
 * und eine Fehlermeldung hilft niemandem, der nur klicken wollte.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const parsed = EventSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return new Response(null, { status: 204 });

    const limit = await consumeRateLimit(`praxis:${pseudonymizeIp(getClientIp(request))}`, 60, 60 * 60_000);
    if (!limit.allowed) return new Response(null, { status: 204 });

    // Der Betreiber, der seine eigene Seite ausprobiert, zählt nicht.
    if ((await getCurrentUser().catch(() => null))?.isAdmin) return new Response(null, { status: 204 });

    const contactId = readPraxisToken(parsed.data.t);
    const interests = [...new Set(parsed.data.interests.filter(isPraxisInterest))].join(",") || null;
    if (parsed.data.kind === "interest") {
      await writeAuditEvent({
        actorUserId: null,
        action: "praxis_interest",
        targetType: "crm_contacts",
        targetId: contactId,
        outcome: "success",
        metadata: { interests, linked: Boolean(contactId) },
      });
    } else {
      await writeAuditEvent({
        actorUserId: null,
        action: "sales_call_calendar_opened",
        targetType: "crm_contacts",
        targetId: contactId,
        outcome: "success",
        metadata: { via: "praxis", slot: Boolean(parsed.data.slot), interests, prefilled: false },
      });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response(null, { status: 204 });
  }
}
