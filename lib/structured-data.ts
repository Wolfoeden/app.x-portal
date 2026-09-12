import { IMPRINT_EMAIL } from "@/lib/legal/policy";
import { SITE_DESCRIPTION, SITE_URL, absoluteUrl, type PublicPage } from "@/lib/seo";

export function siteStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": SITE_URL + "/#organization",
        name: "XPORTAL",
        url: SITE_URL,
        logo: absoluteUrl("/brand/xportal-mark.png"),
        email: IMPRINT_EMAIL,
      },
      {
        "@type": "WebSite",
        "@id": SITE_URL + "/#website",
        name: "XPORTAL",
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        inLanguage: "de-DE",
        publisher: { "@id": SITE_URL + "/#organization" },
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

export function serializeStructuredData(data: unknown): string {
  return JSON.stringify(data).replace(/</gu, "\\u003c");
}
