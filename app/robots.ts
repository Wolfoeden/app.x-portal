import type { MetadataRoute } from "next";

import {
  AI_CRAWLER_POLICY,
  INDEXABLE_PATHS,
  ROBOTS_DISALLOW_PATHS,
  SITE_URL,
  absoluteUrl,
} from "@/lib/seo";

function publicRules(userAgent: string) {
  return {
    userAgent,
    allow: INDEXABLE_PATHS.map((path) => path + "$"),
    disallow: [...ROBOTS_DISALLOW_PATHS],
  };
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      publicRules("*"),
      ...Object.entries(AI_CRAWLER_POLICY).map(
        ([userAgent, policy]: [string, "allow-public" | "disallow"]) =>
          policy === "disallow"
            ? { userAgent, disallow: ["/"] }
            : publicRules(userAgent),
      ),
    ],
    // Specific bot groups do not inherit '*': each repeats the private rules.
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}
