import type { Metadata } from "next";

import { ChatWorkspace } from "@/components/ChatWorkspace";

export const metadata: Metadata = {
  title: "Gespräche | XPORTAL",
  description: "Der Stand Ihrer Anfragen: angefragt, vorgestellt, beauftragt.",
  // Nur die eigenen Anfragen; über einen Link aus der Mail auch ohne Anmeldung.
  robots: {
    index: false,
    follow: false,
  },
};

export default function ConversationsRoute() {
  return <ChatWorkspace view="conversations" />;
}
