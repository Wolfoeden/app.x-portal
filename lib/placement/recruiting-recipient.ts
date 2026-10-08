import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
type Admin = ReturnType<typeof createAdminSupabaseClient>;

/** Imported addresses are excluded unless a published application has consent. */
export async function consentingFreelancerEmail(admin: Admin, profileId: string, ownerId: string | null): Promise<string | null> {
  if (ownerId) {
    const { data, error } = await admin.auth.admin.getUserById(ownerId);
    if (error) throw error;
    return data.user?.email_confirmed_at ? data.user.email?.trim() || null : null;
  }
  const { data, error } = await admin.from("freelancer_applications").select("contact_email")
    .eq("published_profile_id", profileId).eq("status", "approved").not("consent_at", "is", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data?.contact_email?.trim() || null;
}
