import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import { readSourcingOutreachBody } from "@/lib/sourcing/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Der Wortlaut einer verschickten Einladung.
 *
 * Einzeln und auf Abruf, nicht in der Liste: Ein Aufruf der Nachfrageseite
 * soll nicht fünfzig Nachrichtentexte durch die Anwendung tragen, von denen
 * niemand einen liest. Wer wissen will, was bei einem bestimmten Menschen
 * ankam, öffnet dessen Zeile — und genau dieser Zugriff wird protokolliert,
 * weil dort der Name und die Adresse einer Person stehen.
 */

const ParamsSchema = z.object({ id: z.string().uuid() });

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const traceId = randomUUID();

  try {
    const admin = await requireAdminUser();
    const { id } = ParamsSchema.parse(await context.params);

    const eintrag = await readSourcingOutreachBody(id);
    if (!eintrag) {
      return NextResponse.json(
        { error: "Diese Nachricht wurde nicht gefunden.", traceId },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    await writeAuditEvent({
      actorUserId: admin.id,
      action: "sourcing_outreach_body_viewed",
      targetType: "sourcing_outreach",
      targetId: id,
      outcome: "success",
      traceId,
    });

    return NextResponse.json(
      { ...eintrag, traceId },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof NextResponse) return error;
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Ungültige Kennung.", traceId },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return NextResponse.json(
      { error: "Die Nachricht konnte nicht geladen werden.", traceId },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
