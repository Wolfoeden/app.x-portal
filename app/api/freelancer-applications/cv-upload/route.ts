import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CV_BUCKET,
  CV_MAX_BYTES,
  CV_MIME_TYPES,
} from "@/lib/freelancer/application";
import { mintCvObjectPath, signCvObjectPath } from "@/lib/freelancer/cv-storage";
import { takeRateLimit } from "@/lib/security/rate-limit";
import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
  readJsonWithLimit,
} from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UploadTicketSchema = z
  .object({
    mimeType: z.enum(CV_MIME_TYPES),
    sizeBytes: z.number().int().positive().max(CV_MAX_BYTES),
  })
  .strict();

/**
 * Hands the browser a short-lived, single-object upload ticket.
 *
 * The file goes straight to Supabase Storage; a serverless function never
 * carries the megabytes. The returned `pathToken` is the server's signature
 * over the object key — the submit route refuses any CV without it.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    const ipHash = pseudonymizeIp(getClientIp(request));
    const limit = takeRateLimit(`freelancer-cv:${ipHash}`, 10, 15 * 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Zu viele Uploads. Bitte später erneut versuchen." },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        },
      );
    }

    const parsed = UploadTicketSchema.safeParse(
      await readJsonWithLimit(request, 2_000),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Es können nur PDF-Dateien bis 10 MB hochgeladen werden." },
        { status: 400 },
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return NextResponse.json(
        { error: "Serverkonfiguration unvollständig." },
        { status: 503 },
      );
    }

    const objectPath = mintCvObjectPath();
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.storage
      .from(CV_BUCKET)
      .createSignedUploadUrl(objectPath);
    if (error) throw error;

    return NextResponse.json(
      {
        bucket: CV_BUCKET,
        path: objectPath,
        uploadToken: data.token,
        pathToken: signCvObjectPath(objectPath),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Der Upload konnte nicht vorbereitet werden." },
      { status: 503 },
    );
  }
}
