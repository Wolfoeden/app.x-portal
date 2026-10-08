/**
 * Einwilligung für optionale Dienste und das Google-Ads-Tag.
 *
 * Bis Oktober 2026 setzte XPORTAL nur notwendige Cookies; das Banner war eine
 * Kenntnisnahme ohne Wahl. Mit dem Google-Ads-Tag gibt es den ersten Dienst,
 * der nach § 25 Abs. 1 TDDDG erst nach einer Einwilligung laden darf.
 *
 * Ohne Server- und ohne React-Abhängigkeit: Banner, Tag und Tests lesen
 * dieselben Regeln.
 */

/** Die ID aus Google Ads, nur im Produktionskontext gesetzt (netlify.toml). */
export function googleAdsId(): string | null {
  const value = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() ?? "";
  return /^AW-\d{6,15}$/u.test(value) ? value : null;
}

/**
 * Gibt es überhaupt etwas zu entscheiden? Ohne ID (lokal, Deploy-Vorschau)
 * bleibt das Banner eine Kenntnisnahme — eine Zustimmung, die nichts
 * aktiviert, wäre eine Scheinwahl.
 */
export function optionalServicesAvailable(): boolean {
  return googleAdsId() !== null || process.env.NEXT_PUBLIC_PRODUCT_ANALYTICS_ENABLED === "true";
}

export type ConsentChoice = "all" | "essential";

export const CONSENT_COOKIE = "xportal_cookie_consent";
/** Ausgelöst, wenn eine Wahl gespeichert wird; `detail` ist die neue Wahl. */
export const CONSENT_CHANGED_EVENT = "xportal:consent-changed";
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

/**
 * Die Fassung der Wahl. Bis Oktober 2026 hieß der Wert nur `all` oder
 * `essential`, und beides bedeutete „Verstanden“: Es gab nichts zuzustimmen.
 * Eine solche Kenntnisnahme ist keine Einwilligung in Werbemessung, deshalb
 * gilt sie als „noch keine Wahl“, und das Banner fragt einmal neu.
 */
// The new product funnel is a changed purpose. Earlier advertising consent is
// never silently reused for it; ask once for this version's stated purposes.
const CONSENT_VERSION = "v3";

export function consentCookieValue(choice: ConsentChoice): string {
  return `${CONSENT_VERSION}.${choice}`;
}

/** Die gespeicherte Wahl aus einem Cookie-String, sonst null. */
export function parseConsent(cookieHeader: string): ConsentChoice | null {
  const value = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);
  if (value === consentCookieValue("all")) return "all";
  if (value === consentCookieValue("essential")) return "essential";
  return null;
}

/** Betreiberseiten messen nicht; dort sieht niemand eine Anzeige. */
const UNTRACKED_PATH = /^\/chat\/admin(?:\/|$)/u;

export function adsTagAllowed(input: {
  consent: ConsentChoice | null;
  pathname: string;
  id: string | null;
}): boolean {
  return input.consent === "all" && input.id !== null && !UNTRACKED_PATH.test(input.pathname);
}

/** Die Erstanbieter-Cookies des Google-Ads-Tags; beim Widerruf zu löschen. */
export const GOOGLE_ADS_COOKIES = ["_gcl_au", "_gcl_aw", "_gcl_dc", "_gcl_gb", "_gcl_gs", "_gcl_ag"] as const;
