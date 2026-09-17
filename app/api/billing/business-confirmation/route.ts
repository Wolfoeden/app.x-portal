import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { TERMS_VERSION } from "@/lib/legal/policy";
import { assertSameOrigin } from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stores the B2B declaration on the existing entitlement/account record. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (user.isAnonymous) {
      return NextResponse.json({ error: "Anmeldung erforderlich." }, { status: 403 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return NextResponse.json({ error: "Nicht verfügbar." }, { status: 503 });
    }

    const confirmedAt = new Date().toISOString();
    const { data, error } = await createAdminSupabaseClient()
      .from("user_ai_credit_accounts")
      .update({
        business_confirmed_at: confirmedAt,
        business_terms_version: TERMS_VERSION,
        updated_at: confirmedAt,
      })
      .eq("user_id", user.id)
      .eq("is_anonymous", false)
      .select("user_id")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: "Das Abrechnungskonto ist noch nicht bereit. Bitte neu laden." },
        { status: 409 },
      );
    }
    return NextResponse.json({ confirmed: true, termsVersion: TERMS_VERSION });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Die Unternehmerbestätigung konnte nicht gespeichert werden." },
      { status: 503 },
    );
  }
}
