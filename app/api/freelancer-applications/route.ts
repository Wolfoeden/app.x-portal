import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  applicationInsertFromInput,
  CV_BUCKET,
  CV_MAX_BYTES,
  CV_MIME_TYPES,
  FreelancerApplicationInputSchema,
} from "@/lib/freelancer/application";
import { recordInviteConversion } from "@/lib/sourcing/conversion";
import { applicationExtrasAvailable } from "@/lib/freelancer/applications-data";
import { avatarMimeTypeFromPath } from "@/lib/freelancer/avatar-limits";
import {
  AVATAR_BUCKET,
  inspectUploadedAvatar,
  verifyApplicationPhotoPath,
} from "@/lib/freelancer/avatar-storage";
import {
  hasPdfMagicBytes,
  verifyCvObjectPath,
} from "@/lib/freelancer/cv-storage";
import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
  readJsonWithLimit,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

type CvInspection =
  | { ok: true; sizeBytes: number | null; mimeType: string | null }
  | { ok: false; reason: "missing" | "too_large" | "not_pdf" };

/**
 * Confirms the object really was uploaded and reports what Storage actually
 * received. Client-declared size and MIME type are never trusted for the
 * stored record.
 *
 * Bis hierher hatte niemand die Datei selbst angesehen: Der Browser lädt mit
 * einem signierten Ticket direkt zu Storage hoch, und `mimeType` wie
 * `sizeBytes` im Ticket sind Behauptungen des Clients. Auch der von Storage
 * gemeldete Content-Type stammt aus demselben Upload. Deshalb entscheiden hier
 * die ersten Bytes — dieselbe Prüfung, die der Avatar-Pfad längst macht.
 */
async function inspectUploadedCv(
  admin: AdminClient,
  objectPath: string,
): Promise<CvInspection> {
  const separator = objectPath.lastIndexOf("/");
  const folder = objectPath.slice(0, separator);
  const filename = objectPath.slice(separator + 1);

  const { data, error } = await admin.storage
    .from(CV_BUCKET)
    .list(folder, { search: filename, limit: 1 });
  if (error) throw error;

  const object = data?.find((entry) => entry.name === filename);
  if (!object) return { ok: false, reason: "missing" };

  const metadata = (object.metadata ?? {}) as {
    size?: number;
    mimetype?: string;
  };
  const reportedMimeType =
    typeof metadata.mimetype === "string" ? metadata.mimetype : null;
  const sizeBytes =
    typeof metadata.size === "number" && metadata.size > 0
      ? metadata.size
      : null;

  // Die angekündigte Größe hat das Schema geprüft, die tatsächliche noch nicht.
  if (sizeBytes !== null && sizeBytes > CV_MAX_BYTES) {
    await discardUploadedCv(admin, objectPath);
    return { ok: false, reason: "too_large" };
  }

  const { data: file, error: downloadError } = await admin.storage
    .from(CV_BUCKET)
    .download(objectPath);
  if (downloadError || !file) return { ok: false, reason: "missing" };

  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!hasPdfMagicBytes(head)) {
    await discardUploadedCv(admin, objectPath);
    return { ok: false, reason: "not_pdf" };
  }

  return {
    ok: true,
    sizeBytes,
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

/** Eine abgelehnte Datei bleibt nicht liegen. */
async function discardUploadedCv(admin: AdminClient, objectPath: string) {
  await admin.storage
    .from(CV_BUCKET)
    .remove([objectPath])
    .catch(() => undefined);
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
    const user = await requireCurrentUser();
    if (user.isAnonymous || !user.email) {
      throw new Response("Ein dauerhaftes Konto ist erforderlich.", {
        status: 403,
      });
    }

    // Bis zu acht Referenzprojekte brauchen Platz; der Rest des Formulars
    // kommt mit einem Drittel davon aus.
    const payload = await readJsonWithLimit(request, 64_000);
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
    if (
      parsed.data.contactEmail.toLocaleLowerCase("en-US") !==
      user.email.toLocaleLowerCase("en-US")
    ) {
      return NextResponse.json(
        { error: "Bitte verwenden Sie die E-Mail-Adresse Ihres XPORTAL-Kontos." },
        { status: 400 },
      );
    }

    const ipHash = pseudonymizeIp(getClientIp(request));
    const limit = await consumeRateLimit(
      `freelancer-apply:${ipHash}`,
      5,
      60 * 60_000,
    );
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

    if (input.photo && !verifyApplicationPhotoPath(input.photo.storagePath, input.photo.token)) {
      return NextResponse.json(
        { error: "Der Foto-Upload ist ungültig. Bitte das Foto erneut hochladen." },
        { status: 400 },
      );
    }

    const admin = createAdminSupabaseClient();
    const uploaded = input.cv
      ? await inspectUploadedCv(admin, input.cv.storagePath)
      : null;

    // Das Foto zählt erst, wenn seine ersten Bytes zum Bildtyp im Pfad passen.
    // Ein ungültiges wird gelöscht und gemeldet, nicht still verworfen.
    if (input.photo) {
      const photo = await inspectUploadedAvatar(admin, input.photo.storagePath);
      if (!photo || photo.mimeType !== avatarMimeTypeFromPath(input.photo.storagePath)) {
        await admin.storage.from(AVATAR_BUCKET).remove([input.photo.storagePath]).catch(() => undefined);
        return NextResponse.json(
          { error: "Das Foto ist kein gültiges Bild. Erlaubt sind JPEG, PNG oder WebP bis 5 MB." },
          { status: 400 },
        );
      }
    }

    // Eine Datei, die keine PDF ist, wird nicht stillschweigend verworfen: der
    // Bewerber hat sie angehängt und soll erfahren, warum sie nicht ankommt.
    // Nur ein gar nicht erst angekommenes Objekt bleibt folgenlos.
    if (uploaded && !uploaded.ok && uploaded.reason !== "missing") {
      return NextResponse.json(
        {
          error:
            uploaded.reason === "too_large"
              ? "Die Datei ist größer als 10 MB. Bitte laden Sie eine kleinere PDF-Datei hoch."
              : "Die hochgeladene Datei ist keine PDF-Datei. Bitte laden Sie den Lebenslauf als PDF hoch.",
        },
        { status: 400 },
      );
    }

    const insert = applicationInsertFromInput(input, {
      submittedByUserId: user.id,
      consentAt: new Date().toISOString(),
    });

    if (input.cv && uploaded?.ok) {
      insert.cv_size_bytes = uploaded.sizeBytes ?? input.cv.sizeBytes;
      insert.cv_mime_type = uploaded.mimeType ?? input.cv.mimeType;
    } else if (input.cv) {
      insert.cv_storage_path = null;
      insert.cv_original_filename = null;
      insert.cv_mime_type = null;
      insert.cv_size_bytes = null;
    }

    // Projekte und Foto nur mit Migration 20261006100000. Das Formular blendet
    // beide ohne sie aus; was trotzdem kommt, wird nicht gespeichert.
    const extras = await applicationExtrasAvailable(admin);
    const row: Partial<typeof insert> = { ...insert };
    if (!extras) {
      delete row.reference_projects;
      delete row.photo_storage_path;
    }

    // A resubmission replaces only this authenticated applicant's own pending
    // entry. An email address alone is not an ownership credential.
    const { data: pendingRows, error: pendingError } = await admin
      .from("freelancer_applications")
      .select(extras ? "id,cv_storage_path,photo_storage_path" : "id,cv_storage_path")
      .eq("submitted_by_user_id", user.id)
      .in("status", ["submitted", "in_review"]);
    if (pendingError) throw pendingError;
    const pending = (pendingRows ?? []) as unknown as Array<{
      id: string;
      cv_storage_path: string | null;
      photo_storage_path?: string | null;
    }>;

    if (pending.length) {
      const staleCvPaths = pending
        .map((row) => row.cv_storage_path as string | null)
        .filter((path): path is string => Boolean(path));
      const stalePhotoPaths = pending
        .map((row) => row.photo_storage_path ?? null)
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
      if (stalePhotoPaths.length) {
        await admin.storage.from(AVATAR_BUCKET).remove(stalePhotoPaths);
      }
    }

    const { data, error } = await admin
      .from("freelancer_applications")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;

    // Kam die Person über eine Einladung, wird der recherchierte Kandidat als
    // beantwortet vermerkt. Er bleibt eine eigene Zeile — sie gehört keinem
    // Konto, diese Bewerbung schon — und fällt damit zugleich aus der
    // 30-Tage-Löschung heraus.
    //
    // Nach dem Anlegen und ohne Folgen für den Bewerber: Ein fehlender Vermerk
    // kostet eine Zahl in unserer Auswertung, nicht seine Anmeldung.
    const fromInvite = await recordInviteConversion({
      token: input.inviteToken,
      applicationId: data.id as string,
    });

    await writeAuditEvent({
      actorUserId: user.id,
      action: "freelancer_application_submitted",
      targetType: "freelancer_application",
      targetId: data.id as string,
      outcome: "success",
      traceId,
      metadata: {
        hasCv: Boolean(insert.cv_storage_path),
        hasBookingUrl: Boolean(insert.booking_url),
        skillCount: insert.skills.length,
        projectCount: extras ? insert.reference_projects.length : 0,
        hasPhoto: extras && Boolean(insert.photo_storage_path),
        replacedPending: pending.length,
        fromInvite,
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
