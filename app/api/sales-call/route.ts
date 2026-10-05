import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import { contactInbox } from "@/lib/contact/messages";
import { recordInboundLead } from "@/lib/crm/contacts-data";
import { berlinToday } from "@/lib/crm/contacts-model";
import { deliverEmail } from "@/lib/email/deliver";
import {
  SALES_CALL_KIND,
  SALES_CALL_PATH,
  SALES_CALL_SOURCE,
  SalesCallSchema,
  salesCalendarUrl,
  salesCallAcknowledgementMessage,
  salesCallFromForm,
  salesCallNote,
  salesCallNotificationMessage,
} from "@/lib/sales/sales-call-model";
import { mintSalesCallToken, salesCallUrl } from "@/lib/sales/sales-call";
import { assertSameOrigin, getClientIp, logEvent, pseudonymizeIp } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60_000;

type Status = "sent" | "invalid" | "limited" | "error";

/**
 * „Gespräch buchen“: das Formular auf /gespraech.
 *
 * Ein gewöhnliches Formular mit 303-Weiterleitung, wie das Kontaktformular —
 * der Weg zum Vertrieb soll nicht davon abhängen, dass JavaScript lädt, und
 * kostet so kein Byte im Client. Gespeichert wird als Kontakt im CRM mit
 * Wiedervorlage heute; der Betreiber bekommt eine Mail, der Absender eine
 * Bestätigung mit dem Kalenderlink.
 */
function back(request: Request, status: Status, token?: string | null): NextResponse {
  const url = new URL(appPath(SALES_CALL_PATH), request.url);
  url.searchParams.set("status", status);
  if (token) url.searchParams.set("t", token);
  url.hash = status === "sent" ? "termin" : "formular";
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > 16_000) {
      return new Response("Request body too large", { status: 413 });
    }

    const parsed = SalesCallSchema.safeParse(salesCallFromForm(await request.formData()));
    if (!parsed.success) {
      logEvent("sales_call_rejected", { reason: "invalid_form" });
      return back(request, "invalid");
    }
    const input = parsed.data;

    // Ein Bot im Honigtopf bekommt dieselbe Antwort wie ein Mensch; gespeichert
    // und verschickt wird nichts.
    if (input.website) return back(request, "sent");

    const ipHash = pseudonymizeIp(getClientIp(request));
    const [byIp, byEmail] = await Promise.all([
      consumeRateLimit(`sales-call:ip:${ipHash}`, 5, DAY_MS),
      consumeRateLimit(`sales-call:email:${pseudonymizeIp(input.email)}`, 3, DAY_MS),
    ]);
    if (!byIp.allowed || !byEmail.allowed) {
      logEvent("sales_call_rejected", { reason: "rate_limited" });
      return back(request, "limited");
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return back(request, "error");

    const lead = await recordInboundLead(
      {
        company: input.company,
        contactName: input.fullName,
        roleTitle: null,
        kind: SALES_CALL_KIND,
        region: null,
        focus: input.role,
        email: input.email,
        emailKind: "personal",
        emailSourceUrl: null,
        projectUrl: null,
        note: salesCallNote(input),
      },
      {
        source: SALES_CALL_SOURCE,
        today: berlinToday(),
        eventBody: `Gesprächsanfrage über die Website\n${salesCallNote(input)}`,
      },
    );

    // Erst gespeichert, dann verschickt. Ein gescheiterter Versand macht die
    // Anfrage nicht ungültig: Sie steht im CRM mit Wiedervorlage heute.
    const calendar = salesCalendarUrl(salesCallUrl(), {
      fullName: input.fullName,
      email: input.email,
      role: input.role,
    });
    const [notification, acknowledgement] = await Promise.all([
      deliverEmail({
        to: contactInbox(),
        ...salesCallNotificationMessage(input, {
          contactUrl: `${SITE_URL}${appPath(`/chat/admin/kontakte/${lead.id}`)}`,
        }),
        kind: "transactional",
      }),
      deliverEmail({
        to: input.email,
        ...salesCallAcknowledgementMessage(input, calendar),
        kind: "transactional",
      }),
    ]);

    await writeAuditEvent({
      actorUserId: null,
      action: "sales_call_requested",
      targetType: "crm_contacts",
      targetId: lead.id,
      outcome: "success",
      traceId,
      metadata: {
        created: lead.created,
        phone: Boolean(input.phone),
        calendar: Boolean(calendar),
        notified: notification.delivered,
        acknowledged: acknowledgement.delivered,
      },
    });

    return back(request, "sent", mintSalesCallToken(lead.id));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("sales call failed", traceId, error);
    await writeAuditEvent({
      actorUserId: null,
      action: "sales_call_failed",
      targetType: "crm_contacts",
      outcome: "failed",
      traceId,
    }).catch(() => undefined);
    return back(request, "error");
  }
}
