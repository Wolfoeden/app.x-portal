import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";
import { runDemandStep, STEP_BUDGET_MS } from "@/lib/sourcing/demand-step";
import { logSourcingFailure } from "@/lib/sourcing/failure-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Ein Schritt, nicht der ganze Lauf. Das Zeitbudget im Code ist die eigentliche
// Grenze; dieser Wert ist nur die äußere Reserve.
export const maxDuration = 60;

/**
 * Ein Schritt des Beschaffungslaufs.
 *
 * Der erste Anlauf war ein einziger Aufruf, der alles erledigen wollte —
 * fünfundvierzig bis fünfundachtzig Sekunden. Die Plattform beendet eine
 * synchrone Funktion lange vorher, und weil hier im Fehlerfall nichts
 * protokolliert wurde, sah der Abbruch aus wie „niemand hat gedrückt".
 *
 * Jetzt arbeitet ein Aufruf zwölf Sekunden und gibt zurück, was noch offen
 * ist. Die Schleife läuft im Browser — dasselbe Muster wie beim
 * Lead-Abgleich, aus demselben Grund.
 */

const CursorSchema = z
  .object({
    phase: z.enum(["source", "address", "invite", "done"]),
    pendingSkills: z.array(z.string().trim().max(80)).max(16),
    skippedSkills: z.array(z.string().trim().max(80)).max(16),
    pendingIds: z.array(z.string().uuid()).max(200),
    found: z.number().int().min(0).max(10_000),
    addressable: z.number().int().min(0).max(10_000),
    imported: z.number().int().min(0).max(10_000),
    addressed: z.number().int().min(0).max(10_000),
    invited: z.number().int().min(0).max(10_000),
    searchCalls: z.number().int().min(0).max(10_000),
    freeAddressHits: z.number().int().min(0).max(10_000),
  })
  .strict();

const InputSchema = z
  .object({
    profileKey: z.string().trim().min(1).max(200),
    profileLabel: z.string().trim().min(1).max(200),
    skills: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
    workMode: z.enum(["remote", "on_site", "hybrid", "unknown"]).default("unknown"),
    location: z.string().trim().max(120).nullable().default(null),
    limitPerSkill: z.number().int().min(1).max(8).default(4),
    searches: z.number().int().min(0).max(100_000).default(0),
    uniqueSeekers: z.number().int().min(0).max(100_000).default(0),
    resolveAddresses: z.boolean().default(true),
    sendInvites: z.boolean().default(false),
    /** Der Zustand aus dem vorigen Schritt. Fehlt beim ersten Aufruf. */
    cursor: CursorSchema.nullable().default(null),
  })
  .strict();

export async function POST(request: Request) {
  const traceId = randomUUID();
  let adminId: string | null = null;
  let profileKey: string | null = null;
  let phase = "unknown";

  try {
    assertSameOrigin(request);
    const admin = await requireAdminUser();
    adminId = admin.id;
    const input = InputSchema.parse(await readJsonWithLimit(request, 24_000));
    profileKey = input.profileKey;
    phase = input.cursor?.phase ?? "source";

    const ergebnis = await runDemandStep({
      demandProfileKey: input.profileKey,
      demandProfileLabel: input.profileLabel,
      skills: input.skills,
      workMode: input.workMode,
      location: input.location,
      searches: input.searches,
      uniqueSeekers: input.uniqueSeekers,
      adminId: admin.id,
      limitPerSkill: input.limitPerSkill,
      resolveAddresses: input.resolveAddresses,
      sendInvites: input.sendInvites,
      cursor: input.cursor,
      timeBudgetMs: STEP_BUDGET_MS,
    });

    // Jeder Schritt hinterlässt eine Spur, nicht erst der letzte. Sonst wäre
    // ein Lauf, der in Schritt drei von fünf abbricht, wieder unsichtbar.
    await writeAuditEvent({
      actorUserId: admin.id,
      action: "sourcing_demand_step",
      targetType: "search_demand",
      targetId: input.profileKey,
      outcome: "success",
      traceId,
      metadata: {
        label: input.profileLabel,
        phaseVorher: phase,
        phaseNachher: ergebnis.cursor.phase,
        done: ergebnis.done,
        found: ergebnis.cursor.found,
        imported: ergebnis.cursor.imported,
        addressed: ergebnis.cursor.addressed,
        invited: ergebnis.cursor.invited,
        searchCalls: ergebnis.cursor.searchCalls,
        freeAddressHits: ergebnis.cursor.freeAddressHits,
      },
      required: ergebnis.done,
    });

    return NextResponse.json(
      { ...ergebnis, traceId },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof NextResponse) return error;
    if (error instanceof Response) return error;

    const ungueltig = error instanceof z.ZodError;
    await logSourcingFailure({
      actorUserId: adminId,
      action: "sourcing_demand_step_failed",
      targetId: profileKey,
      traceId,
      error,
      stage: phase,
      metadata: { invalidInput: ungueltig },
    });

    return NextResponse.json(
      {
        error: ungueltig
          ? "Die Angaben zum Nachfrageprofil sind unvollständig."
          : "Der Beschaffungsschritt ist fehlgeschlagen.",
        // Der Fehlertext gehört in die Antwort, nicht nur ins Protokoll: Wer
        // den Knopf drückt, soll lesen können, woran es lag.
        detail: error instanceof Error ? error.message.slice(0, 300) : undefined,
        traceId,
      },
      {
        status: ungueltig ? 400 : 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
