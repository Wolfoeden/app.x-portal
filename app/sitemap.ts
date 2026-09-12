import type { MetadataRoute } from "next";

import { SITEMAP_ENTRIES, absoluteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  // A deployment is not a content update. Omit lastModified until a page has
  // a maintained editorial date; do not manufacture freshness on each build.
  return SITEMAP_ENTRIES.map((entry) => ({
    url: absoluteUrl(entry.path),
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
