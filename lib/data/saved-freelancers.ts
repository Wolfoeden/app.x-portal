import "server-only";

import type { SavedFreelancer } from "@/components/chat-contract";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * "Mein Team" is account-only. A guest has no durable identity to hang a team
 * on, so the UI sends them to the login dialog instead of writing a row the
 * database would refuse anyway.
 */
export function canSaveFreelancers(user: CurrentUser): boolean {
  return !user.isAnonymous;
}

type Row = {
  freelancer_id: string;
  created_at: string;
  freelancer_profiles: {
    display_name: string;
    role_title: string;
    skill_tags: string[] | null;
    location_text: string | null;
    booking_url: string | null;
    availability_status: string | null;
  } | null;
};

function present(row: Row): SavedFreelancer | null {
  const profile = row.freelancer_profiles;
  // A profile withdrawn from the catalogue leaves the join empty. Skipping it
  // is better than rendering a card with no name.
  if (!profile) return null;
  return {
    id: row.freelancer_id,
    displayName: profile.display_name,
    role: profile.role_title,
    skillTags: profile.skill_tags ?? [],
    location: profile.location_text,
    bookingUrl: profile.booking_url,
    availabilityStatus: profile.availability_status ?? "unknown",
    savedAt: row.created_at,
  };
}

export async function loadSavedFreelancers(
  user: CurrentUser,
): Promise<SavedFreelancer[]> {
  if (!canSaveFreelancers(user)) return [];
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return [];

  // The service role is deliberately constrained again by owner_user_id here,
  // the same way loadOwnedProjects does it.
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("saved_freelancers")
    .select(
      "freelancer_id,created_at,freelancer_profiles(display_name,role_title,skill_tags,location_text,booking_url,availability_status)",
    )
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return ((data ?? []) as unknown as Row[])
    .map(present)
    .filter((entry): entry is SavedFreelancer => entry !== null);
}

export async function saveFreelancer(
  user: CurrentUser,
  freelancerId: string,
): Promise<void> {
  const admin = createAdminSupabaseClient();
  // Marking an already-marked profile is the same intent, not an error.
  const { error } = await admin
    .from("saved_freelancers")
    .upsert(
      { owner_user_id: user.id, freelancer_id: freelancerId },
      { onConflict: "owner_user_id,freelancer_id", ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function removeSavedFreelancer(
  user: CurrentUser,
  freelancerId: string,
): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("saved_freelancers")
    .delete()
    .eq("owner_user_id", user.id)
    .eq("freelancer_id", freelancerId);
  if (error) throw error;
}
