import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  deleteOwnedFreelancerProfile,
  loadFreelancerPortalState,
  updateOwnedFreelancerProfile,
} from "@/lib/freelancer/profile-data";
import { FreelancerProfileUpdateSchema } from "@/lib/freelancer/portal";
import {
  assertSameOrigin,
  readJsonWithLimit,
} from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requirePermanentFreelancer() {
  const user = await requireCurrentUser();
  if (user.isAnonymous) {
    throw new Response("Ein dauerhaftes Konto ist erforderlich.", {
      status: 403,
    });
  }
  return user;
}
export async function GET() {
  try {
    const user = await requirePermanentFreelancer();
    return NextResponse.json(await loadFreelancerPortalState(user.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Das Freelancer-Profil konnte nicht geladen werden." },
      { status: 503 },
    );
  }
}

export async function PATCH(request: Request) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);
    const user = await requirePermanentFreelancer();
    const parsed = FreelancerProfileUpdateSchema.safeParse(
      await readJsonWithLimit(request, 24_000),
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Bitte prüfen Sie die markierten Felder.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    const profile = await updateOwnedFreelancerProfile(user.id, parsed.data);
    await writeAuditEvent({
      actorUserId: user.id,
      action: "freelancer_profile_updated",
      targetType: "freelancer_profile",
      targetId: profile.id,
      outcome: "success",
      traceId,
      metadata: {
        profileStatus: profile.profileStatus,
        version: profile.version,
      },
    });
    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Das Profil konnte nicht gespeichert werden." },
      { status: 503 },
    );
  }
}

const DeleteConfirmationSchema = z
  .object({ confirmation: z.literal("PROFIL LÖSCHEN") })
  .strict();

export async function DELETE(request: Request) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);
    const user = await requirePermanentFreelancer();
    const parsed = DeleteConfirmationSchema.safeParse(
      await readJsonWithLimit(request, 1_000),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Bitte bestätigen Sie die Profil-Löschung vollständig." },
        { status: 400 },
      );
    }

    const deleted = await deleteOwnedFreelancerProfile(user.id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Profil nicht gefunden." },
        { status: 404 },
      );
    }
    await writeAuditEvent({
      actorUserId: user.id,
      action: "freelancer_profile_deleted",
      targetType: "freelancer_profile",
      outcome: "success",
      traceId,
      metadata: { storageRemoved: true },
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      {
        error:
          "Das Profil wurde sicher ausgeblendet, konnte aber noch nicht vollständig gelöscht werden. Bitte erneut versuchen.",
      },
      { status: 503 },
    );
  }
}
