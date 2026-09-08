import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";
import { runDemandSourcing } from "@/lib/sourcing/demand-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Beschaffen, Adressen auflösen und einladen dauert. Ein Nachfrageprofil mit
// vier Skills und acht Kandidaten liegt bei einer knappen Minute.
export const maxDuration = 300;

/**
 * Der Knopf an einem Nachfrageprofil.
 *
 * Er führt in einem Zug aus, was sonst drei Vorgänge sind: bei freelancermap
 * suchen, zu den Gefundenen eine Adresse ermitteln und sie einladen. Das ist
 * bewusst **ein** Knopf und trotzdem **drei** Stufen — jede lässt sich
 * einzeln abwählen, und was in einer Stufe scheitert, hält die anderen nicht
 * auf.
 *
 * Der Versand steht dabei nicht in der Vorgabe: Wer eingeladen wird, soll
 * vorher gesehen worden sein. Wer den Haken setzt, hat sich entschieden.
 */

const InputSchema = z
  .object({
    profileKey: z.string().trim().min(1).max(200),
    profileLabel: z.string().trim().min(1).max(200),
    skills: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
    workMode: z.enum(["remote", "on_site", "hybrid", "unknown"]).default("unknown"),
    location: z.string().trim().max(120).nullable().default(null),
    /** Profile je Skill. Klein halten: dieselben Menschen tauchen mehrfach auf. */
    limitPerSkill: z.number().int().min(1).max(8).default(4),
    /** Adressen suchen. Kostet rund fünf Cent je Person. */
    resolveAddresses: z.boolean().default(true),
    /** Einladungen verschicken. Erreicht Menschen — deshalb nicht vorbelegt. */
    sendInvites: z.boolean().default(false),
  })
  .strict();

export async function POST(request: Request) {
  const traceId = randomUUID();

  try {
    assertSameOrigin(request);
    const admin = await requireAdminUser();
    const input = InputSchema.parse(await readJsonWithLimit(request, 8_000));

    const ergebnis = await runDemandSourcing({
      demandProfileKey: input.profileKey,
      demandProfileLabel: input.profileLabel,
      skills: input.skills,
      workMode: input.workMode,
      location: input.location,
      adminId: admin.id,
      limitPerSkill: input.limitPerSkill,
      resolveAddresses: input.resolveAddresses,
      sendInvites: input.sendInvites,
    });

    await writeAuditEvent({
      actorUserId: admin.id,
      action: "sourcing_demand_run",
      targetType: "search_demand",
      targetId: input.profileKey,
      outcome: "success",
      traceId,
      metadata: {
        label: input.profileLabel,
        found: ergebnis.found,
        addressable: ergebnis.addressable,
        imported: ergebnis.imported,
        addressed: ergebnis.addressed,
        invited: ergebnis.invited,
        sendInvites: input.sendInvites,
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
        { error: "Die Angaben zum Nachfrageprofil sind unvollständig.", traceId },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return NextResponse.json(
      {
        error: "Der Beschaffungslauf ist fehlgeschlagen.",
        detail: error instanceof Error ? error.message : undefined,
        traceId,
      },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
