import type { Metadata } from "next";

import { ChatWorkspace } from "@/components/ChatWorkspace";

export const metadata: Metadata = {
  title: "Freelancer finden | XPORTAL",
  description:
    "Beschreiben Sie Ihr Projekt im Chat und erhalten Sie eine nachvollziehbare Auswahl passender Freelancer.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ChatPage() {
  return <ChatWorkspace />;
}
