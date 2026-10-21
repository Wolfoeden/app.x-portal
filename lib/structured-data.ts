import { IMPRINT_EMAIL, PROVIDER_POSTAL_ADDRESS } from "@/lib/legal/policy";
import { HOME_SERVICES } from "@/lib/marketing/home-services";
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
 * (docs/marketing-seo-phase-1-2.md): die Leistungen der Startseite
 * (KI-Automatisierung, KI-Schulungen, ISMS) und Freelancer finden, auch für
 * KI-Agenten. „DSGVO“ und „ISO 27001“ als Themen, nicht als eigene
 * Zertifikate.
 */
const KNOWS_ABOUT = [
  "KI-Automatisierung",
  "KI im Mittelstand",
  "KI-Schulungen nach EU AI Act",
  "ISMS",
  "ISO 27001",
  "Informationssicherheit",
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
        // Steht auf Startseite und Kontaktseite.
        telephone: SALES_CONTACT.phone,
        // Wie im Impressum.
        address: { "@type": "PostalAddress", ...PROVIDER_POSTAL_ADDRESS },
        // Die Kontaktperson von der Gesprächsseite, mit ihrer Rolle dort.
        employee: { "@type": "Person", name: SALES_CONTACT.name, jobTitle: SALES_CONTACT.role },
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
      // Wie das Logo im Kopf: die Startseite für Unternehmen, nicht die App.
      { "@type": "ListItem", position: 1, name: "XPORTAL", item: absoluteUrl("/") },
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
 * Die Leistungen der Startseite als `Service` mit dem Anbieter von oben,
 * damit Suchmaschinen und KI-Systeme Namen, Seite und Einstiegspreis aus
 * derselben Liste lesen, die Besucher sehen. Ein Preis steht nur, wo die
 * Seite einen nennt.
 */
export function homeServicesStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": HOME_SERVICES.filter((service) => service.schemaDescription).map((service) => ({
      "@type": "Service",
      name: service.title,
      description: service.schemaDescription,
      url: absoluteUrl(service.href),
      provider: { "@id": ORGANIZATION_ID },
      areaServed: AREA_SERVED,
      ...(service.fromEuro === null ? {} : {
        offers: {
          "@type": "Offer",
          url: absoluteUrl(service.href),
          priceCurrency: "EUR",
          price: service.fromEuro,
          priceSpecification: { "@type": "PriceSpecification", minPrice: service.fromEuro, priceCurrency: "EUR" },
        },
      }),
    })),
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
