import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { FREELANCER_CV_BUCKET } from "@/lib/data/freelancer-cvs";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import {
  APPLICATION_COLUMNS,
  profileInsertFromDecision,
  slugFromName,
  slugWithAttempt,
  type ApplicationRow,
  type ApplicationStatus,
  type PublishDecision,
} from "./application";

const LIST_COLUMNS =
  "id,status,full_name,contact_email,role_title,location_text,skills,hourly_rate_minor,day_rate_minor,currency,availability_status,booking_url,cv_storage_path,created_at,reviewed_at,published_profile_id";

export type ApplicationListItem = {
  id: string;
  status: ApplicationStatus;
  full_name: string;
  contact_email: string;
  role_title: string;
  location_text: string | null;
  skills: string[];
  hourly_rate_minor: number | null;
  day_rate_minor: number | null;
  currency: string | null;
  availability_status: string;
  booking_url: string | null;
  cv_storage_path: string | null;
  created_at: string;
  reviewed_at: string | null;
  published_profile_id: string | null;
};

export async function listApplications(options?: {
  status?: ApplicationStatus;
  limit?: number;
}): Promise<ApplicationListItem[]> {
  const admin = createAdminSupabaseClient();
  let query = admin
    .from("freelancer_applications")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 200);

  if (options?.status) query = query.eq("status", options.status);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ApplicationListItem[];
}

export async function countApplicationsByStatus(): Promise<
  Record<ApplicationStatus, number>
> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("freelancer_applications")
    .select("status")
    .limit(5_000);
  if (error) throw error;

  const counts: Record<ApplicationStatus, number> = {
    submitted: 0,
    in_review: 0,
    approved: 0,
    rejected: 0,
  };
  for (const row of (data ?? []) as Array<{ status: ApplicationStatus }>) {
    counts[row.status] += 1;
  }
  return counts;
}

export async function getApplication(
  id: string,
): Promise<ApplicationRow | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("freelancer_applications")
    .select(APPLICATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as ApplicationRow | null) ?? null;
}

export async function createCvDownloadUrl(
  objectPath: string,
  expiresInSeconds = 120,
): Promise<string> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.storage
    .from(FREELANCER_CV_BUCKET)
    .createSignedUrl(objectPath, expiresInSeconds, { download: true });
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Hands an approved application's CV to the published profile.
 *
 * The object is re-uploaded rather than copied so `contentType`,
 * `cacheControl` and the `<profile-uuid>/cv-v<version>.pdf` key are set
 * explicitly: `/api/freelancers/[id]/cv` re-reads the live Storage metadata
 * before signing and fails closed on anything else. `is_downloadable` stays the
 * reviewer's separate decision — storing a CV for review is not the same
 * permission as showing it to customers.
 */
async function transferCvToProfile(
  admin: SupabaseClient,
  input: {
    application: ApplicationRow;
    profileId: string;
    downloadable: boolean;
  },
): Promise<boolean> {
  const source = input.application.cv_storage_path;
  if (!source || !input.application.cv_original_filename) return false;

  const targetPath = `${input.profileId}/cv-v1.pdf`;
  const { data: file, error: downloadError } = await admin.storage
    .from(FREELANCER_CV_BUCKET)
    .download(source);
  if (downloadError || !file) return false;

  const { error: uploadError } = await admin.storage
    .from(FREELANCER_CV_BUCKET)
    .upload(targetPath, file, {
      contentType: "application/pdf",
      cacheControl: "60",
      upsert: false,
    });
  if (uploadError) return false;

  const { error: metadataError } = await admin
    .from("freelancer_cv_documents")
    .insert({
      profile_id: input.profileId,
      storage_bucket: FREELANCER_CV_BUCKET,
      storage_path: targetPath,
      original_filename: input.application.cv_original_filename,
      mime_type: "application/pdf",
      byte_size: input.application.cv_size_bytes ?? file.size,
      version: 1,
      is_downloadable: input.downloadable,
    });
  if (metadataError) {
    await admin.storage.from(FREELANCER_CV_BUCKET).remove([targetPath]);
    return false;
  }

  // The staging copy has served its purpose; the profile store is now the
  // single place this document lives.
  await admin.storage.from(FREELANCER_CV_BUCKET).remove([source]);
  return true;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

export class PublishConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishConflictError";
  }
}

/**
 * Insert the catalogue row, retrying the slug until it is unique.
 *
 * The slug is the only column a second application can collide on, and two
 * people really can share a name — so a collision is an expected outcome, not
 * an error to surface to the reviewer.
 */
async function insertProfileWithUniqueSlug(
  admin: SupabaseClient,
  decision: PublishDecision,
  checkedAt: string,
  ownerUserId: string | null,
): Promise<{ id: string; slug: string }> {
  const base = decision.slug ?? slugFromName(decision.displayName);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = slugWithAttempt(base, attempt);
    const { data, error } = await admin
      .from("freelancer_profiles")
      .insert(
        profileInsertFromDecision(decision, {
          slug,
          checkedAt,
          ownerUserId,
        }),
      )
      .select("id,slug")
      .single();

    if (!error) return { id: data.id as string, slug: data.slug as string };
    if (!isUniqueViolation(error)) throw error;
  }

  throw new PublishConflictError(
    "Es konnte keine freie Profil-Adresse (Slug) gefunden werden.",
  );
}

export type PublishResult = {
  profileId: string;
  slug: string;
  /** False when no CV was submitted or the handover did not complete. */
  cvTransferred: boolean;
  cvSubmitted: boolean;
};

export async function publishApplication(input: {
  application: ApplicationRow;
  decision: PublishDecision;
  reviewerUserId: string;
}): Promise<PublishResult> {
  if (input.application.published_profile_id) {
    throw new PublishConflictError(
      "Diese Bewerbung wurde bereits veröffentlicht.",
    );
  }

  const admin = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const profile = await insertProfileWithUniqueSlug(
    admin,
    input.decision,
    now,
    input.application.submitted_by_user_id,
  );

  // `published_profile_id is null` is the concurrency guard: if a second
  // reviewer published a moment earlier, this update matches no row.
  const { data: claimed, error } = await admin
    .from("freelancer_applications")
    .update({
      status: "approved",
      review_notes: input.decision.reviewNotes,
      reviewed_by_user_id: input.reviewerUserId,
      reviewed_at: now,
      published_profile_id: profile.id,
    })
    .eq("id", input.application.id)
    .is("published_profile_id", null)
    .select("id");

  // Never leave a live catalogue row whose application still reads as open:
  // the reviewer would see "not published" while the profile is matchable.
  if (error) {
    await admin.from("freelancer_profiles").delete().eq("id", profile.id);
    throw error;
  }
  if (!claimed?.length) {
    await admin.from("freelancer_profiles").delete().eq("id", profile.id);
    throw new PublishConflictError(
      "Diese Bewerbung wurde inzwischen von jemand anderem entschieden.",
    );
  }

  // The CV is an attachment, not the profile. A failed handover is reported
  // back rather than rolling back a profile that is otherwise correct and live.
  const cvSubmitted = Boolean(input.application.cv_storage_path);
  const cvTransferred = cvSubmitted
    ? await transferCvToProfile(admin, {
        application: input.application,
        profileId: profile.id,
        downloadable: input.decision.cvDownloadable,
      })
    : false;

  if (cvTransferred) {
    await admin
      .from("freelancer_applications")
      .update({ cv_storage_path: null })
      .eq("id", input.application.id);
  }

  return {
    profileId: profile.id,
    slug: profile.slug,
    cvSubmitted,
    cvTransferred,
  };
}

export async function setApplicationStatus(input: {
  applicationId: string;
  status: Extract<ApplicationStatus, "in_review" | "rejected" | "submitted">;
  reviewerUserId: string;
  reviewNotes: string | null;
}): Promise<void> {
  const admin = createAdminSupabaseClient();
  const decided = input.status === "rejected";
  const { error } = await admin
    .from("freelancer_applications")
    .update({
      status: input.status,
      review_notes: input.reviewNotes,
      reviewed_by_user_id: decided ? input.reviewerUserId : null,
      reviewed_at: decided ? new Date().toISOString() : null,
    })
    .eq("id", input.applicationId)
    .is("published_profile_id", null);

  if (isUniqueViolation(error)) {
    // Only `freelancer_applications_open_email_uidx` can collide here: the
    // applicant already has a newer open application under the same address.
    throw new PublishConflictError(
      "Für diese E-Mail-Adresse liegt bereits eine offene Bewerbung vor.",
    );
  }
  if (error) throw error;
}
