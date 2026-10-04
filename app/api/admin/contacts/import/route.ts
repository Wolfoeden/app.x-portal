import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminUser } from "@/lib/auth/current-user";
import { importContacts } from "@/lib/crm/contacts-data";
import { parseContactTable } from "@/lib/crm/contacts-model";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Kontakte aus einer Tabelle übernehmen: aus Excel kopiert (Tabulatoren)
 * oder als CSV. Gelesen wird hier noch einmal, nicht im Browser vertraut —
 * die Vorschau dort ist nur eine Vorschau.
 *
 * `dryRun` liefert, was übernommen würde, ohne zu schreiben.
 */

const InputSchema = z
  .object({
    text: z.string().min(1).max(400_000),
    source: z.string().trim().min(1).max(80).optional(),
    dryRun: z.boolean().optional(),
  })
  .strict();

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);
    const admin = await requireAdminUser();
    const input = InputSchema.parse(await readJsonWithLimit(request, 450_000));
    const parsed = parseContactTable(input.text);

    if (input.dryRun || !parsed.contacts.length) {
      return NextResponse.json(
        {
          preview: parsed.contacts.slice(0, 200),
          count: parsed.contacts.length,
          skipped: parsed.skipped,
          unmappedHeaders: parsed.unmappedHeaders,
          created: 0,
          updated: 0,
          traceId,
        },
        { headers: NO_STORE },
      );
    }

    const result = await importContacts(parsed.contacts, admin.id, input.source ?? "Import");
    return NextResponse.json(
      {
        count: parsed.contacts.length,
        skipped: parsed.skipped,
        unmappedHeaders: parsed.unmappedHeaders,
        ...result,
        traceId,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof NextResponse) return error;
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Die Tabelle fehlt oder ist zu groß.", traceId }, { status: 400, headers: NO_STORE });
    }
    console.error("crm import failed", traceId, error);
    return NextResponse.json({ error: "Der Import ist fehlgeschlagen.", traceId }, { status: 500, headers: NO_STORE });
  }
}
