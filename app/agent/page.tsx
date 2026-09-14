import type { Metadata } from "next";

import { agentCatalog } from "@/components/AgentDirectory";
import { ChatWorkspace } from "@/components/ChatWorkspace";

export const metadata: Metadata = {
  title: "KI-Agenten für Recherche, Planung und Datenarbeit | XPORTAL",
  description:
    "Konkrete KI-Aufgabenvorlagen mit benanntem Ausgangspunkt, Ergebnis und Grenzen. Vorlagen starten keine autonome oder externe Aktion.",
  keywords: [
    "KI-Agenten",
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
      "Konkrete KI-Aufgaben mit transparentem Ausgangspunkt, Ergebnis und Grenzen. Noch keine autonome Ausführung.",
    siteName: "XPORTAL",
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Spezialisierte KI-Agenten",
  url: "https://x-portal.eu/agent",
  description:
    "Konkrete KI-Aufgabenvorlagen für Projektsteuerung, Research, Datenvisualisierung, Customer Experience, Creative Direction und Compliance.",
  mainEntity: {
    "@type": "ItemList",
    itemListElement: agentCatalog.map((agent, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Service",
        name: agent.title,
        description: agent.tasks
          .map((task) => `${task.title}: ${task.outcome}`)
          .join(" "),
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
