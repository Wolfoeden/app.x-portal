import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminUser } from "@/lib/auth/current-user";
import { deleteContact, updateContact } from "@/lib/crm/contacts-data";
import { CONTACT_STAGES } from "@/lib/crm/contacts-model";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const IdSchema = z.string().uuid();
const nullableText = (max: number) => z.string().trim().max(max).nullable().transform((value) => value || null);

const PatchSchema = z
  .object({
    stage: z.enum(CONTACT_STAGES).optional(),
    nextFollowUpOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable().optional(),
    note: nullableText(2000).optional(),
    email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
    contactName: nullableText(160).optional(),
    roleTitle: nullableText(200).optional(),
    markContacted: z.boolean().optional(),
    addNote: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Nichts zu ändern.");

function failure(error: unknown, traceId: string, message: string) {
  if (error instanceof NextResponse) return error;
  if (error instanceof Response) return error;
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Die Angaben sind ungültig.", traceId }, { status: 400, headers: NO_STORE });
  }
  console.error(message, traceId, error);
  return NextResponse.json({ error: message, traceId }, { status: 500, headers: NO_STORE });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);
    const admin = await requireAdminUser();
    const id = IdSchema.parse((await context.params).id);
    const patch = PatchSchema.parse(await readJsonWithLimit(request, 8_000));
    const contact = await updateContact(id, patch, admin.id);
    if (!contact) {
      return NextResponse.json({ error: "Kontakt nicht gefunden.", traceId }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json({ contact, traceId }, { headers: NO_STORE });
  } catch (error) {
    return failure(error, traceId, "Der Kontakt konnte nicht gespeichert werden.");
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);
    const admin = await requireAdminUser();
    const id = IdSchema.parse((await context.params).id);
    const deleted = await deleteContact(id, admin.id);
    if (!deleted) {
      return NextResponse.json({ error: "Kontakt nicht gefunden.", traceId }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json({ deleted: true, traceId }, { headers: NO_STORE });
  } catch (error) {
    return failure(error, traceId, "Der Kontakt konnte nicht gelöscht werden.");
  }
}
