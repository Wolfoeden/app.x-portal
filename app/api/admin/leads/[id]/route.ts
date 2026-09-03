import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import { updateLead } from "@/lib/leadgen/leads-data";
import {
  LEAD_CATEGORY_MAX_LENGTH,
  LEAD_NOTES_MAX_LENGTH,
  LEAD_STATUSES,
} from "@/lib/leadgen/limits";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Die Pflege eines Leads: einordnen, notieren, abhaken.
 *
 * Archivieren ist hier ein eigenes Feld und nicht die Folge eines Status.
 * Beides zusammen zu setzen ist der Normalfall — ein Lead, den der Betreiber
 * verwirft, ist `dismissed` **und** archiviert —, aber die Datenbank verlangt
 * nur, dass nichts Unbearbeitetes im Archiv landet. Diese eine Regel steht
 * dort und nicht hier.
 */
const PatchSchema = z
  .object({
    status: z.enum(LEAD_STATUSES).optional(),
    category: z
      .string()
      .trim()
      .max(LEAD_CATEGORY_MAX_LENGTH)
      .nullish()
      .transform((value) => value || null),
    notes: z
      .string()
      .trim()
      .max(LEAD_NOTES_MAX_LENGTH)
      .nullish()
      .transform((value) => value || null),
    archived: z.boolean().optional(),
  })
  .strict();

const LeadIdSchema = z.coerce.number().int().positive();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const traceId = randomUUID();
  let leadId: number | null = null;

  try {
    assertSameOrigin(request);
    const [{ id }, admin] = await Promise.all([
      context.params,
      requireAdminUser(),
    ]);
    leadId = LeadIdSchema.parse(id);

    const patch = PatchSchema.parse(await readJsonWithLimit(request, 8_000));
    if (!Object.keys(patch).length) {
      return NextResponse.json(
        { error: "Es wurde nichts zum Ändern übergeben." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const updated = await updateLead({ id: leadId, ...patch });
    if (!updated) {
      return NextResponse.json(
        { error: "Der Lead wurde nicht gefunden." },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    await writeAuditEvent({
      actorUserId: admin.id,
      action: "leadgen_lead_updated",
      targetType: "leadgen_queue",
      // Kein targetId: die Spalte ist uuid, die Lead-Kennung ist bigint.
      outcome: "success",
      traceId,
      metadata: {
        leadId,
        status: updated.status,
        archived: Boolean(updated.archived_at),
        categorized: Boolean(updated.category),
      },
      required: true,
    });

    return NextResponse.json(
      { status: "updated", lead: updated },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Die Änderung hat ein ungültiges Format.",
          traceId,
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    await writeAuditEvent({
      actorUserId: null,
      action: "leadgen_lead_update_failed",
      targetType: "leadgen_queue",
      outcome: "failed",
      traceId,
      metadata: { leadId: leadId ?? -1 },
    }).catch(() => undefined);

    return NextResponse.json(
      { error: "Die Änderung konnte nicht gespeichert werden.", traceId },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
