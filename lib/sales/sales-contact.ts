import "server-only";

import { avatarImageUrl } from "@/lib/freelancer/avatar-limits";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { SALES_CONTACT } from "./sales-contact-model";

/**
 * Die Adresse des Fotos für die Ansprechpartner-Karte, oder `null`.
 *
 * Wirft nie: Ohne Datenbank, in einer Datenbank ohne dieses Profil oder
 * wenn das Profil kein Foto hat, zeigt die Karte die Initialen.
 */
export async function salesContactPhotoUrl(): Promise<string | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return null;
  try {
    const { data, error } = await createAdminSupabaseClient()
      .from("freelancer_profiles")
      .select("avatar_path")
      .eq("id", SALES_CONTACT.profileId)
      .maybeSingle();
    if (error || !data) return null;
    return avatarImageUrl((data as { avatar_path: string | null }).avatar_path);
  } catch {
    return null;
  }
}
