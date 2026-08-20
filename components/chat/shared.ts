/**
 * Helpers shared between the workspace and the pieces split out of it.
 *
 * They live here rather than in ChatWorkspace so an extracted component can
 * use them without importing back into the file it came from.
 */

/** Provider buttons appear only where the Supabase provider is configured. */
export const GOOGLE_AUTH_ENABLED =
  process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true";
export const MICROSOFT_AUTH_ENABLED =
  process.env.NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED === "true";

export type AuthDialogMode = "login" | "register" | "recover" | "set-password";

export type ToastState = {
  id: number;
  message: string;
  tone: "neutral" | "error";
};

/** Up to two initials for an avatar, with a neutral fallback. */
export function initials(name: string) {
  const result = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return result || "P";
}
