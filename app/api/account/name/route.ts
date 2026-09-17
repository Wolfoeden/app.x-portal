import { NextResponse } from "next/server";
import { z } from "zod";

import { ACCOUNT_NAME_MAX_LENGTH } from "@/lib/auth/account-name";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const NameSchema = z
  .object({ name: z.string().trim().max(ACCOUNT_NAME_MAX_LENGTH) })
  .strict();

/**
 * Setzt den Namen, mit dem der Arbeitsbereich ein Konto anspricht. Ein leerer
 * Name entfernt ihn wieder.
 *
 * Geschrieben wird mit der Sitzung des Nutzers, nicht mit dem Service-Schlüssel.
 * Der Name steht erst im nächsten Zugriffstoken; der Browser erneuert die
 * Sitzung deshalb direkt nach dieser Anfrage.
 */
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (user.isAnonymous) {
      return NextResponse.json(
        { error: "Ein Name lässt sich nur für ein Konto speichern." },
        { status: 403 },
      );
    }

    const parsed = NameSchema.safeParse(await readJsonWithLimit(request, 1_000));
    if (!parsed.success) {
      return NextResponse.json(
        { error: `Bitte geben Sie höchstens ${ACCOUNT_NAME_MAX_LENGTH} Zeichen ein.` },
        { status: 400 },
      );
    }

    const displayName = parsed.data.name || null;
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayName },
    });
    if (error) throw error;

    return NextResponse.json({ displayName });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Der Name konnte nicht gespeichert werden." },
      { status: 503 },
    );
  }
}
