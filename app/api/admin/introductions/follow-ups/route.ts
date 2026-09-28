import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import { placementRequestsEnabled } from "@/lib/placement/config";
import { sendDueFollowUps } from "@/lib/placement/engagements";
import { assertSameOrigin } from "@/lib/security/request";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Die fälligen Nachfragen verschicken, per Knopf auf der Admin-Seite.
 *
 * Bewusst noch ohne Zeitgeber: Bei heutiger Menge ist ein Klick am Tag
 * genug, und der Betreiber sieht, was rausgeht. Ein Zeitgeber kann später
 * dieselbe Funktion aufrufen.
 */
export async function POST(request: Request) {
  if (!placementRequestsEnabled()) return new Response(null, { status: 404 });
  try {
    assertSameOrigin(request);
    const admin = await requireAdminUser();
    const result = await sendDueFollowUps(SITE_URL);
    await writeAuditEvent({
      actorUserId: admin.id,
      action: "placement_follow_ups_sent",
      targetType: "intro_booking",
      outcome: "success",
      metadata: result,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Die Nachfragen konnten gerade nicht verschickt werden." },
      { status: 503 },
    );
  }
}
