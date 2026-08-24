import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
} from "@/lib/freelancer/avatar-limits";
import {
  AVATAR_BUCKET,
  mintAvatarObjectPath,
  signAvatarObjectPath,
} from "@/lib/freelancer/avatar-storage";
import { takeRateLimit } from "@/lib/security/rate-limit";
import {
  assertSameOrigin,
  readJsonWithLimit,
} from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TicketSchema = z
  .object({
    profileId: z.string().uuid(),
    mimeType: z.enum(AVATAR_MIME_TYPES),
    sizeBytes: z.number().int().positive().max(AVATAR_MAX_BYTES),
  })
  .strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (user.isAnonymous) {
      throw new Response("Ein dauerhaftes Konto ist erforderlich.", {
        status: 403,
      });
    }
    const limit = takeRateLimit(`freelancer-avatar:${user.id}`, 10, 15 * 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Zu viele Uploads. Bitte später erneut versuchen." },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        },
      );
    }

    const parsed = TicketSchema.safeParse(
      await readJsonWithLimit(request, 2_000),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Erlaubt sind JPEG, PNG oder WebP bis 5 MB." },
        { status: 400 },
      );
    }

    const admin = createAdminSupabaseClient();
    const { data: profile, error: profileError } = await admin
      .from("freelancer_profiles")
      .select("id")
      .eq("id", parsed.data.profileId)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) {
      return NextResponse.json(
        { error: "Profil nicht gefunden." },
        { status: 404 },
      );
    }

    const path = mintAvatarObjectPath(
      parsed.data.profileId,
      parsed.data.mimeType,
    );
    const { data, error } = await admin.storage
      .from(AVATAR_BUCKET)
      .createSignedUploadUrl(path);
    if (error) throw error;

    return NextResponse.json(
      {
        bucket: AVATAR_BUCKET,
        path,
        uploadToken: data.token,
        pathToken: signAvatarObjectPath(path),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Der Bild-Upload konnte nicht vorbereitet werden." },
      { status: 503 },
    );
  }
}
