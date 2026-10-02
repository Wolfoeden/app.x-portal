import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminUser } from "@/lib/auth/current-user";
import { LEAD_PREPARE_MODES, LEAD_SEND_MODES, updateLeadAutomation } from "@/lib/leadgen/automation";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Der Schalter für die Betriebsarten der Lead-Automatik.
 *
 * `updateLeadAutomation()` schreibt ein Audit-Ereignis mit: Wer den
 * automatischen Versand einschaltet, verschickt Werbung an Menschen, die nicht
 * darum gebeten haben, und muss später benennbar sein.
 */

const InputSchema = z
  .object({
    prepareMode: z.enum(LEAD_PREPARE_MODES).optional(),
    sendMode: z.enum(LEAD_SEND_MODES).optional(),
    dailyLimit: z.number().int().min(1).max(200).nullable().optional(),
    pausedUntil: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .refine((wert) => Object.keys(wert).length > 0, "Nichts zu ändern.");

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function PATCH(request: Request) {
  const traceId = randomUUID();

  try {
    assertSameOrigin(request);
    const admin = await requireAdminUser();
    const patch = InputSchema.parse(await readJsonWithLimit(request, 2_000));
    const automation = await updateLeadAutomation(patch, admin.id);
    return NextResponse.json({ automation, traceId }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Die Einstellung ist ungültig.", traceId },
        { status: 400, headers: NO_STORE },
      );
    }
    console.error("leadgen automation update failed", traceId, error);
    return NextResponse.json(
      { error: "Die Einstellung konnte nicht gespeichert werden.", traceId },
      { status: 500, headers: NO_STORE },
    );
  }
}
