/**
 * Was öffentlich auffindbar sein soll — und was nicht.
 *
 * Die Liste steht hier statt in `robots.ts` und `sitemap.ts` getrennt, weil
 * die beiden sonst auseinanderlaufen: eine Seite, die in der Sitemap steht,
 * aber von robots.txt gesperrt ist, ist ein Widerspruch, den niemand bemerkt.
 */

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/u, "") ||
  "https://x-portal.eu";

/**
 * Öffentliche Seiten mit ihrer Änderungshäufigkeit. `/chat` ist die
 * Landingpage des Produkts und muss indexierbar bleiben; seine
 * Betreiber-Unterseiten stehen unten in der Sperrliste.
 */
export const SITEMAP_ENTRIES = [
  { path: "/chat", priority: 1, changeFrequency: "weekly" },
  { path: "/agent", priority: 0.8, changeFrequency: "weekly" },
  { path: "/freelancer/apply", priority: 0.7, changeFrequency: "monthly" },
  { path: "/cardano", priority: 0.5, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.4, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/imprint", priority: 0.3, changeFrequency: "yearly" },
] as const;

export const INDEXABLE_PATHS = SITEMAP_ENTRIES.map((entry) => entry.path);

/**
 * Gesperrt, jeweils mit Grund:
 * - `/api/` liefert keine Seiten.
 * - `/chat/admin/` ist der Betreiberbereich.
 * - `/mein-team` zeigt nur die eigene Merkliste.
 * - `/booking/` und `/whitelist/` sind Zwischenseiten, die nur mit einer ID
 *   oder einem Token Sinn ergeben.
 * - `/auth/` sind Übergangsseiten der Anmeldung.
 */
export const NON_INDEXABLE_PREFIXES = [
  "/api/",
  "/chat/admin/",
  "/mein-team",
  "/booking/",
  "/whitelist/",
  "/auth/",
] as const;
