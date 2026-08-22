import type { Metadata } from "next";

import { ChatWorkspace } from "@/components/ChatWorkspace";

export const metadata: Metadata = {
  title: "Freelancer finden – Profile mit Match-Begründung | XPORTAL",
  description:
    "Beschreiben Sie Ihr Projekt in einem Satz und erhalten Sie passende Freelancer-Profile — mit Begründung, warum sie passen, und sichtbaren Informationslücken.",
  alternates: {
    canonical: "https://x-portal.eu/chat",
  },
  // The landing page for the product, so it is indexable. The operator routes
  // under /chat/* keep their noindex header in netlify.toml.
  robots: {
    index: true,
    follow: true,
  },
};

export default function ChatPage() {
  return <ChatWorkspace />;
}
