import "server-only";

import { createHash } from "node:crypto";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const GUEST_CLAIM_COOKIE = "xportal_guest_claim";

export function hashGuestClaim(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function consumeGuestClaim(token: string, targetUserId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("claim_guest_workspace", {
    p_token_hash: hashGuestClaim(token),
    p_target_user_id: targetUserId,
  });

  if (error) throw error;
  return data === true;
}
