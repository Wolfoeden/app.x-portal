/** Höchstlänge eines selbst eingetragenen Kontonamens. */
export const ACCOUNT_NAME_MAX_LENGTH = 80;

/**
 * Der Name, der in Seitenleiste und Kontokarte steht: der gespeicherte, sonst
 * der Teil der E-Mail-Adresse vor dem @. Die Begrüßung nutzt nur den
 * gespeicherten — „Guten Tag, info" wäre schlimmer als „Recruiter".
 */
export function shownAccountName(displayName: string | null, email: string | null): string | null {
  return displayName ?? (email?.split("@")[0]?.trim() || null);
}

/**
 * Der Anzeigename eines Kontos aus den Supabase-`user_metadata`.
 *
 * Ein selbst eingetragener Name (`display_name`) geht vor; sonst gilt, was
 * Google oder Microsoft bei der Anmeldung mitgeben. Jeder Nutzer kann die
 * Metadaten seines eigenen Kontos schreiben, deshalb wird hier gekürzt statt
 * vertraut.
 */
export function accountNameFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const { display_name: displayName, full_name: fullName, name } =
    metadata as Record<string, unknown>;
  for (const value of [displayName, fullName, name]) {
    if (typeof value === "string" && value.trim()) {
      return value.trim().slice(0, ACCOUNT_NAME_MAX_LENGTH);
    }
  }
  return null;
}
