import { NextResponse } from "next/server";

import { appPath } from "@/lib/app-path";
import { writeAuditEvent } from "@/lib/audit/write";
import { SALES_CALL_PATH, salesCalendarUrl } from "@/lib/sales/sales-call-model";
import { readSalesCallToken, salesCallUrl } from "@/lib/sales/sales-call";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * „Termin wählen“ auf der Danke-Seite: zählt den Klick und leitet zum
 * Kalender weiter, vorausgefüllt mit Name, Adresse und gesuchter Rolle aus
 * der Anfrage. Ohne gültiges Token geht es zum Kalender ohne Vorbelegung,
 * ohne eingerichteten Kalender zurück zur Seite.
 */
export async function GET(request: Request) {
  const base = salesCallUrl();
  if (!base) return NextResponse.redirect(new URL(appPath(SALES_CALL_PATH), request.url), 303);

  const contactId = readSalesCallToken(new URL(request.url).searchParams.get("t"));
  let prefill: { fullName: string; email: string | null; role: string | null } | undefined;
  if (contactId) {
    try {
      const { data } = await createAdminSupabaseClient()
        .from("crm_contacts")
        .select("contact_name,email,focus")
        .eq("id", contactId)
        .maybeSingle();
      const row = data as { contact_name: string | null; email: string | null; focus: string | null } | null;
      if (row?.contact_name) prefill = { fullName: row.contact_name, email: row.email, role: row.focus };
    } catch {
      // Ohne Vorbelegung geht es trotzdem weiter: der Termin ist wichtiger.
    }
  }

  await writeAuditEvent({
    actorUserId: null,
    action: "sales_call_calendar_opened",
    targetType: "crm_contacts",
    targetId: contactId,
    outcome: "success",
    metadata: { prefilled: Boolean(prefill) },
  }).catch(() => undefined);

  return NextResponse.redirect(salesCalendarUrl(base, prefill) ?? base, 303);
}
