import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import {
  importSourcedCandidates,
  loadSearchRunCandidates,
} from "@/lib/freelancer/sourced-candidate-import";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Übernimmt die Treffer eines bezahlten Suchlaufs als Kandidaten.
 *
 * Ausdrücklich ein Knopfdruck und kein Automatismus am Ende der Suche. Mit dem
 * Anlegen beginnt die Frist aus Art. 14 DSGVO zu laufen, und ab dann schuldet
 * XPORTAL diesen Menschen eine Information. Diese Uhr soll nicht anfangen zu
 * ticken, ohne dass jemand hingesehen hat.
 *
 * Der Aufruf ist wiederholbar: Wer schon vorliegt, wird übersprungen, nicht
 * ein zweites Mal angelegt. Das trägt der eindeutige Index auf der
 * Profiladresse, nicht eine Prüfung hier.
 */

const InputSchema = z.object({ searchRunId: z.string().uuid() }).strict();

export async function POST(request: Request) {
  const traceId = randomUUID();

  try {
    assertSameOrigin(request);
    const admin = await requireAdminUser();
    const input = InputSchema.parse(await readJsonWithLimit(request, 4_000));

    const candidates = await loadSearchRunCandidates(input.searchRunId);
    if (!candidates) {
      return NextResponse.json(
        { error: "Dieser Suchlauf wurde nicht gefunden.", traceId },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const outcome = await importSourcedCandidates({
      candidates,
      adminId: admin.id,
    });

    // Kein Name, keine Adresse, keine Profillinks im Protokoll — nur Zahlen.
    // Wer wen betrifft, steht in `freelancer_applications` und unterliegt
    // dort der 30-Tage-Frist; ein Auditeintrag täte das nicht.
    await writeAuditEvent({
      actorUserId: admin.id,
      action: "sourced_candidates_imported",
      targetType: "freelancer_application",
      outcome: "success",
      traceId,
      metadata: {
        searchRunId: input.searchRunId,
        found: candidates.length,
        created: outcome.created,
        duplicate: outcome.skipped.filter((entry) => entry.reason === "duplicate")
          .length,
        suppressed: outcome.skipped.filter(
          (entry) => entry.reason === "suppressed",
        ).length,
        rejected: outcome.skipped.filter(
          (entry) =>
            entry.reason === "rejected" || entry.reason === "summary_too_short",
        ).length,
      },
      required: true,
    });

    return NextResponse.json(
      {
        created: outcome.created,
        skipped: outcome.skipped.map((entry) => entry.reason),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Die Anfrage hat ein ungültiges Format.", traceId },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    await writeAuditEvent({
      actorUserId: null,
      action: "sourced_candidates_import_failed",
      targetType: "freelancer_application",
      outcome: "failed",
      traceId,
    }).catch(() => undefined);

    return NextResponse.json(
      { error: "Die Übernahme ist fehlgeschlagen.", traceId },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
