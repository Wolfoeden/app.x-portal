import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  attachOwnedAvatar,
  removeOwnedAvatar,
} from "@/lib/freelancer/profile-data";
import {
  assertSameOrigin,
  readJsonWithLimit,
} from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AttachSchema = z
  .object({
    profileId: z.string().uuid(),
    path: z.string().trim().min(1).max(300),
    token: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict();

async function permanentUser() {
  const user = await requireCurrentUser();
  if (user.isAnonymous) {
    throw new Response("Ein dauerhaftes Konto ist erforderlich.", {
      status: 403,
    });
  }
  return user;
}
export async function POST(request: Request) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);
    const user = await permanentUser();
    const parsed = AttachSchema.safeParse(
      await readJsonWithLimit(request, 2_000),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Der Bild-Upload ist ungültig." },
        { status: 400 },
      );
    }
    const avatarUrl = await attachOwnedAvatar({
      userId: user.id,
      profileId: parsed.data.profileId,
      objectPath: parsed.data.path,
      token: parsed.data.token,
    });
    await writeAuditEvent({
      actorUserId: user.id,
      action: "freelancer_avatar_updated",
      targetType: "freelancer_profile",
      targetId: parsed.data.profileId,
      outcome: "success",
      traceId,
    });
    return NextResponse.json({ avatarUrl });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Das Profilbild konnte nicht gespeichert werden." },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await permanentUser();
    return NextResponse.json({ removed: await removeOwnedAvatar(user.id) });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Das Profilbild konnte nicht entfernt werden." },
      { status: 503 },
    );
  }
}
