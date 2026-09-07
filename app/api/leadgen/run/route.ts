import { randomUUID, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import { promotionalDeliveryConfigured } from "@/lib/email/deliver";
import { runLeadMatchPass } from "@/lib/leadgen/match-run";
import { LEAD_BULK_SEND_LIMIT } from "@/lib/leadgen/limits";
import { readJsonWithLimit } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Der Tageslauf der Akquise.
 *
 * Zwei Wege herein, weil es zwei Aufrufer gibt. Der Betreiber ruft die Route
 * aus dem Admin-Bereich auf und ist dabei angemeldet. Der geplante Lauf kommt
 * aus der Datenbank — `pg_cron` stößt `net.http_post` an —, und dort gibt es
 * keine Sitzung, keinen Browser und kein Cookie. Für ihn zählt ein
 * gemeinsames Geheimnis im Kopf der Anfrage.
 *
 * Kein `assertSameOrigin()`: Der geplante Lauf hat keinen Ursprung, den er
 * mitschicken könnte. Die Prüfung, die hier trägt, ist die Anmeldung
 * beziehungsweise das Geheimnis — und beide sind stärker als ein Kopf, den
 * ein Aufrufer selbst setzt.
 */

const InputSchema = z
  .object({
    /** Deckel für den ganzen Tag, über alle Aufrufe hinweg. */
    dailyLimit: z.number().int().min(1).max(200).optional(),
    /** Wie viele Leads dieser Aufruf ansieht. */
    examineBudget: z.number().int().min(1).max(500).optional(),
    /** Rechnet durch, ohne zu verschicken und ohne etwas zu speichern. */
    dryRun: z.boolean().optional(),
  })
  .strict();

/**
 * Zeitgleicher Vergleich. Ein `===` auf ein Geheimnis verrät über die Dauer
 * der Prüfung, wie viele Zeichen am Anfang stimmen.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function authorize(request: Request): Promise<
  { ok: true; actor: string } | { ok: false; status: number; error: string }
> {
  const expected = process.env.LEADGEN_RUN_SECRET?.trim();
  const provided = request.headers.get("x-leadgen-run-token")?.trim();
  if (expected && expected.length >= 32 && provided) {
    return secretMatches(provided, expected)
      ? { ok: true, actor: "scheduler" }
      : { ok: false, status: 401, error: "Ungültiges Token." };
  }

  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return { ok: false, status: 403, error: "Nur für Administratoren." };
  }
  return { ok: true, actor: user.id };
}

export async function POST(request: Request) {
  const traceId = randomUUID();
  try {
    const auth = await authorize(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const raw = await readJsonWithLimit(request, 2_000).catch(() => ({}));
    const input = InputSchema.parse(raw ?? {});

    const from =
      process.env.EMAIL_FROM?.trim() || process.env.SMTP_USER?.trim() || null;
    // Strenger als der reine SMTP-Zugang, wie im Einzelversand: Ohne
    // funktionierenden Abmeldelink darf keine Werbung raus, und das soll hier
    // stehen statt mitten im Lauf aufzutreten.
    if (!input.dryRun && (!promotionalDeliveryConfigured() || !from)) {
      return NextResponse.json(
        {
          error:
            "Der Mailversand ist nicht eingerichtet. Ohne SMTP-Zugang und ohne EMAIL_UNSUBSCRIBE_SECRET wird nichts verschickt.",
        },
        { status: 503 },
      );
    }

    const result = await runLeadMatchPass({
      dailyLimit: input.dailyLimit ?? LEAD_BULK_SEND_LIMIT,
      examineBudget: input.examineBudget,
      senderEmail: from ?? "",
      dryRun: input.dryRun ?? false,
      // Nur der Zeitplan ist an das Fenster gebunden. Der Betreiber
      // ruft die Route bewusst auf und soll das auch um vier Uhr
      // nachmittags können.
      enforceWindow: auth.actor === "scheduler",
      trigger: auth.actor === "scheduler" ? "scheduler" : "admin",
    });

    await writeAuditEvent({
      // Der geplante Lauf hat kein Konto. Null ist hier die richtige Angabe:
      // eine erfundene Kennung wäre schlechter als keine.
      actorUserId: auth.actor === "scheduler" ? null : auth.actor,
      action: "leadgen_match_run",
      targetType: "leadgen_queue",
      outcome: "success",
      traceId,
      // Keine Empfängeradressen, keine Firmennamen: Das Protokoll hält fest,
      // was der Lauf getan hat, nicht mit wem.
      metadata: {
        trigger: auth.actor === "scheduler" ? "scheduler" : "admin",
        dryRun: input.dryRun ?? false,
        examined: result.examined,
        sent: result.sent,
        archived: result.archived,
        skipped: result.skipped,
        remaining: result.remaining,
        stoppedBy: result.stoppedBy,
      },
    });

    return NextResponse.json({
      examined: result.examined,
      sent: result.sent,
      archived: result.archived,
      skipped: result.skipped,
      remaining: result.remaining,
      dailyBudgetLeft: result.dailyBudgetLeft,
      stoppedBy: result.stoppedBy,
      outcomes: result.outcomes,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 });
    }
    console.error(JSON.stringify({ event: "leadgen_run_failed", traceId }));
    return NextResponse.json(
      { error: "Der Lauf ist gescheitert.", traceId },
      { status: 500 },
    );
  }
}
