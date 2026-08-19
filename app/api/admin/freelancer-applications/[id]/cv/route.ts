import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import {
  createCvDownloadUrl,
  getApplication,
} from "@/lib/freelancer/applications-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Redirects the reviewer to a two-minute signed URL. The bucket stays private
 * and the CV is never proxied through a permanent link.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, admin] = await Promise.all([
      context.params,
      requireAdminUser(),
    ]);
    const applicationId = z.uuid().parse(id);

    const application = await getApplication(applicationId);
    if (!application?.cv_storage_path) {
      return NextResponse.json(
        { error: "Für diese Bewerbung liegt kein Lebenslauf vor." },
        { status: 404 },
      );
    }

    const signedUrl = await createCvDownloadUrl(application.cv_storage_path);

    await writeAuditEvent({
      actorUserId: admin.id,
      action: "freelancer_application_cv_viewed",
      targetType: "freelancer_application",
      targetId: application.id,
      outcome: "success",
      required: true,
    });

    return NextResponse.redirect(signedUrl, {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Der Lebenslauf konnte nicht geöffnet werden." },
      { status: 503 },
    );
  }
}
