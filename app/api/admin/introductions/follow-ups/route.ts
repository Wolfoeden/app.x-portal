import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import { placementRequestsEnabled } from "@/lib/placement/config";
import { sendDueFollowUps } from "@/lib/placement/engagements";
import { assertSameOrigin } from "@/lib/security/request";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Wer die Hinweise auslöst: der tägliche Zeitplan mit seinem Geheimnis
 * (`x-placement-run-token`, siehe
 * `20261001100000_vermittlung_nachfassen_zeitplan.sql`) oder der Betreiber
 * per Knopf im Admin.
 */
async function actor(request: Request): Promise<string | null> {
  const expected = process.env.PLACEMENT_RUN_SECRET?.trim();
  const provided = request.headers.get("x-placement-run-token")?.trim();
  if (provided) {
    if (!expected || expected.length < 32 || !secretMatches(provided, expected)) {
      throw NextResponse.json({ error: "Ungültiges Token." }, { status: 401 });
    }
    return null;
  }
  // Nur der Browser-Weg schickt einen Ursprung mit.
  assertSameOrigin(request);
  const admin = await requireAdminUser();
  return admin.id;
}

/**
 * Die fälligen Hinweise verschicken: Die Frage, ob es zur Beauftragung kam,
 * steht in „Gespräche“; die Mail führt nur dorthin.
 */
export async function POST(request: Request) {
  if (!placementRequestsEnabled()) return new Response(null, { status: 404 });
  try {
    const actorUserId = await actor(request);
    const result = await sendDueFollowUps(SITE_URL);
    await writeAuditEvent({
      actorUserId,
      action: "placement_follow_ups_sent",
      targetType: "intro_booking",
      outcome: "success",
      metadata: { ...result, via: actorUserId ? "admin" : "scheduler" },
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
