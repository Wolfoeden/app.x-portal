import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  isAdmin: boolean;
};

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
  return {
    id,
    email:
      typeof data.claims.email === "string" ? data.claims.email : null,
    isAnonymous: data.claims.is_anonymous === true,
    isAdmin: hasAdminClaim(data.claims as Record<string, unknown>, id),
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
