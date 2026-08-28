import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  isAdmin: boolean;
};

/**
 * Wer den Admin-Bereich überhaupt sehen darf. Die Liste vergibt keine Rechte,
 * sie nimmt sie nur: ein Konto muss zusätzlich über app_metadata.role oder
 * ADMIN_USER_IDS berechtigt sein. Eine E-Mail-Adresse allein bleibt damit
 * wertlos, auch wenn jemand sie in einem Claim unterschiebt.
 *
 * Über ADMIN_ALLOWED_EMAILS übersteuerbar, damit eine Testumgebung nicht auf
 * die Produktionsadressen angewiesen ist.
 */
const DEFAULT_ADMIN_EMAILS = ["roman@dering.info", "paul@dering.info"];

function allowedAdminEmails(): Set<string> {
  const configured = (process.env.ADMIN_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ADMIN_EMAILS);
}

function isAllowedAdminEmail(email: string | null): boolean {
  if (!email) return false;
  return allowedAdminEmails().has(email.trim().toLowerCase());
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
  const appMetadata = claims.app_metadata;
  if (appMetadata && typeof appMetadata === "object") {
    const metadata = appMetadata as Record<string, unknown>;
    if (metadata.role === "admin") return true;
    if (
      Array.isArray(metadata.roles) &&
      metadata.roles.some((role) => role === "admin")
    ) {
      return true;
    }
  }
  return configuredAdminIds().has(userId);
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
    // A permanent account is security-sensitive state. Fail closed when the
    // required claim is absent or malformed instead of treating it as false.
    isAnonymous: data.claims.is_anonymous !== false,
    // Beide Bedingungen müssen halten: berechtigt *und* auf der Liste.
    isAdmin:
      hasAdminClaim(data.claims as Record<string, unknown>, id) &&
      isAllowedAdminEmail(email),
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
