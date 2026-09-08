import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import { runLeadRematchPass } from "@/lib/leadgen/rematch";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Archivierte Leads von Hand noch einmal abgleichen.
 *
 * Derselbe Vorgang, den eine Freigabe von selbst auslöst — hier als Knopf,
 * weil man ihn auch dann brauchen kann, wenn der Katalog auf anderem Weg
 * gewachsen ist: ein Profil wieder auf `active` gesetzt, ein Stundensatz
 * korrigiert, ein Buchungslink nachgetragen.
 *
 * Er kostet nichts. Gerechnet wird mit den Briefs, die beim ersten Durchgang
 * gespeichert wurden; kein Modell wird gefragt. Deshalb gibt es hier auch
 * keinen Schalter und kein Tagesbudget — es gibt nichts zu drosseln.
 */

const InputSchema = z
  .object({
    limit: z.number().int().min(1).max(1_000).default(200),
    /** Nur nachsehen, nichts zurückholen. */
    dryRun: z.boolean().default(false),
  })
  .strict();

export async function POST(request: Request) {
  const traceId = randomUUID();

  try {
    assertSameOrigin(request);
    const admin = await requireAdminUser();
    const input = InputSchema.parse(await readJsonWithLimit(request, 2_000));

    const ergebnis = await runLeadRematchPass({
      limit: input.limit,
      dryRun: input.dryRun,
    });

    await writeAuditEvent({
      actorUserId: admin.id,
      action: "leadgen_rematch_run",
      targetType: "leadgen_queue",
      outcome: "success",
      traceId,
      metadata: {
        examined: ergebnis.examined,
        revived: ergebnis.revived,
        stillEmpty: ergebnis.stillEmpty,
        withoutBrief: ergebnis.withoutBrief,
        dryRun: input.dryRun,
      },
      required: true,
    });

    return NextResponse.json(
      { ...ergebnis, traceId },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof NextResponse) return error;
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Die Angaben sind ungültig.", traceId },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return NextResponse.json(
      { error: "Der Neuabgleich ist fehlgeschlagen.", traceId },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
