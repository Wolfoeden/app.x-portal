import "server-only";

import type { SavedFreelancer } from "@/components/chat-contract";
import type { CurrentUser } from "@/lib/auth/current-user";
import { fetchRealProfilesByIds } from "@/lib/data/freelancers";
import { presentSavedProfile } from "@/lib/presentation/chat";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * "Mein Team" is account-only. A guest has no durable identity to hang a team
 * on, so the UI sends them to the register dialog instead of writing a row the
 * database would refuse anyway.
 */
export function canSaveFreelancers(user: CurrentUser): boolean {
  return !user.isAnonymous;
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
    .select("freelancer_id,created_at")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const rows = (data ?? []) as { freelancer_id: string; created_at: string }[];
  if (!rows.length) return [];

  const profiles = await fetchRealProfilesByIds(
    admin,
    rows.map((row) => row.freelancer_id),
  );
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));

  return rows
    .map((row) => {
      const profile = byId.get(row.freelancer_id);
      // A profile withdrawn from the catalogue drops out rather than becoming
      // a card with no content. The row stays so it reappears if it returns.
      if (!profile) return null;
      return { savedAt: row.created_at, profile: presentSavedProfile(profile) };
    })
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
