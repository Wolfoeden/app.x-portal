import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  canSaveFreelancers,
  loadSavedFreelancers,
  removeSavedFreelancer,
  saveFreelancer,
} from "@/lib/data/saved-freelancers";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";

export const dynamic = "force-dynamic";

const FreelancerIdSchema = z
  .object({
    freelancerId: z
      .string()
      .trim()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu),
  })
  .strict();

/** Guests get an empty team and a 403, never a row they could not read back. */
const ACCOUNT_REQUIRED = {
  error: "Für „Mein Team“ ist ein Konto erforderlich.",
  reason: "account_required" as const,
};

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!canSaveFreelancers(user)) {
      return NextResponse.json(
        { team: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { team: await loadSavedFreelancers(user) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Ihr Team konnte nicht geladen werden." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (!canSaveFreelancers(user)) {
      return NextResponse.json(ACCOUNT_REQUIRED, { status: 403 });
    }
    const input = FreelancerIdSchema.parse(await readJsonWithLimit(request, 2_000));
    await saveFreelancer(user, input.freelancerId);
    await writeAuditEvent({
      actorUserId: user.id,
      action: "freelancer_saved",
      targetType: "freelancer_profile",
      targetId: input.freelancerId,
      outcome: "success",
    });
    return NextResponse.json(
      { team: await loadSavedFreelancers(user) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Ungültiges Profil." }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Das Profil konnte nicht gemerkt werden." },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (!canSaveFreelancers(user)) {
      return NextResponse.json(ACCOUNT_REQUIRED, { status: 403 });
    }
    const input = FreelancerIdSchema.parse(await readJsonWithLimit(request, 2_000));
    await removeSavedFreelancer(user, input.freelancerId);
    await writeAuditEvent({
      actorUserId: user.id,
      action: "freelancer_unsaved",
      targetType: "freelancer_profile",
      targetId: input.freelancerId,
      outcome: "success",
    });
    return NextResponse.json({ team: await loadSavedFreelancers(user) });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Ungültiges Profil." }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Das Profil konnte nicht entfernt werden." },
      { status: 503 },
    );
  }
}
