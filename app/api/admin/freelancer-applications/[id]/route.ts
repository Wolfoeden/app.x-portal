import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";
import { PublishDecisionSchema } from "@/lib/freelancer/application";
import {
  getApplication,
  publishApplication,
  PublishConflictError,
  setApplicationStatus,
} from "@/lib/freelancer/applications-data";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ActionSchema = z.enum(["publish", "reject", "start_review", "reopen"]);
const ReviewNotesSchema = z
  .string()
  .trim()
  .max(4_000)
  .nullish()
  .transform((value) => value || null);

/**
 * The single verification endpoint. Publishing is the only path that creates a
 * `freelancer_profiles` row, and it always runs under a named administrator.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const traceId = randomUUID();
  let action: z.infer<typeof ActionSchema> | null = null;
  let applicationId: string | null = null;

  try {
    assertSameOrigin(request);
    const [{ id }, admin] = await Promise.all([
      context.params,
      requireAdminUser(),
    ]);
    applicationId = z.uuid().parse(id);

    const body = (await readJsonWithLimit(request, 32_000)) as Record<
      string,
      unknown
    >;
    action = ActionSchema.parse(body.action);

    const application = await getApplication(applicationId);
    if (!application) {
      return NextResponse.json(
        { error: "Bewerbung nicht gefunden." },
        { status: 404 },
      );
    }

    if (action === "publish") {
      if (application.published_profile_id) {
        return NextResponse.json(
          { error: "Diese Bewerbung wurde bereits veröffentlicht." },
          { status: 409 },
        );
      }

      const parsed = PublishDecisionSchema.safeParse(body.decision);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "Das Profil ist noch nicht vollständig.",
            issues: parsed.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
          { status: 400 },
        );
      }

      const result = await publishApplication({
        application,
        decision: parsed.data,
        reviewerUserId: admin.id,
      });

      await writeAuditEvent({
        actorUserId: admin.id,
        action: "freelancer_application_published",
        targetType: "freelancer_application",
        targetId: application.id,
        outcome: "success",
        traceId,
        metadata: {
          profileId: result.profileId,
          slug: result.slug,
          verificationStatus: parsed.data.verificationStatus,
          verifiedFactCount: parsed.data.verifiedFacts.length,
          cvTransferred: result.cvTransferred,
          cvDownloadable: parsed.data.cvDownloadable,
        },
        required: true,
      });

      return NextResponse.json({
        status: "published",
        profileId: result.profileId,
        slug: result.slug,
        cvSubmitted: result.cvSubmitted,
        cvTransferred: result.cvTransferred,
      });
    }

    const reviewNotes = ReviewNotesSchema.parse(body.reviewNotes);
    const nextStatus =
      action === "reject"
        ? "rejected"
        : action === "start_review"
          ? "in_review"
          : "submitted";

    if (application.published_profile_id) {
      return NextResponse.json(
        {
          error:
            "Diese Bewerbung ist bereits veröffentlicht und kann nicht mehr geändert werden.",
        },
        { status: 409 },
      );
    }

    await setApplicationStatus({
      applicationId: application.id,
      status: nextStatus,
      reviewerUserId: admin.id,
      reviewNotes,
    });

    await writeAuditEvent({
      actorUserId: admin.id,
      action: `freelancer_application_${nextStatus}`,
      targetType: "freelancer_application",
      targetId: application.id,
      outcome: "success",
      traceId,
      required: true,
    });

    return NextResponse.json({ status: nextStatus });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof PublishConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    }

    await writeAuditEvent({
      actorUserId: null,
      action: "freelancer_application_review_failed",
      targetType: "freelancer_application",
      targetId: applicationId,
      outcome: "failed",
      traceId,
      metadata: { requestedAction: action ?? "unknown" },
    }).catch(() => undefined);

    return NextResponse.json(
      { error: "Die Aktion konnte nicht ausgeführt werden." },
      { status: 503 },
    );
  }
}
