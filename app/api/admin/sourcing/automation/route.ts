import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminUser } from "@/lib/auth/current-user";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";
import { updateSourcingAutomation } from "@/lib/sourcing/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Der Schalter für die Betriebsarten der Beschaffung.
 *
 * `updateSourcingAutomation()` schreibt ein Audit-Ereignis mit. Das ist hier
 * kein Selbstzweck: Wer angeschaltet hat, dass fremde Menschen selbsttätig
 * erfasst und angeschrieben werden, muss später benennbar sein.
 */

const InputSchema = z
  .object({
    absorbUserSearches: z.boolean().optional(),
    resolveAddresses: z.boolean().optional(),
    autoInvite: z.boolean().optional(),
    dailyAddressBudget: z.number().int().min(0).max(500).optional(),
    pausedUntil: z.string().datetime().nullable().optional(),
  })
  .strict()
  .refine((wert) => Object.keys(wert).length > 0, "Nichts zu ändern.");

export async function PATCH(request: Request) {
  const traceId = randomUUID();

  try {
    assertSameOrigin(request);
    const admin = await requireAdminUser();
    const patch = InputSchema.parse(await readJsonWithLimit(request, 2_000));

    const automation = await updateSourcingAutomation(patch, admin.id);

    return NextResponse.json(
      { automation, traceId },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof NextResponse) return error;
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Die Einstellung ist ungültig.", traceId },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return NextResponse.json(
      { error: "Die Einstellung konnte nicht gespeichert werden.", traceId },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
