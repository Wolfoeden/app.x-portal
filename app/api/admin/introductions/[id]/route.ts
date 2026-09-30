import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import { StripeRequestError } from "@/lib/billing/stripe-api";
import { placementRequestsEnabled } from "@/lib/placement/config";
import {
  recordEngagement,
  recordFeeStatus,
  recordNoEngagement,
} from "@/lib/placement/engagements";
import { BillingDetailsSchema, issuePlacementInvoice } from "@/lib/placement/invoices";
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
  z.object({ action: z.literal("issue_invoice"), billing: BillingDetailsSchema }).strict(),
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
    const input = ActionSchema.parse(await readJsonWithLimit(request, 4_000));
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
      case "issue_invoice": {
        const result = await issuePlacementInvoice(id, input.billing);
        await audit("placement_fee_invoiced", {
          clientUserId: result.clientUserId,
          feeMinor: result.feeMinor,
          totalMinor: result.totalMinor,
          invoiceNumber: result.number,
          via: "stripe",
        });
        return NextResponse.json(result);
      }
      case "paid": {
        const result = await recordFeeStatus(id, { status: "paid" });
        await audit("placement_fee_paid", { clientUserId: result.clientUserId, feeMinor: result.feeMinor });
        return NextResponse.json(result);
      }
    }
  } catch (error) {
    if (error instanceof Response) {
      // Die Domänenfehler tragen ihren Grund als Text; die Oberfläche liest JSON.
      const message = await error.text().catch(() => "");
      return NextResponse.json({ error: message || "Die Aktion ist nicht möglich." }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      const field = error.issues[0];
      return NextResponse.json(
        { error: field?.path.includes("billing") ? `Rechnungsanschrift: ${field.message}` : "Ungültige Aktion." },
        { status: 400 },
      );
    }
    if (error instanceof StripeRequestError) {
      return NextResponse.json({ error: `Stripe: ${error.message}` }, { status: error.status >= 500 ? 503 : 502 });
    }
    return NextResponse.json(
      { error: "Die Anfrage konnte gerade nicht bearbeitet werden." },
      { status: 503 },
    );
  }
}
