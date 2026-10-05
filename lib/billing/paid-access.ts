import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { hasPaidAccess } from "./paid-plan";

/**
 * Hat dieses Konto gerade einen bezahlten Tarif? Liest Tarif und Abo-Zustand
 * aus `user_ai_credit_accounts`, wie sie der Stripe-Webhook schreibt.
 */
export async function userHasPaidAccess(userId: string): Promise<boolean> {
  const { data, error } = await createAdminSupabaseClient()
    .from("user_ai_credit_accounts")
    .select("plan_id,stripe_subscription_status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { plan_id?: string | null; stripe_subscription_status?: string | null } | null;
  return hasPaidAccess(row?.plan_id, row?.stripe_subscription_status);
}
