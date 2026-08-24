import "server-only";

import { candidateFacts } from "./facts";
import { MAX_FACTS_PER_COLUMN } from "./limits";
import type {
  EditableFreelancerProfile,
  FreelancerMetrics,
  FreelancerPortalState,
  FreelancerProfileUpdate,
} from "./portal";
import {
  AVATAR_BUCKET,
  inspectUploadedAvatar,
  verifyAvatarObjectPath,
} from "./avatar-storage";
import { publicAvatarUrl } from "./avatar-limits";
import { CV_BUCKET } from "./limits";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type ProfileRow = {
  id: string;
  owner_user_id: string | null;
  display_name: string;
  role_title: string;
  skill_tags: string[];
  languages: string[];
  location_text: string | null;
  work_modes: Array<"remote" | "on_site" | "hybrid">;
  experience_summary: string;
  verified_facts: string[];
  self_reported_facts: string[];
  verification_status: string;
  hourly_rate_minor: number | null;
  day_rate_minor: number | null;
  currency: "EUR" | "USD" | "GBP" | null;
  profile_status: "active" | "paused" | "unavailable" | "archived";
  availability_status: "available" | "limited" | "unavailable" | "unknown";
  availability_from: string | null;
  booking_url: string | null;
  avatar_path: string | null;
  version: number;
};

const PROFILE_COLUMNS =
  "id,owner_user_id,display_name,role_title,skill_tags,languages,location_text,work_modes,experience_summary,verified_facts,self_reported_facts,verification_status,hourly_rate_minor,day_rate_minor,currency,profile_status,availability_status,availability_from,booking_url,avatar_path,version";

function valuesWithPrefix(values: readonly string[], prefix: string): string[] {
  const expected = `${prefix.toLocaleLowerCase("en-US")}:`;
  return values.flatMap((entry) => {
    const separator = entry.indexOf(":");
    if (separator < 0) return [];
    if (
      entry.slice(0, separator + 1).trim().toLocaleLowerCase("en-US") !==
      expected
    ) {
      return [];
    }
    const value = entry.slice(separator + 1).trim();
    return value ? [value] : [];
  });
}

function mapEditableProfile(row: ProfileRow): EditableFreelancerProfile {
  const facts = [...row.verified_facts, ...row.self_reported_facts];
  const prefixedSkills = valuesWithPrefix(row.skill_tags, "Skill");
  return {
    id: row.id,
    displayName: row.display_name,
    roleTitle: row.role_title,
    experienceSummary: row.experience_summary,
    skills: prefixedSkills.length ? prefixedSkills : row.skill_tags,
    languages: row.languages,
    qualifications: valuesWithPrefix(facts, "Qualification"),
    industries: valuesWithPrefix(row.skill_tags, "Industry"),
    locationText: row.location_text,
    workModes: row.work_modes,
    hourlyRate:
      row.hourly_rate_minor === null ? null : row.hourly_rate_minor / 100,
    dayRate: row.day_rate_minor === null ? null : row.day_rate_minor / 100,
    currency: row.currency ?? "EUR",
    availabilityStatus: row.availability_status,
    availabilityFrom: row.availability_from,
    bookingUrl: row.booking_url ?? "",
    profileStatus: row.profile_status === "active" ? "active" : "paused",
    verificationStatus: row.verification_status,
    avatarUrl: publicAvatarUrl(row.avatar_path),
    version: row.version,
  };
}

async function countEvents(
  profileId: string,
  eventType: "profile_view" | "booking_click",
  since?: string,
): Promise<number> {
  const admin = createAdminSupabaseClient();
  let query = admin
    .from("freelancer_profile_events")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("event_type", eventType);
  if (since) query = query.gte("occurred_at", since);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function loadFreelancerMetrics(
  profileId: string,
): Promise<FreelancerMetrics> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
  const [profileViewsTotal, profileViews30Days, bookingClicksTotal, bookingClicks30Days] =
    await Promise.all([
      countEvents(profileId, "profile_view"),
      countEvents(profileId, "profile_view", since),
      countEvents(profileId, "booking_click"),
      countEvents(profileId, "booking_click", since),
    ]);
  return {
    profileViewsTotal,
    profileViews30Days,
    bookingClicksTotal,
    bookingClicks30Days,
  };
}

export async function loadFreelancerPortalState(
  userId: string,
): Promise<FreelancerPortalState> {
  const admin = createAdminSupabaseClient();
  const { data: profile, error: profileError } = await admin
    .from("freelancer_profiles")
    .select(PROFILE_COLUMNS)
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (profile) {
    const row = profile as ProfileRow;
    return {
      kind: "profile",
      profile: mapEditableProfile(row),
      metrics: await loadFreelancerMetrics(row.id),
    };
  }

  const { data: application, error: applicationError } = await admin
    .from("freelancer_applications")
    .select("status,updated_at")
    .eq("submitted_by_user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (applicationError) throw applicationError;
  if (application) {
    return {
      kind: "application",
      status: application.status,
      updatedAt: application.updated_at,
    } as FreelancerPortalState;
  }
  return { kind: "apply" };
}

export async function updateOwnedFreelancerProfile(
  userId: string,
  input: FreelancerProfileUpdate,
): Promise<EditableFreelancerProfile> {
  const admin = createAdminSupabaseClient();
  const { data: current, error: currentError } = await admin
    .from("freelancer_profiles")
    .select(PROFILE_COLUMNS)
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new Response("Profil nicht gefunden.", { status: 404 });

  const row = current as ProfileRow;
  if (row.version !== input.version) {
    throw new Response("Das Profil wurde zwischenzeitlich geändert.", {
      status: 409,
    });
  }

  const candidate = candidateFacts({
    skills: input.skills,
    languages: input.languages,
    qualifications: input.qualifications,
    industries: input.industries,
    locationText: input.locationText,
    experienceSummary: input.experienceSummary,
  }).map((entry) => entry.fact);
  const stillVerified = new Set(row.verified_facts);
  const verifiedFacts = candidate
    .filter((entry) => stillVerified.has(entry))
    .slice(0, MAX_FACTS_PER_COLUMN);
  const selfReportedFacts = candidate
    .filter((entry) => !stillVerified.has(entry))
    .slice(0, MAX_FACTS_PER_COLUMN);
  const hourlyRateMinor =
    input.hourlyRate === null ? null : Math.round(input.hourlyRate * 100);
  const dayRateMinor =
    input.dayRate === null ? null : Math.round(input.dayRate * 100);
  const now = new Date().toISOString();

  const { data: updated, error } = await admin
    .from("freelancer_profiles")
    .update({
      display_name: input.displayName,
      role_title: input.roleTitle,
      skill_tags: [
        ...input.skills.map((value) => `Skill: ${value}`),
        ...input.industries.map((value) => `Industry: ${value}`),
      ],
      languages: input.languages,
      location_text: input.locationText,
      work_modes: input.workModes,
      experience_summary: input.experienceSummary,
      verified_facts: verifiedFacts,
      self_reported_facts: selfReportedFacts,
      hourly_rate_minor: hourlyRateMinor,
      day_rate_minor: dayRateMinor,
      currency: input.currency,
      availability_status: input.availabilityStatus,
      availability_from: input.availabilityFrom,
      availability_updated_at: now,
      booking_url: input.bookingUrl,
      profile_status: input.profileStatus,
      version: input.version + 1,
    })
    .eq("id", row.id)
    .eq("owner_user_id", userId)
    .eq("version", input.version)
    .select(PROFILE_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!updated) {
    throw new Response("Das Profil wurde zwischenzeitlich geändert.", {
      status: 409,
    });
  }
  return mapEditableProfile(updated as ProfileRow);
}

export async function attachOwnedAvatar(input: {
  userId: string;
  profileId: string;
  objectPath: string;
  token: string;
}): Promise<string> {
  const admin = createAdminSupabaseClient();
  if (
    !verifyAvatarObjectPath(input.profileId, input.objectPath, input.token)
  ) {
    throw new Response("Der Bild-Upload ist ungültig.", { status: 400 });
  }

  const { data: profile, error: profileError } = await admin
    .from("freelancer_profiles")
    .select("id,avatar_path,version")
    .eq("id", input.profileId)
    .eq("owner_user_id", input.userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new Response("Profil nicht gefunden.", { status: 404 });

  const inspected = await inspectUploadedAvatar(admin, input.objectPath);
  if (!inspected) {
    await admin.storage.from(AVATAR_BUCKET).remove([input.objectPath]);
    throw new Response("Die Datei ist kein gültiges Profilbild.", {
      status: 400,
    });
  }

  const previous = profile.avatar_path as string | null;
  const { data: updated, error: updateError } = await admin
    .from("freelancer_profiles")
    .update({
      avatar_path: input.objectPath,
      version: Number(profile.version) + 1,
    })
    .eq("id", input.profileId)
    .eq("owner_user_id", input.userId)
    .eq("version", profile.version)
    .select("avatar_path")
    .maybeSingle();
  if (updateError || !updated) {
    await admin.storage.from(AVATAR_BUCKET).remove([input.objectPath]);
    if (updateError) throw updateError;
    throw new Response("Das Profil wurde zwischenzeitlich geändert.", {
      status: 409,
    });
  }
  if (previous && previous !== input.objectPath) {
    await admin.storage.from(AVATAR_BUCKET).remove([previous]);
  }
  return publicAvatarUrl(input.objectPath) ?? "";
}

export async function removeOwnedAvatar(
  userId: string,
): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const { data: profile, error } = await admin
    .from("freelancer_profiles")
    .select("id,avatar_path,version")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile) throw new Response("Profil nicht gefunden.", { status: 404 });
  if (!profile.avatar_path) return false;

  const { data: hidden, error: hideError } = await admin
    .from("freelancer_profiles")
    .update({ avatar_path: null, version: Number(profile.version) + 1 })
    .eq("id", profile.id)
    .eq("owner_user_id", userId)
    .eq("version", profile.version)
    .select("id")
    .maybeSingle();
  if (hideError) throw hideError;
  if (!hidden) {
    throw new Response("Das Profil wurde zwischenzeitlich geändert.", {
      status: 409,
    });
  }
  const { error: storageError } = await admin.storage
    .from(AVATAR_BUCKET)
    .remove([profile.avatar_path]);
  if (storageError) throw storageError;
  return true;
}

export async function deleteOwnedFreelancerProfile(
  userId: string,
): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const { data: profile, error } = await admin
    .from("freelancer_profiles")
    .select("id,avatar_path")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return false;

  const { error: hideError } = await admin
    .from("freelancer_profiles")
    .update({ profile_status: "archived", booking_url: null })
    .eq("id", profile.id)
    .eq("owner_user_id", userId);
  if (hideError) throw hideError;

  const { data: cv, error: cvError } = await admin
    .from("freelancer_cv_documents")
    .select("storage_path")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (cvError) throw cvError;

  if (profile.avatar_path) {
    const { error: avatarError } = await admin.storage
      .from(AVATAR_BUCKET)
      .remove([profile.avatar_path]);
    if (avatarError) throw avatarError;
  }
  if (cv?.storage_path) {
    const { error: cvStorageError } = await admin.storage
      .from(CV_BUCKET)
      .remove([cv.storage_path]);
    if (cvStorageError) throw cvStorageError;
  }

  const { data: deleted, error: deletionError } = await admin.rpc(
    "delete_freelancer_profile_cascade",
    { p_profile_id: profile.id },
  );
  if (deletionError) throw deletionError;
  return deleted === true;
}

export async function recordFreelancerProfileEvent(input: {
  eventKey: string;
  profileId: string;
  eventType: "profile_view" | "booking_click";
  source: "profile_card" | "booking_link";
}): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const { data: profile, error: profileError } = await admin
    .from("freelancer_profiles")
    .select("id")
    .eq("id", input.profileId)
    .eq("demo_status", "real")
    .eq("profile_status", "active")
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return false;

  const { error } = await admin.from("freelancer_profile_events").insert({
    event_key: input.eventKey,
    profile_id: input.profileId,
    event_type: input.eventType,
    source: input.source,
  });
  if (error && error.code !== "23505") throw error;
  return !error;
}

export async function loadBookingDestination(
  profileId: string,
): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("freelancer_profiles")
    .select("booking_url")
    .eq("id", profileId)
    .eq("demo_status", "real")
    .eq("profile_status", "active")
    .in("availability_status", ["available", "limited", "unknown"])
    .maybeSingle();
  if (error) throw error;
  if (!data?.booking_url) return null;
  try {
    const url = new URL(data.booking_url);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
