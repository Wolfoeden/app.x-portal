import { hasAdminRole } from "@/lib/auth/admin-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  /** Kontoname aus der Google- oder Microsoft-Anmeldung; E-Mail-Konten haben keinen. */
  displayName: string | null;
  isAnonymous: boolean;
  isAdmin: boolean;
};

/**
 * Optionale Einschränkung des Admin-Bereichs auf bestimmte Adressen.
 *
 * Die Liste vergibt keine Rechte, sie nimmt sie nur: Ein Konto muss
 * zusätzlich über app_metadata.role oder ADMIN_USER_IDS berechtigt sein. Eine
 * E-Mail-Adresse allein bleibt damit wertlos. Ist ADMIN_ALLOWED_EMAILS nicht
 * gesetzt, entscheidet allein diese Berechtigung.
 */
function allowedAdminEmails(): Set<string> | null {
  const configured = (process.env.ADMIN_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? new Set(configured) : null;
}

function passesAdminEmailRestriction(email: string | null): boolean {
  const allowed = allowedAdminEmails();
  if (!allowed) return true;
  return Boolean(email && allowed.has(email.trim().toLowerCase()));
}

function configuredAdminIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function hasAdminClaim(claims: Record<string, unknown>, userId: string): boolean {
  return hasAdminRole(claims.app_metadata) || configuredAdminIds().has(userId);
}

function displayNameFromClaims(claims: Record<string, unknown>): string | null {
  const metadata = claims.user_metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const { full_name: fullName, name } = metadata as Record<string, unknown>;
  for (const value of [fullName, name]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) return null;

  const id = data.claims.sub;
  const email =
    typeof data.claims.email === "string" ? data.claims.email : null;
  return {
    id,
    email,
    displayName: displayNameFromClaims(data.claims as Record<string, unknown>),
    // A permanent account is security-sensitive state. Fail closed when the
    // required claim is absent or malformed instead of treating it as false.
    isAnonymous: data.claims.is_anonymous !== false,
    // Berechtigt und, falls eine Adressliste gesetzt ist, auf der Liste.
    isAdmin:
      hasAdminClaim(data.claims as Record<string, unknown>, id) &&
      passesAdminEmailRestriction(email),
  };
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Response("Authentication required", { status: 401 });
  }

  return user;
}

export async function requireAdminUser() {
  const user = await requireCurrentUser();
  if (!user.isAdmin || user.isAnonymous) {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}
