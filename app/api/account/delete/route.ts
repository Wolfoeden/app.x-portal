import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { deleteOwnedFreelancerProfile } from "@/lib/freelancer/profile-data";
import {
  assertSameOrigin,
  readJsonWithLimit,
} from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const ConfirmationSchema = z
  .object({ confirm: z.string().trim().min(1).max(200) })
  .strict();

/**
 * Was der Nutzer abtippen muss, wenn kein Konto mit E-Mail-Adresse dahinter
 * steht. Bei einem dauerhaften Konto ist es die eigene Adresse.
 */
export const GUEST_DELETE_PHRASE = "LÖSCHEN";

function expectedConfirmation(email: string | null): string {
  return email?.trim() ? email.trim().toLocaleLowerCase("en-US") : GUEST_DELETE_PHRASE;
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();

    // Ein Klick reicht für eine unumkehrbare Löschung nicht. Die Bestätigung
    // wird serverseitig geprüft, nicht nur im Dialog abgefragt: Ein offenes
    // fremdes Gerät oder ein eingeschleustes Skript käme sonst mit einer
    // einzigen Anfrage durch.
    const confirmation = ConfirmationSchema.safeParse(
      await readJsonWithLimit(request, 1_000),
    );
    const expected = expectedConfirmation(user.email);
    const provided = confirmation.success
      ? confirmation.data.confirm.trim().toLocaleLowerCase("en-US")
      : "";
    if (provided !== expected.toLocaleLowerCase("en-US")) {
      return NextResponse.json(
        {
          error: user.email
            ? "Bitte tippen Sie zur Bestätigung Ihre E-Mail-Adresse ein."
            : `Bitte tippen Sie zur Bestätigung ${GUEST_DELETE_PHRASE} ein.`,
        },
        { status: 400 },
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      throw new Response("Serverkonfiguration unvollständig.", { status: 503 });
    }
    const admin = createAdminSupabaseClient();
    // A freelancer profile is public professional data and must not become an
    // ownerless catalogue row when the associated auth account disappears.
    await deleteOwnedFreelancerProfile(user.id);
    const { error: preparationError } = await admin.rpc(
      "prepare_user_deletion",
      { p_user_id: user.id },
    );
    if (preparationError) throw preparationError;

    const { error: deletionError } = await admin.auth.admin.deleteUser(user.id);
    if (deletionError) throw deletionError;

    const response = NextResponse.json({ deleted: true });
    // Supabase may use multiple cookie names; expire all auth cookies without
    // echoing their values into a log or response body.
    for (const cookie of request.headers.get("cookie")?.split(";") ?? []) {
      const name = cookie.split("=", 1)[0]?.trim();
      if (name?.startsWith("sb-")) response.cookies.delete(name);
    }
    return response;
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Die Daten konnten nicht gelöscht werden." },
      { status: 503 },
    );
  }
}
