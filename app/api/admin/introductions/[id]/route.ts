import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import { placementRequestsEnabled } from "@/lib/placement/config";
import {
  approvePlacementRequest,
  declinePlacementRequest,
} from "@/lib/placement/requests";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }).strict(),
  z
    .object({
      action: z.literal("decline"),
      reason: z
        .string()
        .trim()
        .max(300)
        .nullish()
        .transform((value) => value || null),
    })
    .strict(),
]);

/**
 * Der Betreiber stellt vor oder lehnt ab.
 *
 * Vorstellen setzt die Anfrage auf „vorgestellt“, gibt den Kalender frei und
 * schreibt beiden Seiten. Die Antwort sagt, ob der Freelancer eine Mail
 * bekommen hat; ohne Adresse im System muss der Betreiber ihn selbst
 * informieren, und die Admin-Seite sagt das.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!placementRequestsEnabled()) return new Response(null, { status: 404 });
  try {
    assertSameOrigin(request);
    const [{ id: rawId }, admin] = await Promise.all([context.params, requireAdminUser()]);
    const id = z.string().uuid().parse(rawId);
    const input = ActionSchema.parse(await readJsonWithLimit(request, 1_000));

    if (input.action === "approve") {
      const result = await approvePlacementRequest(id, SITE_URL);
      await writeAuditEvent({
        actorUserId: admin.id,
        action: "placement_introduced",
        targetType: "intro_booking",
        targetId: id,
        outcome: "success",
        metadata: result,
      });
      return NextResponse.json(result);
    }

    const result = await declinePlacementRequest(id, input.reason, SITE_URL);
    await writeAuditEvent({
      actorUserId: admin.id,
      action: "placement_declined",
      targetType: "intro_booking",
      targetId: id,
      outcome: "success",
      metadata: { ...result, withReason: Boolean(input.reason) },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Ungültige Aktion." }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Die Anfrage konnte gerade nicht bearbeitet werden." },
      { status: 503 },
    );
  }
}
