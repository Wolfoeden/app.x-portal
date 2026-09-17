/**
 * Whether Supabase `app_metadata` grants the admin role.
 *
 * Only the service role can write `app_metadata`, so this is a server-side
 * grant, not something a user can set on their own account.
 */
export function hasAdminRole(appMetadata: unknown): boolean {
  if (!appMetadata || typeof appMetadata !== "object") return false;
  const metadata = appMetadata as Record<string, unknown>;
  return (
    metadata.role === "admin" ||
    (Array.isArray(metadata.roles) && metadata.roles.includes("admin"))
  );
}
