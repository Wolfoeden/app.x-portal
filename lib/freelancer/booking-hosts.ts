/**
 * Welche Buchungsziele ohne Zwischenschritt erreichbar sind.
 *
 * `/api/freelancers/<id>/book` hat bisher auf jede HTTPS-Adresse aus
 * `booking_url` weitergeleitet. Geprüft wurde nur das Schema, nicht der Host —
 * damit ließ sich hinter einem Link auf x-portal.eu jedes beliebige Ziel
 * verbergen. Genau das macht offene Weiterleitungen für Phishing wertvoll: Die
 * sichtbare Domain gehört uns, und Mail-Filter kennen sie.
 *
 * Die Liste sperrt niemanden aus. Ein Ziel, das nicht daraufsteht, ist weiter
 * erreichbar — nur nicht mehr blind, sondern über eine Seite, die die volle
 * Adresse zeigt und einen Klick verlangt.
 */

/** Die Dienste, die in der Praxis hinterlegt werden. */
const DEFAULT_ALLOWED_BOOKING_HOSTS = [
  "calendly.com",
  "cal.com",
] as const;

function configuredHosts(): readonly string[] {
  const configured = (process.env.BOOKING_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_ALLOWED_BOOKING_HOSTS;
}

export function allowedBookingHosts(): readonly string[] {
  return configuredHosts();
}

/**
 * Der Host muss der Eintrag selbst oder eine seiner Subdomains sein.
 * `endsWith` allein würde `evilcalendly.com` durchlassen, deshalb der Punkt.
 */
export function isAllowedBookingHost(url: string): boolean {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    host = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }

  return configuredHosts().some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

/** Die Adresse, wie sie einem Menschen auf der Zwischenseite gezeigt wird. */
export function bookingDestinationLabel(url: string): {
  host: string;
  full: string;
} | null {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname, full: parsed.toString() };
  } catch {
    return null;
  }
}
