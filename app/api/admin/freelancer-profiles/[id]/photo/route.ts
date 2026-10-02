import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { attachAdminAvatar, removeAdminAvatar } from "@/lib/admin/profile-admin";
import { requireAdminUser } from "@/lib/auth/current-user";
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from "@/lib/freelancer/avatar-limits";
import { AVATAR_BUCKET, mintAvatarObjectPath, signAvatarObjectPath } from "@/lib/freelancer/avatar-storage";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const IdSchema = z.string().uuid();

const TicketSchema = z
  .object({ mimeType: z.enum(AVATAR_MIME_TYPES), sizeBytes: z.number().int().positive().max(AVATAR_MAX_BYTES) })
  .strict();

const AttachSchema = z
  .object({
    path: z.string().trim().min(1).max(300),
    token: z.string().regex(/^[0-9a-f]{64}$/u),
    // Ohne dokumentierte Einwilligung setzt der Betreiber kein Foto.
    consent: z.literal(true, { error: "Bitte bestätigen, dass die Einwilligung vorliegt." }),
  })
  .strict();

function failure(error: unknown, traceId: string, fallback: string) {
  if (error instanceof Response) return error;
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? "Die Angaben sind ungültig.", traceId }, { status: 400, headers: NO_STORE });
  }
  console.error("admin photo failed", traceId, error);
  return NextResponse.json({ error: fallback, traceId }, { status: 500, headers: NO_STORE });
}

/** Upload-Ticket für ein Profilbild, das der Betreiber setzt. Nur Admins. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);
    await requireAdminUser();
    const id = IdSchema.parse((await context.params).id);
    const { mimeType } = TicketSchema.parse(await readJsonWithLimit(request, 2_000));
    const admin = createAdminSupabaseClient();
    const { data: profile, error: profileError } = await admin
      .from("freelancer_profiles")
      .select("id")
      .eq("id", id)
      .eq("demo_status", "real")
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return NextResponse.json({ error: "Profil nicht gefunden.", traceId }, { status: 404, headers: NO_STORE });

    const path = mintAvatarObjectPath(id, mimeType);
    const { data, error } = await admin.storage.from(AVATAR_BUCKET).createSignedUploadUrl(path);
    if (error) throw error;
    return NextResponse.json(
      { bucket: AVATAR_BUCKET, path, uploadToken: data.token, pathToken: signAvatarObjectPath(path), traceId },
      { headers: NO_STORE },
    );
  } catch (error) {
    return failure(error, traceId, "Der Bild-Upload konnte nicht vorbereitet werden.");
  }
}

/** Das hochgeladene Foto als Profilbild hinterlegen; mit Einwilligung und Protokoll. */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);
    const admin = await requireAdminUser();
    const id = IdSchema.parse((await context.params).id);
    const body = AttachSchema.parse(await readJsonWithLimit(request, 2_000));
    const avatarUrl = await attachAdminAvatar(id, body.path, body.token, admin.id);
    return NextResponse.json({ avatarUrl, traceId }, { headers: NO_STORE });
  } catch (error) {
    return failure(error, traceId, "Das Foto konnte nicht gespeichert werden.");
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);
    const admin = await requireAdminUser();
    const id = IdSchema.parse((await context.params).id);
    return NextResponse.json({ removed: await removeAdminAvatar(id, admin.id), traceId }, { headers: NO_STORE });
  } catch (error) {
    return failure(error, traceId, "Das Foto konnte nicht entfernt werden.");
  }
}
