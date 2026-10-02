import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminUser } from "@/lib/auth/current-user";
import { MANDATE_STATUSES } from "@/lib/placement/mandate-model";
import { assignFreelancer, updateMandateStatus } from "@/lib/placement/mandates";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Arbeit an einem Suchauftrag: Stand setzen oder einen Freelancer zuordnen.
 * Eine Zuordnung legt eine Anfrage an, die unter „Vermittlungen“ wie jede
 * andere vorgestellt wird.
 */

const NO_STORE = { "Cache-Control": "private, no-store" };

const PatchSchema = z.union([
  z.object({ status: z.enum(MANDATE_STATUSES) }).strict(),
  z.object({ assignProfileId: z.string().uuid() }).strict(),
]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);
    const admin = await requireAdminUser();
    const id = z.string().uuid().parse((await context.params).id);
    const patch = PatchSchema.parse(await readJsonWithLimit(request, 2_000));

    if ("assignProfileId" in patch) {
      const result = await assignFreelancer(id, patch.assignProfileId, admin.id);
      return NextResponse.json({ ...result, traceId }, { headers: NO_STORE });
    }
    const updated = await updateMandateStatus(id, patch.status, admin.id);
    if (!updated) {
      return NextResponse.json({ error: "Suchauftrag nicht gefunden.", traceId }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json({ status: patch.status, traceId }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Die Angaben sind ungültig.", traceId }, { status: 400, headers: NO_STORE });
    }
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "Zu diesem Projekt ist schon ein anderer Suchauftrag offen.", traceId },
        { status: 409, headers: NO_STORE },
      );
    }
    console.error("search mandate update failed", traceId, error);
    return NextResponse.json({ error: "Der Suchauftrag konnte nicht gespeichert werden.", traceId }, { status: 500, headers: NO_STORE });
  }
}
