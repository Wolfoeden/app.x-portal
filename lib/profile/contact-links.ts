/**
 * Die Kurzlinks auf der Profilkarte: LinkedIn und GitHub.
 *
 * Die Adressen erreichen den Browser nie über das Suchergebnis. Die Karte
 * weiß nur, ob es sie gibt (`contactLinks`); geöffnet werden sie über
 * `/api/freelancers/<id>/link?kind=…`, und die Route prüft das Abo. Sonst
 * ließe sich die Abo-Grenze aus dem Seitenquelltext lesen.
 *
 * Ohne Serverabhängigkeit: Karte, Route und Tests lesen dieselben Arten.
 */

export const CONTACT_LINK_KINDS = ["linkedin", "github"] as const;
export type ContactLinkKind = (typeof CONTACT_LINK_KINDS)[number];

export type ContactLinkFlags = Record<ContactLinkKind, boolean>;

export function isContactLinkKind(value: unknown): value is ContactLinkKind {
  return typeof value === "string" && (CONTACT_LINK_KINDS as readonly string[]).includes(value);
}

/**
 * Wohin eine Art weiterleiten darf. Nur der Dienst selbst, damit die Route
 * keine offene Weiterleitung für beliebige Adressen wird.
 */
const CONTACT_LINK_HOSTS: Record<ContactLinkKind, readonly string[]> = {
  linkedin: ["linkedin.com", "www.linkedin.com", "de.linkedin.com"],
  github: ["github.com", "www.github.com"],
};

export function isAllowedContactLink(kind: ContactLinkKind, url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      CONTACT_LINK_HOSTS[kind].includes(parsed.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

/** Die erste zulässige Adresse dieser Art aus `profile_links`, sonst null. */
export function contactLinkTarget(links: unknown, kind: ContactLinkKind): string | null {
  if (!Array.isArray(links)) return null;
  for (const entry of links) {
    const link = entry as { kind?: unknown; url?: unknown } | null;
    if (link?.kind === kind && typeof link.url === "string" && isAllowedContactLink(kind, link.url)) {
      return link.url;
    }
  }
  return null;
}

/** Welche Arten ein Profil hat; nur ja oder nein, nie die Adresse. */
export function contactLinkFlags(links: readonly { kind: string; url: string }[]): ContactLinkFlags {
  return {
    linkedin: contactLinkTarget(links, "linkedin") !== null,
    github: contactLinkTarget(links, "github") !== null,
  };
}
