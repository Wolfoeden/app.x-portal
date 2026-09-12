import type { Metadata, MetadataRoute } from "next";

/** Public URLs, metadata and crawler policy share this registry. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/u, "") ||
  "https://x-portal.eu";

export const SITE_DESCRIPTION =
  "Beschreiben Sie Ihr Projekt im Dialog und erhalten Sie passende Freelancer-Profile nach nachvollziehbaren Regeln.";

export type PublicPage = {
  path: `/${string}`;
  label: string;
  title: string;
  description: string;
  priority: number;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
};

export const CHAT_PAGE = {
  path: "/chat",
  label: "Projekt beschreiben",
  title: "Freelancer finden – Profile mit Match-Begründung | XPORTAL",
  description:
    "Beschreiben Sie Ihr Projekt in einem Satz und erhalten Sie passende Freelancer-Profile — mit Begründung, warum sie passen, und sichtbaren Informationslücken.",
  priority: 1,
  changeFrequency: "weekly",
} as const satisfies PublicPage;

export const MARKETING_PAGE = {
  find: {
    path: "/freelancer-finden",
    label: "Freelancer finden",
    title: "Freelancer finden für Ihr Projekt | XPORTAL",
    description: "Beschreiben Sie Ihr Projekt und finden Sie Freelancer anhand Ihrer Anforderungen. XPORTAL zeigt Match-Gründe und offene Fragen. Ohne Anmeldung starten.",
    priority: 0.9,
    changeFrequency: "monthly",
  },
  it: {
    path: "/it-freelancer-finden",
    label: "IT-Freelancer finden",
    title: "IT-Freelancer finden: Skills und Projektanforderungen | XPORTAL",
    description: "IT-Freelancer für SAP, Softwareentwicklung oder KI-Projekte suchen. Anforderungen beschreiben, Profilinformationen abgleichen und Match-Gründe nachvollziehen.",
    priority: 0.9,
    changeFrequency: "monthly",
  },
  matching: {
    path: "/ki-freelancer-matching",
    label: "KI-Freelancer-Matching",
    title: "KI-Freelancer-Matching verständlich erklärt | XPORTAL",
    description: "Was KI-gestütztes Freelancer-Matching bedeutet: strukturierte Anforderungen, regelbasierter Profilabgleich, nachvollziehbare Begründungen und klare Grenzen.",
    priority: 0.8,
    changeFrequency: "monthly",
  },
  how: {
    path: "/wie-funktioniert-xportal",
    label: "So funktioniert XPORTAL",
    title: "Wie funktioniert XPORTAL? Ablauf, Matches und Credits",
    description: "Vom Projekttext zur Profilauswahl: So strukturiert XPORTAL Anforderungen, erklärt Matches und zeigt Informationslücken. Mit Ablauf und aktuellen Credit-Kosten.",
    priority: 0.8,
    changeFrequency: "monthly",
  },
} as const satisfies Record<string, PublicPage>;

export const MARKETING_PAGES = Object.values(MARKETING_PAGE);

export const SITEMAP_ENTRIES = [
  CHAT_PAGE,
  ...MARKETING_PAGES,
  { path: "/agent", priority: 0.8, changeFrequency: "weekly" },
  { path: "/freelancer/apply", priority: 0.7, changeFrequency: "monthly" },
  { path: "/cardano", priority: 0.5, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.4, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/imprint", priority: 0.3, changeFrequency: "yearly" },
] as const;

export const INDEXABLE_PATHS = SITEMAP_ENTRIES.map((entry) => entry.path);

export const NON_INDEXABLE_PREFIXES = [
  "/api/",
  "/chat/admin/",
  "/mein-team",
  "/booking/",
  "/whitelist/",
  "/auth/",
  // Consistent with the existing noindex headers for /chat/* in netlify.toml.
  "/chat/",
] as const;

/** Cover bare directory URLs too; keep /chat itself indexable. */
export const ROBOTS_DISALLOW_PATHS = [
  ...NON_INDEXABLE_PREFIXES,
  ...NON_INDEXABLE_PREFIXES
    .filter((prefix) => prefix.endsWith("/") && prefix !== "/chat/")
    .flatMap((prefix) => [
      prefix.slice(0, -1) + "$",
      prefix.slice(0, -1) + "?*",
    ]),
];

/**
 * Independent policies. Preserve the public access previously inherited from
 * '*'; no new training opt-out is assumed. Search access promises no ranking.
 * Google-Extended controls Gemini training AND grounding, not Google Search.
 */
export const AI_CRAWLER_POLICY = {
  "OAI-SearchBot": "allow-public",
  GPTBot: "allow-public",
  "Google-Extended": "allow-public",
} as const satisfies Record<string, "allow-public" | "disallow">;

export function absoluteUrl(path: string): string {
  return SITE_URL + path;
}

export function pageMetadata(page: PublicPage): Metadata {
  const url = absoluteUrl(page.path);
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "de_DE",
      siteName: "XPORTAL",
      title: page.title,
      description: page.description,
      url,
    },
  };
}
