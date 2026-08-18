import type { Metadata } from "next";

import { agentCatalog } from "@/components/AgentDirectory";
import { ChatWorkspace } from "@/components/ChatWorkspace";

export const metadata: Metadata = {
  title: "KI-Agenten & EU-Verpackungsverfolgung für Händler | XPORTAL",
  description:
    "Spezialisierte KI-Agenten für Projektmanagement, Research, Datenvisualisierung, Customer Experience, Creative Direction und EU-Verpackungsverfolgung für Händler.",
  keywords: [
    "KI-Agenten",
    "AI Agents",
    "EU Verpackungsverfolgung Händler",
    "Verpackungsdaten EU",
    "Marketing Research Agent",
    "Datenvisualisierung Agent",
    "Customer Experience Agent",
  ],
  alternates: {
    canonical: "https://x-portal.eu/agent",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    url: "https://x-portal.eu/agent",
    title: "Spezialisierte KI-Agenten | XPORTAL",
    description:
      "Funktionale KI-Agenten und transparente Ready-To-Run Tasks – einschließlich EU-Verpackungsverfolgung für Händler.",
    siteName: "XPORTAL",
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Spezialisierte KI-Agenten",
  url: "https://x-portal.eu/agent",
  description:
    "KI-Agenten für Projektsteuerung, Research, Datenvisualisierung, Customer Experience, Creative Direction und EU-Verpackungsverfolgung für Händler.",
  mainEntity: {
    "@type": "ItemList",
    itemListElement: agentCatalog.map((agent, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Service",
        name: agent.title,
        description: agent.summary,
        provider: {
          "@type": "Organization",
          name: "XPORTAL",
          url: "https://x-portal.eu",
        },
      },
    })),
  },
};

export default function AgentPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</gu, "\\u003c"),
        }}
      />
      <ChatWorkspace view="agents" />
    </>
  );
}
