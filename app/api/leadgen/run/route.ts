import { randomUUID, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import { promotionalDeliveryConfigured } from "@/lib/email/deliver";
import {
  runLeadPreparePass,
  runLeadSendPass,
} from "@/lib/leadgen/match-run";
import { LEAD_BULK_SEND_LIMIT } from "@/lib/leadgen/limits";
import {
  assertSameOrigin,
  readJsonWithLimit,
} from "@/lib/security/request";

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
 * `assertSameOrigin()` gilt nur für den angemeldeten Weg. Der geplante Lauf
 * hat keinen Ursprung, den er mitschicken könnte — für ihn trägt das
 * Geheimnis, und das ist stärker als ein Kopf, den ein Aufrufer selbst
 * setzt. Der Betreiber dagegen ruft aus einem Browser, und dort ist eine
 * Sitzung allein keine Absicht: Seit ein Knopf in der Arbeitsfläche diese
 * Route aufruft, könnte es auch eine fremde Seite tun.
 */

const InputSchema = z
  .object({
    /**
     * Was der Aufruf tun soll.
     *
     * `prepare` gleicht ab und legt Entwürfe an, `send` stellt sie zu. Der
     * Standard ist `send`: Ein Aufruf ohne Angabe kommt aus einer Zeit, in
     * der der Durchgang beides tat, und verschicken ist davon der Teil, den
     * ein alter Aufrufer erwartet hätte.
     */
    mode: z.enum(["prepare", "send"]).optional(),
    /** Deckel für den ganzen Tag, über alle Aufrufe hinweg. Nur beim Versand. */
    dailyLimit: z.number().int().min(1).max(200).optional(),
    /** Wie viele Fälle dieser Aufruf ansieht. */
    examineBudget: z.number().int().min(1).max(500).optional(),
    /** Rechnet durch, ohne zu verschicken und ohne etwas zu speichern. */
    dryRun: z.boolean().optional(),
    /**
     * Die Ausschreibung vom Modell lesen lassen. Standardmäßig an; auf
     * `false` bleibt der deterministische Weg, der nichts kostet.
     */
    useAi: z.boolean().optional(),
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
  let modus: "prepare" | "send" | null = null;
  try {
    const auth = await authorize(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Nur für den Browser-Weg. Der Zeitgeber schickt keinen Ursprung mit,
    // und ihn dafür abzuweisen hieße, die Prüfung gegen den einzigen
    // Aufrufer zu richten, der sie nicht erfüllen kann.
    if (auth.actor !== "scheduler") assertSameOrigin(request);

    const raw = await readJsonWithLimit(request, 2_000).catch(() => ({}));
    const input = InputSchema.parse(raw ?? {});

    const mode = input.mode ?? "send";
    modus = mode;
    const from =
      process.env.EMAIL_FROM?.trim() || process.env.SMTP_USER?.trim() || null;
    // Strenger als der reine SMTP-Zugang, wie im Einzelversand: Ohne
    // funktionierenden Abmeldelink darf keine Werbung raus, und das soll hier
    // stehen statt mitten im Lauf aufzutreten.
    //
    // Nur für den Versand. Ein Abgleich ohne eingerichteten Mailserver ist
    // sinnvoll: Er füllt die Nachfrageauswertung und legt Entwürfe an, die
    // warten können.
    if (mode === "send" && !input.dryRun) {
      if (!promotionalDeliveryConfigured() || !from) {
        return NextResponse.json(
          {
            error:
              "Der Mailversand ist nicht eingerichtet. Ohne SMTP-Zugang und ohne EMAIL_UNSUBSCRIBE_SECRET wird nichts verschickt.",
          },
          { status: 503 },
        );
      }
    }

    // Der Absender steht auch im vorbereiteten Entwurf — im Fuß, als
    // Widerspruchsadresse. Fehlt er beim Abgleich, ist das kein Grund
    // abzubrechen, aber der Entwurf trüge eine leere Stelle.
    const senderEmail = from ?? "";

    const gemeinsam = {
      examineBudget: input.examineBudget,
      senderEmail,
      dryRun: input.dryRun ?? false,
      trigger: (auth.actor === "scheduler" ? "scheduler" : "admin") as
        | "scheduler"
        | "admin",
      useAi: input.useAi ?? true,
    };

    const result =
      mode === "prepare"
        ? await runLeadPreparePass(gemeinsam)
        : await runLeadSendPass({
            ...gemeinsam,
            dailyLimit: input.dailyLimit ?? LEAD_BULK_SEND_LIMIT,
            // Nur der Zeitplan ist an das Fenster gebunden. Der Betreiber
            // ruft die Route bewusst auf und soll das auch um vier Uhr
            // nachmittags können.
            enforceWindow: auth.actor === "scheduler",
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
        mode,
        dryRun: input.dryRun ?? false,
        examined: result.examined,
        extractedByModel: result.extractedByModel,
        extractedByFallback: result.extractedByFallback,
        prepared: result.prepared,
        sent: result.sent,
        archived: result.archived,
        discarded: result.discarded,
        skipped: result.skipped,
        remaining: result.remaining,
        stoppedBy: result.stoppedBy,
      },
    });

    return NextResponse.json({
      mode,
      examined: result.examined,
      extractedByModel: result.extractedByModel,
      extractedByFallback: result.extractedByFallback,
      prepared: result.prepared,
      sent: result.sent,
      archived: result.archived,
      discarded: result.discarded,
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
    // Mit Grund, nicht nur mit Kennung. Ein Protokoll, das allein die
    // Spur nennt, zwingt zum Nachstellen des Fehlers -- und genau daran
    // hing die Suche, als der erste echte Lauf an einem Check der
    // Datenbank scheiterte. Kein Stack und keine Adressen: Die Meldung
    // von PostgREST nennt Tabelle und Regel, mehr braucht es nicht.
    console.error(
      JSON.stringify({
        event: "leadgen_run_failed",
        traceId,
        mode: modus,
        reason:
          error instanceof Error
            ? error.message
            : typeof error === "object" && error !== null && "message" in error
              ? String((error as { message: unknown }).message)
              : "unknown",
      }),
    );
    return NextResponse.json(
      { error: "Der Lauf ist gescheitert.", traceId },
      { status: 500 },
    );
  }
}
