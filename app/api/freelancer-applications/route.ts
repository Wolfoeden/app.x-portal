import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  applicationInsertFromInput,
  CV_BUCKET,
  CV_MIME_TYPES,
  FreelancerApplicationInputSchema,
} from "@/lib/freelancer/application";
import { verifyCvObjectPath } from "@/lib/freelancer/cv-storage";
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

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

/**
 * Confirms the object really was uploaded and reports what Storage actually
 * received. Client-declared size and MIME type are never trusted for the
 * stored record.
 */
async function inspectUploadedCv(admin: AdminClient, objectPath: string) {
  const separator = objectPath.lastIndexOf("/");
  const folder = objectPath.slice(0, separator);
  const filename = objectPath.slice(separator + 1);

  const { data, error } = await admin.storage
    .from(CV_BUCKET)
    .list(folder, { search: filename, limit: 1 });
  if (error) throw error;

  const object = data?.find((entry) => entry.name === filename);
  if (!object) return null;

  const metadata = (object.metadata ?? {}) as {
    size?: number;
    mimetype?: string;
  };
  const reportedMimeType =
    typeof metadata.mimetype === "string" ? metadata.mimetype : null;

  return {
    sizeBytes:
      typeof metadata.size === "number" && metadata.size > 0
        ? metadata.size
        : null,
    // A type outside the accepted set would only fail the row's CHECK
    // constraint; fall back to the declared one and let the reviewer see the
    // file itself.
    mimeType:
      reportedMimeType &&
      (CV_MIME_TYPES as readonly string[]).includes(reportedMimeType)
        ? reportedMimeType
        : null,
  };
}

/**
 * Public freelancer application.
 *
 * Nothing here becomes visible on the platform: the row lands in
 * `freelancer_applications` and waits for an administrator to review and
 * publish it.
 */
export async function POST(request: Request) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);

    const payload = await readJsonWithLimit(request, 24_000);
    const parsed = FreelancerApplicationInputSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Bitte prüfen Sie die markierten Felder.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    // A bot that filled the honeypot gets the same answer as a real applicant.
    if (parsed.data.website) {
      return NextResponse.json({ status: "received" }, { status: 201 });
    }

    const ipHash = pseudonymizeIp(getClientIp(request));
    const limit = takeRateLimit(`freelancer-apply:${ipHash}`, 5, 60 * 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte später erneut versuchen." },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        },
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return NextResponse.json(
        { error: "Serverkonfiguration unvollständig." },
        { status: 503 },
      );
    }

    const input = parsed.data;
    if (input.cv && !verifyCvObjectPath(input.cv.storagePath, input.cv.token)) {
      return NextResponse.json(
        { error: "Der Lebenslauf-Upload ist ungültig. Bitte erneut hochladen." },
        { status: 400 },
      );
    }

    const admin = createAdminSupabaseClient();
    const uploaded = input.cv
      ? await inspectUploadedCv(admin, input.cv.storagePath)
      : null;

    const user = await getCurrentUser();
    const insert = applicationInsertFromInput(input, {
      submittedByUserId: user?.id ?? null,
      consentAt: new Date().toISOString(),
    });

    if (input.cv && uploaded) {
      insert.cv_size_bytes = uploaded.sizeBytes ?? input.cv.sizeBytes;
      insert.cv_mime_type = uploaded.mimeType ?? input.cv.mimeType;
    } else if (input.cv) {
      insert.cv_storage_path = null;
      insert.cv_original_filename = null;
      insert.cv_mime_type = null;
      insert.cv_size_bytes = null;
    }

    // A resubmission replaces the applicant's own pending entry instead of
    // queueing a near-duplicate for the reviewer. Decided applications stay.
    const { data: pending, error: pendingError } = await admin
      .from("freelancer_applications")
      .select("id,cv_storage_path")
      .eq("contact_email", insert.contact_email)
      .in("status", ["submitted", "in_review"]);
    if (pendingError) throw pendingError;

    if (pending?.length) {
      const staleCvPaths = pending
        .map((row) => row.cv_storage_path as string | null)
        .filter((path): path is string => Boolean(path));

      const { error: deleteError } = await admin
        .from("freelancer_applications")
        .delete()
        .in(
          "id",
          pending.map((row) => row.id as string),
        );
      if (deleteError) throw deleteError;

      if (staleCvPaths.length) {
        await admin.storage.from(CV_BUCKET).remove(staleCvPaths);
      }
    }

    const { data, error } = await admin
      .from("freelancer_applications")
      .insert(insert)
      .select("id")
      .single();
    if (error) throw error;

    await writeAuditEvent({
      actorUserId: user?.id ?? null,
      action: "freelancer_application_submitted",
      targetType: "freelancer_application",
      targetId: data.id as string,
      outcome: "success",
      traceId,
      metadata: {
        hasCv: Boolean(insert.cv_storage_path),
        hasBookingUrl: Boolean(insert.booking_url),
        skillCount: insert.skills.length,
        replacedPending: pending?.length ?? 0,
      },
    });

    return NextResponse.json({ status: "received" }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    await writeAuditEvent({
      actorUserId: null,
      action: "freelancer_application_failed",
      targetType: "freelancer_application",
      outcome: "failed",
      traceId,
    }).catch(() => undefined);
    return NextResponse.json(
      { error: "Die Bewerbung konnte nicht gespeichert werden." },
      { status: 503 },
    );
  }
}
