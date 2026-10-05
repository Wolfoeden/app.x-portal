import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { hasPdfMagicBytes, verifyCvObjectPath } from "@/lib/freelancer/cv-storage";
import { CV_BUCKET, CV_MAX_BYTES } from "@/lib/freelancer/limits";
import { extractCvDraft } from "@/lib/openai/cv-draft";
import {
  assertSameOrigin,
  pseudonymizeSubject,
  readJsonWithLimit,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ExtractSchema = z
  .object({
    storagePath: z.string().trim().min(1).max(300),
    token: z.string().trim().regex(/^[0-9a-f]{64}$/u),
  })
  .strict();

/** Fünf Auswertungen am Tag reichen für Korrekturen; mehr wäre Missbrauch. */
const CV_EXTRACT_LIMIT = { count: 5, windowMs: 24 * 60 * 60_000 } as const;

const NO_STORE = { "Cache-Control": "private, no-store" };

function failure(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/**
 * Wertet einen gerade hochgeladenen Lebenslauf zu einem Profilentwurf aus.
 *
 * Nimmt dieselbe signierte Referenz wie das Absenden der Bewerbung: Ohne das
 * Token aus dem eigenen Upload lässt sich keine fremde Datei auswerten. Der
 * Entwurf geht an den Browser zurück und wird nicht gespeichert; die Datei
 * bleibt, wo sie ist.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (user.isAnonymous) return failure(403, "Ein dauerhaftes Konto ist erforderlich.");

    const parsed = ExtractSchema.safeParse(await readJsonWithLimit(request, 2_000));
    if (!parsed.success || !verifyCvObjectPath(parsed.data.storagePath, parsed.data.token)) {
      return failure(400, "Der Lebenslauf konnte nicht zugeordnet werden. Bitte erneut hochladen.");
    }

    if (!process.env.OPENAI_API_KEY?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return failure(503, "Das Einlesen ist gerade nicht verfügbar. Bitte füllen Sie das Formular selbst aus.");
    }

    const userHash = pseudonymizeSubject(`user:${user.id}`);
    const limit = await consumeRateLimit(`freelancer-cv-extract:${userHash}`, CV_EXTRACT_LIMIT.count, CV_EXTRACT_LIMIT.windowMs);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Heute wurden schon mehrere Lebensläufe eingelesen. Bitte morgen erneut versuchen." },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const admin = createAdminSupabaseClient();
    const { data: file, error } = await admin.storage.from(CV_BUCKET).download(parsed.data.storagePath);
    if (error || !file) return failure(404, "Der Lebenslauf wurde nicht gefunden. Bitte erneut hochladen.");
    if (file.size > CV_MAX_BYTES) return failure(400, "Es können nur PDF-Dateien bis 10 MB eingelesen werden.");
    const pdf = new Uint8Array(await file.arrayBuffer());
    if (!hasPdfMagicBytes(pdf)) return failure(400, "Die Datei ist keine PDF.");

    const result = await extractCvDraft({ pdf, filename: "lebenslauf.pdf", safetyIdentifier: userHash });
    if (result.status === "unavailable") {
      return failure(503, "Das Einlesen ist gerade nicht verfügbar. Bitte füllen Sie das Formular selbst aus.");
    }
    if (result.status !== "ok") {
      return failure(502, "Der Lebenslauf konnte nicht gelesen werden. Bitte füllen Sie die Angaben selbst aus.");
    }
    return NextResponse.json({ draft: result.draft }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof Response) return error;
    return failure(503, "Das Einlesen ist gerade nicht verfügbar. Bitte füllen Sie das Formular selbst aus.");
  }
}
