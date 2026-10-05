import { IMPRINT_EMAIL, PROVIDER_POSTAL_ADDRESS } from "@/lib/legal/policy";
import { SALES_CONTACT } from "@/lib/sales/sales-contact-model";
import { SITE_DESCRIPTION, SITE_URL, absoluteUrl, type PublicPage } from "@/lib/seo";

const ORGANIZATION_ID = SITE_URL + "/#organization";

/**
 * Wo XPORTAL arbeitet: Anbieter in Deutschland, Anfragen aus dem
 * deutschsprachigen Raum und der EU. Für Suchmaschinen und KI-Systeme; die
 * Seiten selbst sagen dasselbe in Sätzen.
 */
const AREA_SERVED = [
  { "@type": "Country", name: "Deutschland" },
  { "@type": "Country", name: "Österreich" },
  { "@type": "Country", name: "Schweiz" },
  { "@type": "Place", name: "Europäische Union" },
] as const;

/**
 * Themen, für die XPORTAL steht. Nur, was das Produkt tatsächlich tut
 * (docs/marketing-seo-phase-1-2.md): Freelancer finden und vermitteln, auch
 * für KI-Agenten. „DSGVO“ als Thema, nicht als Zertifikat.
 */
const KNOWS_ABOUT = [
  "Freelancer finden",
  "Freelancer-Vermittlung",
  "IT-Freelancer",
  "KI-Agenten",
  "AI Agents",
  "Entwicklung von KI-Agenten",
  "SAP-Freelancer",
  "Datenschutz nach DSGVO",
] as const;

export function siteStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: "XPORTAL",
        url: SITE_URL,
        logo: absoluteUrl("/brand/xportal-mark.png"),
        email: IMPRINT_EMAIL,
        // Wie im Impressum.
        address: { "@type": "PostalAddress", ...PROVIDER_POSTAL_ADDRESS },
        founder: { "@type": "Person", name: SALES_CONTACT.name },
        areaServed: AREA_SERVED,
        knowsAbout: KNOWS_ABOUT,
      },
      {
        "@type": "WebSite",
        "@id": SITE_URL + "/#website",
        name: "XPORTAL",
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        inLanguage: "de-DE",
        publisher: { "@id": ORGANIZATION_ID },
      },
    ],
  };
}

export function breadcrumbStructuredData(page: PublicPage) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "XPORTAL", item: absoluteUrl("/chat") },
      { "@type": "ListItem", position: 2, name: page.label, item: absoluteUrl(page.path) },
    ],
  };
}

export type ServiceRole = {
  name: string;
  description: string;
  /** Andere Bezeichnungen derselben Rolle, etwa „KI-Agenten“ neben „AI Agents“. */
  alternateNames?: readonly string[];
};

/**
 * Die Leistung der Startseite: Freelancer finden und vorstellen. Rollen und
 * Konditionen kommen von der Seite selbst, damit hier nichts steht, was dort
 * nicht steht.
 */
export function serviceStructuredData({
  page,
  roles,
  offer,
}: {
  page: PublicPage;
  roles: readonly ServiceRole[];
  /** Die Konditionen in einem Satz; ohne: kein Angebot ausgewiesen. */
  offer?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": absoluteUrl(page.path) + "#service",
    name: "Freelancer finden und vermitteln",
    serviceType: "Freelancer-Vermittlung",
    description: page.description,
    url: absoluteUrl(page.path),
    provider: { "@id": ORGANIZATION_ID },
    areaServed: AREA_SERVED,
    availableLanguage: "de",
    audience: {
      "@type": "BusinessAudience",
      audienceType: "Recruiter, Personaldienstleister und Unternehmen",
    },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Gesuchte Rollen",
      itemListElement: roles.map((role) => ({
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: role.name,
          description: role.description,
          ...(role.alternateNames?.length ? { alternateName: [...role.alternateNames] } : {}),
        },
      })),
    },
    ...(offer
      ? { offers: { "@type": "Offer", price: "0", priceCurrency: "EUR", description: offer } }
      : {}),
  };
}

/**
 * Fragen und Antworten, die sichtbar auf der Seite stehen. Google zeigt dafür
 * kaum noch Rich Results; Bing und KI-Suchsysteme lesen sie trotzdem.
 */
export function faqStructuredData(items: readonly { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function serializeStructuredData(data: unknown): string {
  return JSON.stringify(data).replace(/</gu, "\\u003c");
}
