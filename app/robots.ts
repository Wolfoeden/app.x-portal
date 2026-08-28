import type { MetadataRoute } from "next";

import { SITE_URL, INDEXABLE_PATHS, NON_INDEXABLE_PREFIXES } from "@/lib/seo";

/**
 * `x-portal.eu/robots.txt` hat bisher mit 404 geantwortet.
 *
 * Die Indexierungsregeln standen zwar schon in `netlify.toml`, aber als
 * `X-Robots-Tag` — den sieht ein Crawler erst, wenn er die Seite bereits
 * abgerufen hat. Die Datei, die er als Erstes sucht, gab es nicht.
 *
 * Als Route statt als statische Datei, damit sie mit dem Routenbaum wächst
 * und nicht beim nächsten neuen Bereich vergessen wird.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [...INDEXABLE_PATHS],
      // Betreiberbereiche, persönliche Ansichten und alles, was nur mit
      // einem Token sinnvoll ist.
      disallow: [...NON_INDEXABLE_PREFIXES],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
