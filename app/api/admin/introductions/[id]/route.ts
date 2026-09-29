import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import { placementRequestsEnabled } from "@/lib/placement/config";
import {
  recordEngagement,
  recordFeeStatus,
  recordNoEngagement,
} from "@/lib/placement/engagements";
import {
  approvePlacementRequest,
  declinePlacementRequest,
} from "@/lib/placement/requests";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

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
  z
    .object({
      action: z.literal("record_engagement"),
      /** Tagessatz in Euro, netto. */
      dayRate: z.number().positive().max(20_000),
      /** Projekttage in den ersten drei Monaten. */
      projectDays: z.number().int().min(1).max(400),
      startsOn: z.string().regex(ISO_DATE),
    })
    .strict(),
  z.object({ action: z.literal("no_engagement") }).strict(),
  z.object({ action: z.literal("invoiced"), reference: z.string().trim().min(1).max(120) }).strict(),
  z.object({ action: z.literal("paid") }).strict(),
]);

/**
 * Was der Betreiber mit einer Vermittlung tut: vorstellen oder ablehnen,
 * danach die Beauftragung erfassen (daraus das Honorar), Rechnung und
 * Zahlung festhalten. Jeder Schritt steht im Protokoll, mit dem Konto des
 * Kunden, damit der Umsatztrichter interne Tests herausrechnen kann.
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
    const audit = (action: string, metadata: Record<string, string | number | boolean | null>) =>
      writeAuditEvent({
        actorUserId: admin.id,
        action,
        targetType: "intro_booking",
        targetId: id,
        outcome: "success",
        metadata,
      });

    switch (input.action) {
      case "approve": {
        const result = await approvePlacementRequest(id, SITE_URL);
        await audit("placement_introduced", result);
        return NextResponse.json(result);
      }
      case "decline": {
        const result = await declinePlacementRequest(id, input.reason, SITE_URL);
        await audit("placement_declined", { ...result, withReason: Boolean(input.reason) });
        return NextResponse.json(result);
      }
      case "record_engagement": {
        const dayRateMinor = Math.round(input.dayRate * 100);
        const result = await recordEngagement(id, {
          dayRateMinor,
          projectDays: input.projectDays,
          startsOn: input.startsOn,
        });
        await audit("placement_engaged", {
          clientUserId: result.clientUserId,
          feeMinor: result.feeMinor,
          dayRateMinor,
          projectDays: input.projectDays,
          termsVersion: result.termsVersion,
        });
        return NextResponse.json(result);
      }
      case "no_engagement": {
        const result = await recordNoEngagement(id);
        await audit("placement_no_engagement", { clientUserId: result.clientUserId });
        return NextResponse.json(result);
      }
      case "invoiced": {
        const result = await recordFeeStatus(id, { status: "invoiced", reference: input.reference });
        await audit("placement_fee_invoiced", { clientUserId: result.clientUserId, feeMinor: result.feeMinor });
        return NextResponse.json(result);
      }
      case "paid": {
        const result = await recordFeeStatus(id, { status: "paid" });
        await audit("placement_fee_paid", { clientUserId: result.clientUserId, feeMinor: result.feeMinor });
        return NextResponse.json(result);
      }
    }
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
