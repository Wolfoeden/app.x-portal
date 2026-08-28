import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  fetchDownloadableCvDocument,
  FREELANCER_CV_SIGNED_URL_TTL_SECONDS,
  isSafeFreelancerCvStorageObject,
  safeCvDownloadFilename,
} from "@/lib/data/freelancer-cvs";
import { MatchingEvaluationSnapshotSchema } from "@/lib/domain";
import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
  readJsonWithLimit,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ProfileIdSchema = z.string().uuid();
const ProjectIdSchema = z.string().uuid();
const CvDownloadInputSchema = z
  .object({ projectId: ProjectIdSchema })
  .strict();
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Netlify-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
  Vary: "Cookie",
};

function json(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string> = {},
) {
  return NextResponse.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });
}

function retryAfterResponse(seconds: number) {
  return json(
    { error: "Zu viele CV-Anfragen. Bitte versuchen Sie es später erneut." },
    429,
    { "Retry-After": String(seconds) },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let actorUserId: string | null = null;
  let profileId: string | null = null;
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    actorUserId = user.id;
    if (user.isAnonymous) {
      await writeAuditEvent({
        actorUserId: user.id,
        action: "freelancer_cv_download_denied",
        targetType: "freelancer_profile",
        outcome: "denied",
        metadata: { reason: "anonymous_session" },
      });
      return json(
        { error: "Bitte melden Sie sich an, um einen CV herunterzuladen." },
        401,
      );
    }

    profileId = ProfileIdSchema.parse((await context.params).id);
    const { projectId } = CvDownloadInputSchema.parse(
      await readJsonWithLimit(request, 1_024),
    );
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return json({ error: "Der CV-Download ist gerade nicht verfügbar." }, 503);
    }

    const [userLimit, ipLimit] = await Promise.all([
      consumeRateLimit(`cv-download-user:${user.id}`, 30, 10 * 60_000),
      consumeRateLimit(
        `cv-download-ip:${pseudonymizeIp(getClientIp(request))}`,
        60,
        10 * 60_000,
      ),
    ]);
    if (!userLimit.allowed || !ipLimit.allowed) {
      return retryAfterResponse(
        Math.max(userLimit.retryAfterSeconds, ipLimit.retryAfterSeconds),
      );
    }

    const admin = createAdminSupabaseClient();
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id,brief_status")
      .eq("id", projectId)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (projectError) throw projectError;

    if (
      !project ||
      (project.brief_status !== "ready" && project.brief_status !== "manual")
    ) {
      await writeAuditEvent({
        actorUserId: user.id,
        action: "freelancer_cv_download_denied",
        targetType: "freelancer_profile",
        targetId: profileId,
        outcome: "denied",
        metadata: { reason: "project_has_no_actionable_latest_shortlist" },
      });
      return json({ error: "Der CV ist nicht verfügbar." }, 404);
    }

    const { data: shortlist, error: shortlistError } = await admin
      .from("shortlists")
      .select("id,result_status")
      .eq("project_id", projectId)
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (shortlistError) throw shortlistError;

    // Only the latest persisted, ranked result is actionable. While a new
    // analysis is pending, or if the latest result is a clarification/partial
    // state, an older recommendation cannot authorize a download.
    if (
      !shortlist ||
      shortlist.result_status !== "ranked"
    ) {
      await writeAuditEvent({
        actorUserId: user.id,
        action: "freelancer_cv_download_denied",
        targetType: "freelancer_profile",
        targetId: profileId,
        outcome: "denied",
        metadata: { reason: "project_has_no_actionable_latest_shortlist" },
      });
      return json({ error: "Der CV ist nicht verfügbar." }, 404);
    }

    const { data: match, error: matchError } = await admin
      .from("matches")
      .select("id,evaluation_snapshot")
      .eq("shortlist_id", shortlist.id)
      .eq("owner_user_id", user.id)
      .eq("freelancer_profile_id", profileId)
      .maybeSingle();
    if (matchError) throw matchError;
    const evaluation = MatchingEvaluationSnapshotSchema.safeParse(
      match?.evaluation_snapshot,
    );
    // Primary, alternative and partial are all decided roles and authorize a
    // download. An absent or unrecognised role is not a decision and still
    // fails closed.
    if (
      !match ||
      !evaluation.success ||
      (evaluation.data.recommendationRole !== "primary" &&
        evaluation.data.recommendationRole !== "alternative" &&
        evaluation.data.recommendationRole !== "partial")
    ) {
      await writeAuditEvent({
        actorUserId: user.id,
        action: "freelancer_cv_download_denied",
        targetType: "freelancer_profile",
        targetId: profileId,
        outcome: "denied",
        metadata: { reason: "profile_not_in_owned_project_matches" },
      });
      return json({ error: "Der CV ist nicht verfügbar." }, 404);
    }

    const document = await fetchDownloadableCvDocument(admin, profileId);
    if (!document) {
      await writeAuditEvent({
        actorUserId: user.id,
        action: "freelancer_cv_download_denied",
        targetType: "freelancer_profile",
        targetId: profileId,
        outcome: "denied",
        metadata: { reason: "cv_missing_or_disabled" },
      });
      return json({ error: "Der CV ist nicht verfügbar." }, 404);
    }

    const storage = admin.storage.from(document.storageBucket);
    const { data: objectInfo, error: objectInfoError } = await storage.info(
      document.storagePath,
    );
    if (
      objectInfoError ||
      !isSafeFreelancerCvStorageObject(objectInfo, document)
    ) {
      throw objectInfoError ?? new Error("unsafe_cv_storage_metadata");
    }

    const { data, error } = await storage.createSignedUrl(
      document.storagePath,
      FREELANCER_CV_SIGNED_URL_TTL_SECONDS,
      {
        download: safeCvDownloadFilename(
          document.originalFilename,
          document.profileId,
        ),
      },
    );
    if (error || !data?.signedUrl) throw error ?? new Error("cv_signing_failed");
    const signedUrl = new URL(data.signedUrl);
    const configuredSupabaseOrigin = new URL(getSupabasePublicEnv().url).origin;
    const expectedStoragePrefix = `/storage/v1/object/sign/${document.storageBucket}/`;
    if (
      signedUrl.protocol !== "https:" ||
      signedUrl.origin !== configuredSupabaseOrigin ||
      !signedUrl.pathname.startsWith(expectedStoragePrefix) ||
      !signedUrl.searchParams.get("token")
    ) {
      throw new Error("invalid_cv_signed_url");
    }

    // A CV is sensitive personal data. If the durable audit cannot be written,
    // do not release the already-created but still undisclosed URL.
    await writeAuditEvent({
      actorUserId: user.id,
      action: "freelancer_cv_download_authorized",
      targetType: "freelancer_profile",
      targetId: profileId,
      outcome: "success",
      metadata: {
        matchId: match.id,
        projectId,
        documentVersion: document.version,
      },
      required: true,
    });

    return json(
      {
        downloadUrl: signedUrl.toString(),
        expiresInSeconds: FREELANCER_CV_SIGNED_URL_TTL_SECONDS,
      },
      200,
    );
  } catch (error) {
    if (error instanceof Response) {
      return json(
        { error: error.status === 401 ? "Anmeldung erforderlich." : "Anfrage abgelehnt." },
        error.status,
      );
    }
    if (error instanceof z.ZodError) {
      return json({ error: "Ungültiges Freelancer-Profil." }, 400);
    }
    await writeAuditEvent({
      actorUserId,
      action: "freelancer_cv_download_failed",
      targetType: "freelancer_profile",
      targetId: profileId,
      outcome: "failed",
    }).catch(() => undefined);
    return json({ error: "Der CV-Download ist gerade nicht verfügbar." }, 503);
  }
}
