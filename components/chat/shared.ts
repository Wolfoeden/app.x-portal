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

/** Narrows an unknown payload before reading fields off it. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A trimmed non-empty string, or null — blank and missing mean the same. */
export function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function formatCredits(value: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(
    value,
  );
}

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
