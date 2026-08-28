import type { MetadataRoute } from "next";

import { SITE_URL, SITEMAP_ENTRIES } from "@/lib/seo";

/**
 * Die Sitemap zieht ihre Liste aus `lib/seo.ts`, damit sie sich nicht von
 * robots.txt unterscheiden kann.
 *
 * `lastModified` steht bewusst auf dem Deploy-Zeitpunkt und nicht auf einem
 * festen Datum: Ein Datum, das nie altert, ist für einen Crawler dasselbe wie
 * kein Datum.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return SITEMAP_ENTRIES.map((entry) => ({
    url: `${SITE_URL}${entry.path}`,
    lastModified,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
