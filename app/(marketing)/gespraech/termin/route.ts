import { NextResponse } from "next/server";

import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import { SALES_CALL_PATH, salesCalendarUrl } from "@/lib/sales/sales-call-model";
import { readSalesCallToken, salesCallPrefill, salesCallUrl } from "@/lib/sales/sales-call";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Der Kalender in einem eigenen Fenster: für Kalenderdienste, die die Seite
 * nicht einbetten darf, und als Ausweg unter dem eingebetteten Kalender.
 * Zählt den Klick und leitet zum Kalender weiter, vorausgefüllt mit Name,
 * Adresse und gesuchter Rolle aus der Anfrage. Ohne gültiges Token geht es zum Kalender ohne Vorbelegung,
 * ohne eingerichteten Kalender zurück zur Seite.
 */
export async function GET(request: Request) {
  const base = salesCallUrl();
  if (!base) return NextResponse.redirect(new URL(appPath(SALES_CALL_PATH), request.url), 303);

  const contactId = readSalesCallToken(new URL(request.url).searchParams.get("t"));
  const prefill = await salesCallPrefill(contactId);

  await writeAuditEvent({
    actorUserId: null,
    action: "sales_call_calendar_opened",
    targetType: "crm_contacts",
    targetId: contactId,
    outcome: "success",
    metadata: { prefilled: Boolean(prefill), embedded: false },
  }).catch(() => undefined);

  return NextResponse.redirect(salesCalendarUrl(base, prefill) ?? base, 303);
}
