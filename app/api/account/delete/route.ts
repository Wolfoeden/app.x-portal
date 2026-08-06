import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { assertSameOrigin } from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      throw new Response("Serverkonfiguration unvollständig.", { status: 503 });
    }
    const admin = createAdminSupabaseClient();
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
