import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { applicationExtrasAvailable } from "@/lib/freelancer/applications-data";
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from "@/lib/freelancer/avatar-limits";
import {
  AVATAR_BUCKET,
  mintApplicationPhotoPath,
  signApplicationPhotoPath,
} from "@/lib/freelancer/avatar-storage";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

const TicketSchema = z
  .object({
    mimeType: z.enum(AVATAR_MIME_TYPES),
    sizeBytes: z.number().int().positive().max(AVATAR_MAX_BYTES),
  })
  .strict();

/**
 * Ein Upload-Ticket für das freiwillige Foto im Bewerbungsformular.
 *
 * Wie beim Lebenslauf geht die Datei direkt zu Storage, unter `incoming/` —
 * außerhalb des Pfads, den die Bildroute ausliefert. Erst die Freigabe macht
 * daraus ein Profilbild. Das `pathToken` ist die Unterschrift des Servers
 * über den Pfad; ohne sie nimmt die Bewerbung kein Foto an.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (user.isAnonymous) {
      throw new Response("Ein dauerhaftes Konto ist erforderlich.", { status: 403 });
    }

    const limit = await consumeRateLimit(`freelancer-application-photo:${user.id}`, 10, 15 * 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Zu viele Uploads. Bitte später erneut versuchen." },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const parsed = TicketSchema.safeParse(await readJsonWithLimit(request, 2_000));
    if (!parsed.success) {
      return NextResponse.json({ error: "Erlaubt sind JPEG, PNG oder WebP bis 5 MB." }, { status: 400, headers: NO_STORE });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return NextResponse.json({ error: "Serverkonfiguration unvollständig." }, { status: 503, headers: NO_STORE });
    }

    const admin = createAdminSupabaseClient();
    // Ohne Spalte für das Foto würde es hochgeladen und nie gespeichert.
    if (!(await applicationExtrasAvailable(admin))) {
      return NextResponse.json({ error: "Fotos lassen sich gerade noch nicht hochladen." }, { status: 409, headers: NO_STORE });
    }

    const path = mintApplicationPhotoPath(parsed.data.mimeType);
    const { data, error } = await admin.storage.from(AVATAR_BUCKET).createSignedUploadUrl(path);
    if (error) throw error;

    return NextResponse.json(
      { bucket: AVATAR_BUCKET, path, uploadToken: data.token, pathToken: signApplicationPhotoPath(path) },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Der Foto-Upload konnte nicht vorbereitet werden." }, { status: 503, headers: NO_STORE });
  }
}
