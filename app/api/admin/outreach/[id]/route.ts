import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import { discardOutreachDraft } from "@/lib/leadgen/leads-data";
import { assertSameOrigin } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().uuid() });

/**
 * Einen wartenden Entwurf verwerfen, damit er nicht mehr unter „Wartet“
 * steht. Ein noch vorhandener Lead wird dabei abgelegt.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const traceId = randomUUID();
  try {
    const admin = await requireAdminUser();
    assertSameOrigin(request);

    const params = ParamsSchema.safeParse(await context.params);
    if (!params.success) {
      return NextResponse.json({ error: "Unbekannter Entwurf." }, { status: 400 });
    }

    const result = await discardOutreachDraft(params.data.id);
    if (!result.discarded) {
      return NextResponse.json(
        { error: "Dieser Entwurf wartet nicht mehr auf den Versand." },
        { status: 404 },
      );
    }

    await writeAuditEvent({
      actorUserId: admin.id,
      action: "leadgen_draft_discarded",
      targetType: "leadgen_outreach",
      targetId: params.data.id,
      outcome: "success",
      traceId,
      metadata: { leadArchived: result.leadId !== null },
    }).catch(() => undefined);

    return NextResponse.json({ discarded: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Der Entwurf konnte nicht verworfen werden." },
      { status: 503 },
    );
  }
}
