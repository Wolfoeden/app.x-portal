import type { Metadata, MetadataRoute } from "next";

import { START_CREDITS } from "@/lib/billing/plans";

/** Public URLs, metadata and crawler policy share this registry. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/u, "") ||
  "https://x-portal.eu";

export const SITE_DESCRIPTION =
  "Freelancer finden für Recruiter und Unternehmen: Projekt beschreiben und passende Freelancer-Profile nach nachvollziehbaren Regeln erhalten.";

export type PublicPage = {
  path: `/${string}`;
  label: string;
  title: string;
  description: string;
  /** Für Bing und KI-Crawler; Google wertet das Feld nicht aus. */
  keywords?: readonly string[];
  priority: number;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
};

/**
 * Die Startseite (seit 16.10.2026, Entwurf 3): KI für den Mittelstand mit der
 * Live-Demo des Talent Index. Vorher leitete `/` auf /fuer-unternehmen.
 */
export const HOME_PAGE = {
  path: "/",
  label: "Startseite",
  title: "Mit KI effizienter arbeiten: KI-Agenten, Schulungen, ISO 27001 | XPORTAL",
  description:
    "Sehen Sie live, was unsere KI kann: der Talent Index mit echten Profilen. Dasselbe bauen wir für Ihr Unternehmen – KI-Agenten, KI-Schulungen, Informationssicherheit. Erstgespräch in 30 Minuten.",
  keywords: ["KI im Mittelstand", "KI-Agenten", "KI-Schulung", "EU AI Act Art. 4", "ISO 27001", "Talent Index"],
  priority: 1,
  changeFrequency: "weekly",
} as const satisfies PublicPage;

/**
 * Die Arbeitsfläche. Ihr Titel nennt „Freelancer finden“ bewusst nicht mehr:
 * Für diesen Suchbegriff soll /fuer-unternehmen ranken, nicht zwei eigene
 * Seiten gegeneinander.
 */
export const CHAT_PAGE = {
  path: "/chat",
  label: "Projekt beschreiben",
  title: "Projekt beschreiben und Freelancer-Profile abgleichen | XPORTAL",
  description:
    "Beschreiben Sie Ihr Projekt in einem Satz und erhalten Sie passende Freelancer-Profile — mit Begründung, warum sie passen, und sichtbaren Informationslücken.",
  priority: 0.8,
  changeFrequency: "weekly",
} as const satisfies PublicPage;

export const MARKETING_PAGE = {
  // Der Einstieg in den Talent Index und die Seite für den Suchbegriff
  // „Freelancer finden“. Bis 16.10.2026 auch die Startseite.
  find: {
    path: "/fuer-unternehmen",
    label: "Freelancer finden",
    title: "Freelancer finden für Recruiter und Unternehmen | XPORTAL",
    description: "Freelancer finden für KI-Agenten, Software, SAP: Projekttext einfügen, mit freigegebenen Profilen abgleichen, Belege sehen. Provisionsfrei, 14 Tage testen.",
    keywords: [
      "Freelancer finden",
      "Freelancer Vermittlung",
      "IT-Freelancer finden",
      "KI-Agenten Entwickler",
      "AI Agents Freelancer",
      "DSGVO",
    ],
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
    description: "Was KI-gestütztes Freelancer-Matching bedeutet: strukturierte Anforderungen, Vorauswahl nach inhaltlicher Nähe, KI-Bewertung mit Begründung und klare Grenzen.",
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
  pricing: {
    path: "/preise",
    label: "Preise & Credits",
    title: "Preise & Credits: Basic, Pro, Business und Enterprise | XPORTAL",
    description: `XPORTAL kostenlos mit ${START_CREDITS} Start-Credits testen. Danach Basic, Pro oder Business monatlich nutzen – oder Enterprise nach tatsächlichem Credit-Verbrauch abrechnen.`,
    priority: 0.9,
    changeFrequency: "monthly",
  },
} as const satisfies Record<string, PublicPage>;

export const MARKETING_PAGES = Object.values(MARKETING_PAGE);

/**
 * Kontakt und „Gespräch vereinbaren“ (seit 14.10.2026 eine Seite; /gespraech
 * leitet hierher): Freelancer, KI-Agenten, KI-Schulungen,
 * Informationssicherheit und alle übrigen Anliegen.
 */
export const CONTACT_PAGE = {
  path: "/contact",
  label: "Kontakt",
  title: "Kontakt: Freelancer, KI-Agenten, KI-Schulungen, ISO 27001 | XPORTAL",
  description:
    "Erstgespräch in 30 Minuten: passende Freelancer aus dem Talent Index, KI-Agenten für Kundenservice, Vertrieb und Daten, KI-Schulungen und ISMS nach ISO 27001.",
  priority: 0.9,
  changeFrequency: "monthly",
} as const satisfies PublicPage;

export const SITEMAP_ENTRIES = [
  HOME_PAGE,
  CHAT_PAGE,
  ...MARKETING_PAGES,
  CONTACT_PAGE,
  { path: "/bewerber-portal/apply", priority: 0.7, changeFrequency: "monthly" },
  { path: "/vermittlungsbedingungen", priority: 0.4, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/datenwege", priority: 0.3, changeFrequency: "yearly" },
  { path: "/imprint", priority: 0.3, changeFrequency: "yearly" },
] as const;

export const INDEXABLE_PATHS = SITEMAP_ENTRIES.map((entry) => entry.path);

export const NON_INDEXABLE_PREFIXES = [
  "/api/",
  "/chat/admin/",
  "/mein-team",
  "/gespraeche",
  "/booking/",
  "/auth/",
  // Die Praxisseite kommt per Mail nach einem Anruf, nicht über die Suche.
  "/praxis",
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
    ...(page.keywords ? { keywords: [...page.keywords] } : {}),
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
