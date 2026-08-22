import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const FREELANCER_CV_BUCKET = "freelancer-cvs";
export const FREELANCER_CV_SIGNED_URL_TTL_SECONDS = 60;

export type FreelancerCvAccess =
  | "login_required"
  | "available"
  | "missing"
  | "forbidden";

export type FreelancerCvDocument = {
  profileId: string;
  storageBucket: string;
  storagePath: string;
  originalFilename: string;
  mimeType: "application/pdf";
  byteSize: number;
  version: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function cacheMaxAgeSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/(?:^|,)\s*max-age=(\d+)\s*(?:,|$)/iu);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

/** Verifies the Storage API's live object metadata before a URL is signed. */
export function isSafeFreelancerCvStorageObject(
  value: unknown,
  document: FreelancerCvDocument,
): boolean {
  const object = record(value);
  const metadata = record(object?.metadata);
  if (!object) return false;

  const cacheControl = object.cacheControl ?? metadata?.cacheControl;
  const contentType = object.contentType ?? metadata?.mimetype;
  const size = object.size ?? metadata?.size;
  const maxAge = cacheMaxAgeSeconds(cacheControl);

  return (
    object.bucketId === document.storageBucket &&
    contentType === document.mimeType &&
    size === document.byteSize &&
    maxAge !== null &&
    maxAge >= 0 &&
    maxAge <= FREELANCER_CV_SIGNED_URL_TTL_SECONDS
  );
}

type CvAwareProfile = {
  id: string;
  recommendationRole?: "primary" | "alternative" | "partial" | null;
};

type FreelancerCvDocumentRow = {
  profile_id: string;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  version: number;
  is_downloadable: boolean;
};

function uniqueProfileIds(profileIds: readonly string[]): string[] {
  return [...new Set(profileIds)].filter(Boolean);
}

/**
 * Returns only availability, never object paths or filenames. Callers must not
 * invoke this for anonymous sessions because CV existence is account-only
 * information.
 */
export async function fetchDownloadableCvProfileIds(
  supabase: SupabaseClient,
  profileIds: readonly string[],
): Promise<Set<string>> {
  const ids = uniqueProfileIds(profileIds);
  if (!ids.length) return new Set();

  const { data, error } = await supabase
    .from("freelancer_cv_documents")
    .select("profile_id")
    .in("profile_id", ids)
    .eq("is_downloadable", true);
  if (error) throw error;

  return new Set(
    (data as Array<Pick<FreelancerCvDocumentRow, "profile_id">>).map(
      (row) => row.profile_id,
    ),
  );
}

/**
 * Adds the public CV state without exposing document metadata. Anonymous users
 * deliberately receive the same state whether or not a document exists.
 * Partial matches are not recommendations and therefore never gain access.
 */
export async function attachFreelancerCvAccess<T extends CvAwareProfile>(
  supabase: SupabaseClient,
  profiles: readonly T[],
  isAnonymous: boolean,
  actionable = true,
): Promise<Array<T & { cvAccess: FreelancerCvAccess }>> {
  // Partial results are included: they are shown as not recommended, but the
  // reader can still evaluate and contact them. Legacy and unclassified
  // snapshots stay closed, because an absent role is not a decision.
  const eligibleIds = profiles
    .filter(
      (profile) =>
        profile.recommendationRole === "primary" ||
        profile.recommendationRole === "alternative" ||
        profile.recommendationRole === "partial",
    )
    .map((profile) => profile.id);
  let availabilityFailed = false;
  let availableIds = new Set<string>();
  if (actionable && !isAnonymous) {
    try {
      availableIds = await fetchDownloadableCvProfileIds(supabase, eligibleIds);
    } catch {
      // CV is an optional enhancement. A database outage or a code-before-DB
      // rollout must not break the core chat; deny access until it recovers.
      availabilityFailed = true;
    }
  }

  return profiles.map((profile) => ({
    ...profile,
    cvAccess:
      profile.recommendationRole !== "primary" &&
      profile.recommendationRole !== "alternative" &&
      profile.recommendationRole !== "partial"
        ? "forbidden"
        : !actionable
          ? isAnonymous
            ? "login_required"
            : "forbidden"
        : isAnonymous
          ? "login_required"
          : availabilityFailed
            ? "forbidden"
          : availableIds.has(profile.id)
            ? "available"
            : "missing",
  }));
}

export async function fetchDownloadableCvDocument(
  supabase: SupabaseClient,
  profileId: string,
): Promise<FreelancerCvDocument | null> {
  const { data, error } = await supabase
    .from("freelancer_cv_documents")
    .select(
      "profile_id,storage_bucket,storage_path,original_filename,mime_type,byte_size,version,is_downloadable",
    )
    .eq("profile_id", profileId)
    .eq("is_downloadable", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as FreelancerCvDocumentRow;
  if (
    row.storage_bucket !== FREELANCER_CV_BUCKET ||
    row.mime_type !== "application/pdf" ||
    !Number.isSafeInteger(row.byte_size) ||
    row.byte_size < 1 ||
    !Number.isSafeInteger(row.version) ||
    row.version < 1 ||
    row.storage_path !== `${row.profile_id}/cv-v${row.version}.pdf` ||
    !row.original_filename
  ) {
    throw new Error("invalid_freelancer_cv_metadata");
  }

  return {
    profileId: row.profile_id,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    version: row.version,
  };
}

/** Prevents stored names from becoming a response-header or path payload. */
export function safeCvDownloadFilename(
  originalFilename: string,
  profileId: string,
): string {
  const base = originalFilename
    .normalize("NFKC")
    .replace(/[\r\n\\/]/gu, "-")
    .replace(/[^\p{L}\p{N}._ -]+/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/\.pdf$/iu, "")
    .replace(/^[. -]+/u, "")
    .slice(0, 100)
    .trim();
  return `${base || `freelancer-${profileId.slice(0, 8)}`}.pdf`;
}
